"""Incident lifecycle: create, list, decisions, OFR bookmarks, annotations,
re-analysis, file-serving, and text-only AI analysis."""
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import HTTPException, Query, Request, Response
from pydantic import BaseModel

from ai_engine import brain_engine
from auth import get_current_user, get_optional_user, require_role
from booth import get_booth_id, get_booth_label
from core import (
    DecisionStatus,
    IncidentType,
    api_router,
    db,
    invalidate_health_cache,
)
from storage import generate_upload_path, get_object, put_object
from websocket_manager import ws_manager

logger = logging.getLogger("octon.incidents")


class IncidentCreate(BaseModel):
    match_id: Optional[str] = None
    incident_type: IncidentType
    description: str
    timestamp_in_match: Optional[str] = None
    team_involved: Optional[str] = None
    player_involved: Optional[str] = None
    image_base64: Optional[str] = None
    video_base64: Optional[str] = None
    # Provenance tag for how the primary video was obtained. "upload" (default),
    # "go_live_capture" (rolling 8s MediaRecorder buffer from the GO LIVE
    # browser screen-share). Persisted on the incident doc and surfaced in
    # the PDF audit header so referees can see where the clip came from.
    video_source: Optional[str] = None
    # Multi-camera-angle ingestion. Each entry: {angle, image_base64?, video_base64?}
    camera_angles: Optional[List[Dict]] = None


class DecisionUpdate(BaseModel):
    decision_status: DecisionStatus
    final_decision: str
    decided_by: str


class TextAnalysisRequest(BaseModel):
    incident_type: IncidentType
    description: str
    additional_context: Optional[str] = None


class AnnotationSave(BaseModel):
    annotations: list
    frame: Optional[int] = None
    match_time: Optional[str] = None


@api_router.post("/incidents")
async def create_incident(data: IncidentCreate, request: Request):
    user = await get_optional_user(request, db)
    incident_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    storage_path = None
    image_b64 = data.image_base64
    storage_warnings: List[Dict] = []
    if image_b64:
        try:
            user_id = user.get("_id", "anonymous") if user else "anonymous"
            path = generate_upload_path(user_id, f"{incident_id}.jpg")
            put_object(path, base64.b64decode(image_b64), "image/jpeg")
            storage_path = path
        except Exception as e:
            logger.warning(f"Image upload failed: {e}")
            storage_warnings.append({
                "type": "image_storage_unavailable",
                "message": "Visual evidence storage upstream is currently unavailable. Analysis ran on the in-memory image but the frame was not archived for replay.",
            })

    video_storage_path = None
    video_bytes_buf = None
    if data.video_base64:
        try:
            user_id = user.get("_id", "anonymous") if user else "anonymous"
            vpath = generate_upload_path(user_id, f"{incident_id}.mp4")
            video_bytes_buf = base64.b64decode(data.video_base64)
            put_object(vpath, video_bytes_buf, "video/mp4")
            video_storage_path = vpath
        except Exception as e:
            logger.warning(f"Video upload failed: {e}")
            storage_warnings.append({
                "type": "video_storage_unavailable",
                "message": "Video storage upstream is currently unavailable. A frame was extracted in memory for analysis but the video clip was not archived.",
            })

    # Multi-frame extraction so the dual-brain sees motion, not a still.
    primary_video_frames: List[str] = []
    if not image_b64 and video_bytes_buf:
        try:
            from video_utils import extract_frames_b64
            primary_video_frames = await extract_frames_b64(video_bytes_buf, n_frames=4)
            if primary_video_frames:
                image_b64 = primary_video_frames[0]
                logger.info(
                    f"[incident {incident_id}] extracted {len(primary_video_frames)} frames "
                    f"for vision analysis ({sum(len(b)//1024 for b in primary_video_frames)} KB b64 total)"
                )
        except Exception as e:
            logger.warning(f"Frame extraction failed: {e}")

    # ── Multi-camera-angle ingestion ──
    ALLOWED_ANGLES = {"broadcast", "tactical", "tight", "goal_line"}
    persisted_angles: List[Dict] = []
    angle_images_b64: List[str] = []

    if data.camera_angles:
        from video_utils import extract_frames_b64 as _extract_frames_b64
        user_id = user.get("_id", "anonymous") if user else "anonymous"
        for entry in data.camera_angles[:4]:
            angle = (entry or {}).get("angle", "").lower().strip()
            if angle not in ALLOWED_ANGLES:
                continue
            ang_img_b64 = (entry or {}).get("image_base64")
            ang_vid_b64 = (entry or {}).get("video_base64")
            ang_img_path = None
            ang_vid_path = None
            ang_vid_bytes = None

            if ang_img_b64:
                try:
                    p = generate_upload_path(user_id, f"{incident_id}__{angle}.jpg")
                    put_object(p, base64.b64decode(ang_img_b64), "image/jpeg")
                    ang_img_path = p
                except Exception as e:
                    logger.warning(f"[angle {angle}] image upload failed: {e}")
                    storage_warnings.append({
                        "type": "image_storage_unavailable",
                        "message": f"Storage failed for {angle.upper()} angle still — analysis ran on the in-memory frame.",
                    })

            if ang_vid_b64:
                try:
                    vp = generate_upload_path(user_id, f"{incident_id}__{angle}.mp4")
                    ang_vid_bytes = base64.b64decode(ang_vid_b64)
                    put_object(vp, ang_vid_bytes, "video/mp4")
                    ang_vid_path = vp
                except Exception as e:
                    logger.warning(f"[angle {angle}] video upload failed: {e}")
                    storage_warnings.append({
                        "type": "video_storage_unavailable",
                        "message": f"Storage failed for {angle.upper()} angle clip.",
                    })

            ang_frame_for_ai = ang_img_b64
            ang_extra_frames: List[str] = []
            if not ang_frame_for_ai and ang_vid_bytes:
                try:
                    burst = await _extract_frames_b64(ang_vid_bytes, n_frames=2)
                    if burst:
                        ang_frame_for_ai = burst[0]
                        ang_extra_frames = burst[1:]
                except Exception as e:
                    logger.warning(f"[angle {angle}] frame extraction failed: {e}")

            persisted_angles.append({
                "angle": angle,
                "storage_path": ang_img_path,
                "video_storage_path": ang_vid_path,
                "has_image": bool(ang_img_path or ang_img_b64),
                "has_video": bool(ang_vid_path or ang_vid_b64),
            })
            if ang_frame_for_ai:
                angle_images_b64.append(ang_frame_for_ai)
            for extra in ang_extra_frames:
                if extra:
                    angle_images_b64.append(extra)

        if not image_b64 and angle_images_b64:
            image_b64 = angle_images_b64[0]
        if not storage_path and persisted_angles:
            primary = next(
                (a for a in persisted_angles if a["angle"] == "broadcast" and a.get("storage_path")),
                next((a for a in persisted_angles if a.get("storage_path")), None),
            )
            if primary:
                storage_path = primary["storage_path"]
        if not video_storage_path:
            primary_v = next(
                (a for a in persisted_angles if a.get("video_storage_path")), None
            )
            if primary_v:
                video_storage_path = primary_v["video_storage_path"]

    # Build the extra-images list — the multi-frame burst from the
    # primary clip lives here so the vision payload sees motion.
    _extras = [b for b in angle_images_b64 if b and b != image_b64]
    for fr in primary_video_frames[1:]:
        if fr and fr != image_b64 and fr not in _extras:
            _extras.append(fr)

    # Standalone offside fast-path: when the operator picks "offside" as
    # the incident type, we run the SAME strict Law 11 evidence-grounded
    # contract that the (now-removed) standalone OFFSIDE pill used. This
    # keeps offside calls consistent with how the rest of the foul types
    # are analysed but with the added refuse-on-no-evidence guard.
    description_for_engine = data.description
    if data.incident_type.value == "offside":
        from .quick_fire import _OFFSIDE_PROMPT
        description_for_engine = (
            f"{_OFFSIDE_PROMPT}\n\n"
            f"Operator-supplied description: {data.description}"
        )

    analysis_result = await brain_engine.analyze_incident(
        incident_type=data.incident_type.value,
        description=description_for_engine,
        db=db,
        image_base64=image_b64,
        extra_images_b64=_extras,
    )
    analysis_result["visual_evidence_source"] = (
        "image" if data.image_base64 else ("video_frame" if video_bytes_buf else None)
    )
    if angle_images_b64:
        analysis_result["camera_angles_analyzed"] = len(angle_images_b64)
        analysis_result["visual_evidence_source"] = "multi_angle"
    # Re-evaluate angle_disagreement against the admin-tunable threshold.
    from .system_config import get_ofr_threshold, get_competition_profile
    threshold = await get_ofr_threshold()
    profile = await get_competition_profile()
    delta = float(analysis_result.get("angle_confidence_delta") or 0.0)
    analysis_result["angle_disagreement"] = bool(delta >= threshold and delta > 0)
    analysis_result["ofr_threshold_pct"] = threshold
    analysis_result["competition_profile"] = profile["id"]
    analysis_result["competition_profile_label"] = profile["label"]

    # Apply the same evidence-honesty post-process to standalone offside
    # incidents that the quick-fire path already enjoys.
    if data.incident_type.value == "offside":
        from .quick_fire import _post_process_quick_analysis
        frame_count_total = (1 if image_b64 else 0) + len(_extras)
        analysis_result = _post_process_quick_analysis(analysis_result, frame_count_total)
        analysis_result["fast_path"] = True
        analysis_result["fast_path_frame_count"] = frame_count_total

    incident_doc = {
        "id": incident_id,
        "match_id": data.match_id,
        "incident_type": data.incident_type.value,
        "description": data.description,
        "timestamp_in_match": data.timestamp_in_match,
        "team_involved": data.team_involved,
        "player_involved": data.player_involved,
        "storage_path": storage_path,
        "video_storage_path": video_storage_path,
        "video_source": (data.video_source or ("upload" if data.video_base64 else None)),
        "has_image": bool(image_b64),
        "has_video": bool(data.video_base64) or any(a.get("has_video") for a in persisted_angles),
        "camera_angles": persisted_angles,
        "ai_analysis": analysis_result,
        "decision_status": "pending",
        "final_decision": None,
        "decided_by": None,
        "created_by": user.get("_id") if user else None,
        "created_at": now,
        "updated_at": now,
        "storage_warnings": storage_warnings,
    }

    await db.incidents.insert_one(incident_doc)
    incident_doc.pop("_id", None)

    ws_data = {
        "id": incident_id,
        "incident_type": data.incident_type.value,
        "description": data.description[:100],
        "confidence": analysis_result.get("final_confidence", 0),
    }
    await ws_manager.send_incident_created(ws_data, match_id=incident_doc.get("match_id"))

    if storage_warnings:
        try:
            await ws_manager.send_system_health({
                "trigger": "incident_storage_failure",
                "incident_id": incident_id,
                "warnings": storage_warnings,
                "at": now,
            })
            invalidate_health_cache()
        except Exception as e:
            logger.warning(f"system_health broadcast failed: {e}")

    return incident_doc


@api_router.get("/incidents")
async def get_incidents(
    status: Optional[str] = None,
    incident_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    query = {}
    if status:
        query["decision_status"] = status
    if incident_type:
        query["incident_type"] = incident_type
    return (
        await db.incidents.find(query, {"_id": 0})
        .sort("created_at", -1)
        .to_list(limit)
    )


@api_router.get("/incidents/{incident_id}")
async def get_incident(incident_id: str):
    doc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return doc


@api_router.post("/incidents/{incident_id}/ofr-bookmark")
async def queue_ofr_bookmark(incident_id: str, payload: Dict, request: Request):
    inc = await db.incidents.find_one({"id": incident_id}, {"_id": 0, "id": 1, "match_id": 1})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    bookmark = {
        "id": str(uuid.uuid4()),
        "incident_id": incident_id,
        "reason": payload.get("reason", "manual"),
        "delta_pct": payload.get("delta_pct"),
        "cited_clause": payload.get("cited_clause"),
        "triggered_at": payload.get("triggered_at") or datetime.now(timezone.utc).isoformat(),
        "status": "queued",
    }
    await db.incidents.update_one(
        {"id": incident_id},
        {"$push": {"ofr_bookmarks": bookmark}, "$set": {"ofr_pending": True}},
    )
    try:
        await ws_manager.broadcast({
            "type": "ofr_bookmark",
            "incident_id": incident_id,
            "bookmark": bookmark,
        }, match_id=inc.get("match_id") if isinstance(inc, dict) else None)
    except Exception:
        pass
    return {"status": "queued", "bookmark": bookmark}


@api_router.put("/incidents/{incident_id}/decision")
async def update_decision(incident_id: str, decision: DecisionUpdate, request: Request):
    current = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Incident not found")

    update_data = {
        "decision_status": decision.decision_status.value,
        "final_decision": decision.final_decision,
        "decided_by": decision.decided_by,
        "decided_by_booth": get_booth_id(request),
        "decided_by_booth_label": get_booth_label(request),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.incidents.find_one_and_update(
        {"id": incident_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0},
    )

    ai_analysis = current.get("ai_analysis", {})
    ai_suggestion = ai_analysis.get("suggested_decision", "")
    was_confirmed = decision.decision_status.value == "confirmed"
    feedback_doc = {
        "id": str(uuid.uuid4()),
        "incident_id": incident_id,
        "incident_type": current.get("incident_type", "other"),
        "ai_suggestion": ai_suggestion,
        "ai_confidence": ai_analysis.get("final_confidence", 0),
        "operator_decision": decision.final_decision,
        "decision_status": decision.decision_status.value,
        "was_ai_correct": was_confirmed,
        "decided_by": decision.decided_by,
        "decided_by_booth": get_booth_id(request),
        "decided_by_booth_label": get_booth_label(request),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ai_feedback.insert_one(feedback_doc)

    if current.get("match_id"):
        await db.matches.update_one(
            {"id": current["match_id"]},
            {"$inc": {"incidents_count": 0}},
        )

    await ws_manager.send_decision_made(
        incident_id, decision.final_decision, decision.decision_status.value,
        match_id=current.get("match_id"),
    )
    return result


@api_router.delete("/incidents/{incident_id}")
async def delete_incident(incident_id: str, request: Request):
    await require_role(request, db, ["admin"])
    result = await db.incidents.delete_one({"id": incident_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"message": "Incident deleted"}


@api_router.put("/incidents/{incident_id}/annotations")
async def save_annotations(incident_id: str, data: AnnotationSave, request: Request):
    """Save frame annotations drawn by operators."""
    result = await db.incidents.find_one_and_update(
        {"id": incident_id},
        {"$set": {
            "annotations": data.annotations,
            "annotation_frame": data.frame,
            "annotation_time": data.match_time,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Incident not found")
    return result


@api_router.post("/incidents/{incident_id}/reanalyze")
async def reanalyze_incident(incident_id: str, request: Request):
    doc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Incident not found")

    image_b64 = None
    extra_frames: List[str] = []
    visual_source = None
    if doc.get("storage_path"):
        try:
            data, _ = get_object(doc["storage_path"])
            image_b64 = base64.b64encode(data).decode("utf-8")
            visual_source = "image"
        except Exception as e:
            logger.warning(f"Could not fetch image for reanalysis: {e}")

    if not image_b64 and doc.get("video_storage_path"):
        try:
            from video_utils import extract_frames_b64
            vdata, _ = get_object(doc["video_storage_path"])
            burst = await extract_frames_b64(vdata, n_frames=4)
            if burst:
                image_b64 = burst[0]
                extra_frames = burst[1:]
                visual_source = "video_frames" if len(burst) > 1 else "video_frame"
        except Exception as e:
            logger.warning(f"Could not extract frames for reanalysis: {e}")

    analysis = await brain_engine.analyze_incident(
        incident_type=doc["incident_type"],
        description=doc["description"],
        db=db,
        image_base64=image_b64,
        extra_images_b64=extra_frames,
    )
    analysis["visual_evidence_source"] = visual_source
    # Re-evaluate angle_disagreement against the admin-tunable threshold.
    from .system_config import get_ofr_threshold
    threshold = await get_ofr_threshold()
    delta = float(analysis.get("angle_confidence_delta") or 0.0)
    analysis["angle_disagreement"] = bool(delta >= threshold and delta > 0)
    analysis["ofr_threshold_pct"] = threshold

    result = await db.incidents.find_one_and_update(
        {"id": incident_id},
        {"$set": {"ai_analysis": analysis, "updated_at": datetime.now(timezone.utc).isoformat()}},
        return_document=True,
        projection={"_id": 0},
    )

    await ws_manager.send_analysis_complete(
        incident_id, analysis.get("final_confidence", 0),
        match_id=doc.get("match_id"),
    )
    return result


# ── Text-only AI analysis ────────────────────────────────
@api_router.post("/ai/analyze-text")
async def analyze_text(req: TextAnalysisRequest):
    desc = req.description
    if req.additional_context:
        desc += f" Context: {req.additional_context}"
    return await brain_engine.analyze_incident(
        incident_type=req.incident_type.value,
        description=desc,
        db=db,
    )


# ── File serving ─────────────────────────────────────────
@api_router.get("/files/{path:path}")
async def serve_file(path: str, request: Request):
    try:
        data, content_type = get_object(path)
        range_header = request.headers.get("Range")
        if range_header and content_type.startswith("video/"):
            total = len(data)
            ranges = range_header.replace("bytes=", "").split("-")
            start = int(ranges[0]) if ranges[0] else 0
            end = int(ranges[1]) if ranges[1] else total - 1
            end = min(end, total - 1)
            chunk = data[start:end + 1]
            return Response(
                content=chunk,
                status_code=206,
                media_type=content_type,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{total}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(len(chunk)),
                },
            )
        return Response(content=data, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"File not found: {e}")


# ── Promote incident → Training Library ──────────────────
@api_router.post("/incidents/{incident_id}/promote-to-training")
async def promote_incident_to_training(incident_id: str, request: Request):
    """Turn a confirmed/overturned incident into a ground-truth precedent."""
    user = await require_role(request, db, ["admin", "var_operator"])
    inc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    if inc.get("decision_status") not in ("confirmed", "overturned"):
        raise HTTPException(status_code=400, detail="Only confirmed/overturned incidents can be promoted")

    existing = await db.training_cases.find_one({"source_incident_id": incident_id}, {"_id": 0})
    if existing:
        return {"case": existing, "status": "already_promoted"}

    analysis = inc.get("ai_analysis") or {}
    title = f"{inc.get('incident_type','incident').replace('_',' ').title()} — {inc.get('team_involved') or str(inc.get('match_id','match'))[:8]} — {datetime.now(timezone.utc).date().isoformat()}"
    correct_decision = inc.get("final_decision") or analysis.get("suggested_decision") or "Decision (promoted)"
    rationale = analysis.get("reasoning") or inc.get("description") or ""
    keywords = analysis.get("key_factors") or []
    now = datetime.now(timezone.utc).isoformat()
    case = {
        "id": str(uuid.uuid4()),
        "title": title[:160],
        "incident_type": inc.get("incident_type", "other"),
        "correct_decision": correct_decision,
        "rationale": rationale[:1200],
        "keywords": [str(k)[:60] for k in keywords][:12],
        "tags": ["promoted", f"status:{inc.get('decision_status')}"],
        "match_context": {
            "teams": inc.get("team_involved"),
            "competition": inc.get("match_id"),
            "year": datetime.now(timezone.utc).year,
        },
        "law_references": [],
        "outcome": inc.get("decision_status"),
        "visual_tags": [],
        "media_storage_path": inc.get("storage_path"),
        "thumbnail_storage_path": inc.get("storage_path") if (inc.get("media_content_type", "") or "").startswith("image") else None,
        "source_incident_id": incident_id,
        "created_by": user.get("id"),
        "created_by_name": user.get("name"),
        "created_at": now,
        "updated_at": now,
    }
    await db.training_cases.insert_one(case.copy())
    return {"case": case, "status": "promoted"}
