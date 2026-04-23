"""
OCTON VAR — Full AI-engine regression suite.
Covers Hippocampus keywords, Neo Cortex prompt accuracy, and RAG precedent uplift
across all incident categories (offside, handball, penalty, foul, goal_line, red_card).

Run with:  cd /app/backend && python -m tests.test_ai_engine_suite
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from ai_engine import brain_engine  # noqa: E402


# (incident_type, description, expected_decision_contains, expected_min_conf)
SCENARIOS = [
    # ── Red Card ─────────────────────────────────────────
    ("red_card",
     "An angry player pushed and howled the referee violently resulting in a red card.",
     "red card", 92),
    ("red_card",
     "Defender lunged two-footed, studs up, over the top at high speed, connecting above "
     "the ankle with no attempt to play the ball.",
     "red card", 85),
    ("red_card",
     "Striker deliberately elbowed the centre-back in the face off the ball during an aerial duel.",
     "red card", 85),
    ("red_card",
     "Midfielder stamped on the opponent's ankle while the ball was out of playable range.",
     "red card", 85),

    # ── Offside ──────────────────────────────────────────
    ("offside",
     "Striker is more than a metre beyond the last defender when the through ball is played. "
     "Goal scored but clear daylight between attacker and defensive line.",
     "offside", 60),
    ("offside",
     "Attacker appeared in an offside position but was played onside by a deliberate clearance "
     "from a defender. Deliberate play resets the phase.",
     "onside", 55),

    # ── Handball ─────────────────────────────────────────
    ("handball",
     "Attacker's arm was clearly extended away from the body to intercept, making the body "
     "unnaturally bigger prior to scoring.",
     "handball", 55),
    ("handball",
     "Ball struck defender's arm from close range with the arm in a natural position by the side. "
     "No deliberate movement toward the ball.",
     "no handball", 50),

    # ── Penalty ──────────────────────────────────────────
    ("penalty",
     "Defender made contact with attacker's trailing leg inside the penalty area with no prior "
     "touch on the ball. Clear trip inside the box.",
     "penalty", 55),
    ("penalty",
     "Attacker initiated contact and went down theatrically with no meaningful defender contact "
     "inside the area. Clearly simulation.",
     "simulation", 45),

    # ── Goal line ────────────────────────────────────────
    ("goal_line",
     "Goal-line technology confirmed whole of the ball crossed whole of the line by 3 cm "
     "before the keeper scooped it back.",
     "goal", 65),

    # ── Foul (tactical / DOGSO-adjacent) ────────────────
    ("foul",
     "Defender committed a cynical trip near halfway line as attacker broke forward with numerical "
     "advantage. Stopping a promising attack.",
     "yellow", 50),
]


async def run():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print("=" * 80)
    print("OCTON VAR — Full AI-Engine Regression Suite")
    print("=" * 80)

    passed = 0
    failed = 0
    for i, (itype, desc, expected_contains, expected_min_conf) in enumerate(SCENARIOS, 1):
        result = await brain_engine.analyze_incident(
            incident_type=itype, description=desc, db=db, image_base64=None,
        )
        dec = (result["suggested_decision"] or "").lower()
        conf = result["final_confidence"]
        trigger = result.get("critical_trigger")
        precedents = result["precedents_count"]

        ok_decision = expected_contains.lower() in dec
        ok_conf = conf >= expected_min_conf
        status = "PASS" if (ok_decision and ok_conf) else "FAIL"
        marker = "✓" if status == "PASS" else "✗"
        if status == "PASS":
            passed += 1
        else:
            failed += 1
        print(f"[{i:02d}] {marker} {itype:<10} conf={conf:>5.1f}  trig={str(trigger):<18}  "
              f"prec={precedents}  → {result['suggested_decision'][:60]}")
        if status == "FAIL":
            print(f"       expected_contains={expected_contains!r} min_conf={expected_min_conf}")

    print("=" * 80)
    print(f"RESULT: {passed} passed, {failed} failed (of {len(SCENARIOS)})")
    print("=" * 80)
    client.close()
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    asyncio.run(run())
