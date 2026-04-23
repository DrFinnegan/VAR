"""
Smoke test for red-card critical-trigger pathway.
Run with:  cd /app/backend && python -m tests.test_red_card_flow
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


SCENARIOS = [
    # The user's failing case
    ("red_card",
     "An angry player pushed and howled the referee violently resulting in a red card.",
     "Red Card - Violent Conduct", 92),
    # Studs-up SFP
    ("red_card",
     "Defender lunged two-footed, studs up, over the top at high speed, connecting above "
     "the ankle with no attempt to play the ball. Opponent left writhing in pain.",
     "Red Card - Serious Foul Play", 85),
    # Off-ball elbow
    ("red_card",
     "Striker deliberately elbowed the centre-back in the face off the ball during an aerial "
     "duel. No attempt to play the ball — pure violent conduct.",
     "Red Card - Violent Conduct", 85),
    # Stamping
    ("red_card",
     "Midfielder stamped on the opponent's ankle while the ball was out of playable range. "
     "Clearly deliberate, excessive force.",
     "Red Card - Serious Foul Play", 85),
    # Borderline — should NOT floor to 92
    ("red_card",
     "Challenge was late and slightly reckless but the defender made a genuine attempt to "
     "play the ball. Minor contact, no excessive force.",
     "Yellow", 40),  # expecting yellow-ish, lower confidence OK
]


async def run():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print("=" * 80)
    print("OCTON VAR — Red Card Critical-Trigger Regression Test")
    print("=" * 80)

    for i, (itype, desc, expected_contains, expected_min_conf) in enumerate(SCENARIOS, 1):
        print(f"\n[{i}] {desc[:70]}...")
        result = await brain_engine.analyze_incident(
            incident_type=itype,
            description=desc,
            db=db,
            image_base64=None,
        )
        decision = result["suggested_decision"]
        conf = result["final_confidence"]
        hip_conf = result["hippocampus"]["initial_confidence"]
        trigger = result.get("critical_trigger")
        floor = result.get("critical_floor_applied")
        precedents = result["precedents_count"]
        uplift = result["confidence_uplift"]
        hip_bonus = result["hippocampus_bonus"]

        ok_decision = expected_contains.lower() in decision.lower()
        ok_conf = conf >= expected_min_conf

        status = "PASS" if (ok_decision and ok_conf) else "FAIL"
        print(f"   {status}  decision={decision!r}  conf={conf}  hip={hip_conf}  "
              f"trigger={trigger}  floor={floor}  precedents={precedents}  "
              f"uplift={uplift}  hipBonus={hip_bonus}")
        if not ok_decision:
            print(f"   (expected decision to contain {expected_contains!r})")
        if not ok_conf:
            print(f"   (expected confidence >= {expected_min_conf})")

    client.close()


if __name__ == "__main__":
    asyncio.run(run())
