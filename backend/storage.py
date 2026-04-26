"""
OCTON VAR Object Storage Module
Handles incident frame uploads via Emergent Storage API.
Designed by Dr Finnegan.
"""
import os
import uuid
import requests
import logging

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "octon-var"
storage_key = None


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not emergent_key:
        logger.warning("EMERGENT_LLM_KEY not set, storage disabled")
        return None
    try:
        resp = requests.post(
            f"{STORAGE_URL}/init",
            json={"emergent_key": emergent_key},
            timeout=30,
        )
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        logger.info("OCTON VAR Storage initialized")
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str, max_retries: int = 2) -> dict:
    """Upload a blob to Emergent Object Storage with simple exponential-backoff retry
    for transient upstream errors (5xx). Raises after `max_retries + 1` attempts."""
    key = init_storage()
    if not key:
        raise Exception("Storage not initialized")
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            resp = requests.put(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key, "Content-Type": content_type},
                data=data,
                timeout=120,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.HTTPError as e:
            status = getattr(e.response, "status_code", 0)
            last_exc = e
            # Only retry on transient upstream failures (5xx, 408, 429)
            if status in (408, 429) or 500 <= status < 600:
                if attempt < max_retries:
                    import time
                    time.sleep(0.6 * (2 ** attempt))  # 0.6s, 1.2s, 2.4s
                    continue
            raise
        except (requests.ConnectionError, requests.Timeout) as e:
            last_exc = e
            if attempt < max_retries:
                import time
                time.sleep(0.6 * (2 ** attempt))
                continue
            raise
    if last_exc:
        raise last_exc
    raise Exception("put_object failed without recorded exception")


def get_object(path: str):
    key = init_storage()
    if not key:
        raise Exception("Storage not initialized")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def generate_upload_path(user_id: str, filename: str) -> str:
    ext = filename.split(".")[-1] if "." in filename else "bin"
    return f"{APP_NAME}/uploads/{user_id}/{uuid.uuid4()}.{ext}"


MIME_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "mp4": "video/mp4",
}
