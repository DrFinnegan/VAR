"""
OCTON VAR — Edge-case IFAB rule regression suite.
Covers tricky scenarios the seed corpus was thin on:
  - Offside interference (line of sight, rebound from save, deliberate-play reset)
  - DOGSO vs SPA (genuine attempt, holding, outside-box SPA)
  - Handball nuances (justifiable position, accidental team-mate, GK outside PA)
  - Penalty encroachment (2024 update)
  - Second yellow / cumulative cautions
  - Reckless vs SFP threshold

Run with:  cd /app/backend && python -m tests.test_edge_cases
Note: requires the new edge-case precedents to be seeded into Mongo first
via POST /api/training/seed (or directly inserted by training_seed.CANONICAL_CASES).
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


# (incident_type, description, expected_decision_substrings_any, expected_min_conf)
SCENARIOS = [
    # ── Offside interference ─────────────────────────────────
    ("offside",
     "Striker stood directly in the goalkeeper's line of sight from an offside position when "
     "the long-range shot was struck. He did not touch the ball but the keeper's vision was "
     "completely obstructed. The shot beat the keeper into the bottom corner.",
     ["offside", "disallow", "interfer"], 70),

    ("offside",
     "Attacker was in an offside position when team-mate shot at goal. Goalkeeper saved the "
     "shot with his hands and the ball rebounded to the offside attacker who tapped it in. "
     "Was the rebound off a save or a deliberate play?",
     ["offside", "disallow"], 65),

    ("offside",
     "Defender saw the ball coming from 10 metres away, had clear time and space, was in full "
     "control under no pressure, and deliberately played the ball with a controlled clearance. "
     "The ball reached an attacker who was in an offside position when the original through ball "
     "was played, and that attacker scored.",
     ["onside", "goal stand", "deliberate", "reset"], 55),

    ("offside",
     "Offside-position attacker actively challenged a defender for a header on the goal-bound "
     "cross, jumping into him. Team-mate at the back post scored from the second ball. The "
     "challenge for the ball clearly interfered with the defender's ability to play.",
     ["offside", "disallow", "interfer"], 65),

    # ── DOGSO vs SPA ─────────────────────────────────────────
    ("red_card",
     "Defender committed a foul inside the penalty area while making a genuine attempt to play "
     "the ball — slid in cleanly but got the man before the ball. Attacker was clean through on "
     "goal denying an obvious goal-scoring opportunity. Defender was making a genuine attempt to "
     "play the ball, not holding or pulling.",
     ["yellow", "penalty"], 60),

    ("red_card",
     "Defender denied an obvious goal-scoring opportunity inside the penalty area by holding and "
     "pulling the attacker's shirt — clearly NOT a genuine attempt to play the ball. Attacker was "
     "clean through on goal.",
     ["red", "DOGSO", "penalty"], 75),

    ("foul",
     "Defender committed a cynical trip on attacker outside the penalty area. Attacker was breaking "
     "forward with a promising attack but a cover defender was tracking back and several metres of "
     "ground remained to goal. Not a clean-through situation.",
     ["yellow", "promising", "stopping"], 55),

    # ── Handball nuances ─────────────────────────────────────
    ("handball",
     "Defender slid in to make a tackle, his arm went to the ground to support his body weight in "
     "the natural sliding motion, and the ball struck his arm while it was supporting his weight. "
     "No deliberate movement of the arm toward the ball.",
     ["no handball", "play on", "natural", "support"], 60),

    ("handball",
     "Ball deflected accidentally off attacker A's arm in the build-up phase, then attacker B (a "
     "different player, the eventual scorer) scored several seconds later after the ball had been "
     "deliberately passed by team-mate C. Should the goal stand under the 2021 handball rule?",
     ["goal stand", "no handball", "stand"], 55),

    ("handball",
     "Goalkeeper rushed out and picked up the ball with his hands clearly outside his own penalty "
     "area to prevent the attacker reaching it. The attacker was being denied a promising attack.",
     ["free kick", "yellow", "outside"], 55),

    # ── Penalty encroachment ─────────────────────────────────
    ("penalty",
     "The penalty was struck and the goalkeeper saved it. An attacking team-mate had clearly "
     "encroached well into the penalty area before the kick was struck and was the first to reach "
     "the rebound, scoring from it. Per 2024 IFAB encroachment rules, what is the correct outcome?",
     ["retake", "indirect", "disallow"], 55),

    # ── Second yellow ────────────────────────────────────────
    ("red_card",
     "Player had already received a yellow card in the first half for a tactical foul. Now in the "
     "second half he commits another cautionable offence (persistent infringement). The referee "
     "issues a second yellow card and then a red card.",
     ["red", "second yellow", "two cautions", "sending"], 70),

    # ── Reckless vs SFP threshold ────────────────────────────
    ("foul",
     "Player went into a hard challenge — slightly late, raised foot, contact above the ball. "
     "However the force was not excessive, the boot did not endanger the opponent's safety (no "
     "studs-up over-the-top, no two-footed lunge), and the ball was within playable range. The "
     "opponent was shaken but not injured.",
     ["yellow", "reckless"], 50),
]


async def run():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print("=" * 90)
    print("OCTON VAR — Edge-case IFAB Regression Suite")
    print("=" * 90)

    passed = 0
    failed = 0
    for i, (itype, desc, expected_any, expected_min_conf) in enumerate(SCENARIOS, 1):
        result = await brain_engine.analyze_incident(
            incident_type=itype, description=desc, db=db, image_base64=None,
        )
        dec = (result["suggested_decision"] or "").lower()
        conf = result["final_confidence"]
        precedents = result["precedents_count"]
        clause = (result.get("cited_clause") or "")[:55]

        ok_decision = any(s.lower() in dec for s in expected_any)
        ok_conf = conf >= expected_min_conf
        status = "PASS" if (ok_decision and ok_conf) else "FAIL"
        marker = "✓" if status == "PASS" else "✗"
        if status == "PASS":
            passed += 1
        else:
            failed += 1
        short_dec = result["suggested_decision"][:60].replace("\n", " ")
        print(f"[{i:02d}] {marker} {itype:<9} conf={conf:>5.1f}  prec={precedents}  "
              f"clause={clause:<55}  → {short_dec}")
        if status == "FAIL":
            print(f"       expected ANY of {expected_any!r}  min_conf={expected_min_conf}  "
                  f"got dec={result['suggested_decision'][:120]!r}")

    print("=" * 90)
    print(f"RESULT: {passed} passed, {failed} failed (of {len(SCENARIOS)})")
    print("=" * 90)
    client.close()
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    asyncio.run(run())
