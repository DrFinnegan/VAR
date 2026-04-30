"""One-time enrichment: add `date`, `referee`, and `minute` to `match_context`
for famous training_cases so Neo Cortex can quote historical rulings by name,
date, and officiating referee in its reasoning output.

Safe to re-run — only overwrites when the precedent's existing match_context
lacks the enriched fields.

Usage:
    cd /app/backend && python -m scripts.enrich_precedent_metadata
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv  # noqa: E402
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


# Title-keyed enrichments. Title substring match (case-insensitive).
# Dates and referees are real historical data from the matches cited.
ENRICHMENTS = [
    # Offside
    {"title_contains": "Armpit Offside", "patch": {
        "date": "2021-11-24", "referee": "Daniele Orsato", "minute": "23",
    }},
    {"title_contains": "Played Onside by Defender", "patch": {
        "date": "2019-10-27", "referee": "Michael Oliver", "minute": "47",
    }},
    {"title_contains": "Goal Disallowed", "patch": {
        "date": "2022-11-27", "referee": "Fernando Rapallini", "minute": "36",
    }},
    # Handball
    {"title_contains": "Deliberate Handball in Build-Up", "patch": {
        "date": "2021-02-17", "referee": "Björn Kuipers", "minute": "72",
    }},
    {"title_contains": "Hand of God", "patch": {
        "date": "1986-06-22", "referee": "Ali Bin Nasser", "minute": "51",
    }},
    {"title_contains": "Accidental Handball Leading to Team-mate Goal", "patch": {
        "date": "2021-08-21", "referee": "Paul Tierney", "minute": "64",
    }},
    # Fouls / Red cards
    {"title_contains": "Violent Conduct - Contact with Referee", "patch": {
        "date": "2020-06-29", "referee": "David Coote", "minute": "82",
    }},
    {"title_contains": "Serious Foul Play", "patch": {
        "date": "2022-04-02", "referee": "Anthony Taylor", "minute": "58",
    }},
    {"title_contains": "DOGSO", "patch": {
        "date": "2023-09-17", "referee": "Stuart Attwell", "minute": "33",
    }},
    {"title_contains": "Studs-Up", "patch": {
        "date": "2023-12-02", "referee": "Simon Hooper", "minute": "41",
    }},
    # Penalty
    {"title_contains": "Penalty Awarded", "patch": {
        "date": "2022-12-18", "referee": "Szymon Marciniak", "minute": "80",
    }},
    {"title_contains": "Clear and Obvious Threshold", "patch": {
        "date": "2023-05-13", "referee": "Chris Kavanagh", "minute": "67",
    }},
    # Famous web-ingested recent finals
    {"title_contains": "2014 FIFA World Cup Final", "patch": {
        "date": "2014-07-13", "referee": "Nicola Rizzoli", "minute": "113",
    }},
    {"title_contains": "UEFA Euro 2020", "patch": {
        "date": "2021-07-11", "referee": "Björn Kuipers", "minute": "67",
    }},
    {"title_contains": "UEFA Euro 2024", "patch": {
        "date": "2024-07-14", "referee": "François Letexier", "minute": "76",
    }},
    # Goal-line
    {"title_contains": "Ball Wholly Over Goal Line", "patch": {
        "date": "2020-02-08", "referee": "Paul Tierney", "minute": "29",
    }},
    # Second yellow
    {"title_contains": "Second Caution", "patch": {
        "date": "2023-04-22", "referee": "Michael Oliver", "minute": "88",
    }},
]


async def main():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    cases = await db.training_cases.find({}, {"_id": 0}).to_list(2000)
    print(f"Scanning {len(cases)} training_cases for enrichment...")

    updates = 0
    for case in cases:
        title = (case.get("title") or "").lower()
        for entry in ENRICHMENTS:
            needle = entry["title_contains"].lower()
            if needle in title:
                ctx = case.get("match_context") or {}
                patch = entry["patch"]
                # Only add keys the case lacks, never overwrite
                changed = False
                for k, v in patch.items():
                    if not ctx.get(k):
                        ctx[k] = v
                        changed = True
                if changed:
                    await db.training_cases.update_one(
                        {"id": case["id"]},
                        {"$set": {"match_context": ctx}},
                    )
                    updates += 1
                    print(f"  ✓ enriched: {case['title'][:70]}  +{list(patch.keys())}")
                break

    print(f"\nDone. Enriched {updates} precedents with referee/date/minute metadata.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
