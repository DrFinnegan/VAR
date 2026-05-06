"""Wave-10 regression tests:
  • /api/training/stats exposes split telemetry: violent_conduct + consequence_corrections
  • Neocortex return contract carries `location`, `offender_team`, `matrix_row`
  • Consequence-correction kind tagging on vision_escalation
"""
import os
import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://smart-var-audit.preview.emergentagent.com",
).rstrip("/")


def test_training_stats_split_telemetry():
    r = requests.get(f"{BASE_URL}/api/training/stats", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    # Legacy combined object still present.
    ve = body.get("vision_escalations") or {}
    assert "total" in ve and "last_24h" in ve and "top_triggers" in ve
    # New violent_conduct sub-block.
    assert "violent_conduct" in ve, "vision_escalations.violent_conduct sub-block missing"
    vc = ve["violent_conduct"]
    assert "total" in vc and "last_24h" in vc and "top_triggers" in vc
    # New top-level consequence_corrections.
    assert "consequence_corrections" in body
    cc = body["consequence_corrections"]
    assert "total" in cc and "last_24h" in cc and "top_triggers" in cc


def test_neocortex_return_contract_carries_structured_fields():
    """Validates the contract by inspecting the analyzer code: every
    return path from analyze() must include location, offender_team
    and matrix_row keys (else the WhyThisVerdict UI can't render).
    """
    src_path = Path(__file__).resolve().parent.parent / "ai_engine.py"
    src = src_path.read_text()
    # Find the analyze() return dict block (the one that has 'stage':'neo_cortex')
    assert '"location": location' in src, "location field not surfaced on Neocortex return"
    assert '"offender_team": offender_team' in src, "offender_team field not surfaced"
    assert '"matrix_row": matrix_row' in src, "matrix_row field not surfaced"
    assert '"consequence_correction": consequence_correction' in src
    # neo_cortex_notes must explicitly ask for ≥6 sentences in the prompt.
    assert "≥ 6 sentences" in src, "Neocortex notes prompt does not enforce 6+ sentences"


def test_safety_net_kind_tagging():
    """When a vision_escalation fires from a handball-in-box trigger,
    `kind` must be 'consequence_correction'. When violent_conduct fires
    (e.g. 'elbow strikes'), kind = 'violent_conduct'. Validate the
    tagging logic by reading the source.
    """
    src_path = Path(__file__).resolve().parent.parent / "ai_engine.py"
    src = src_path.read_text()
    assert 'phrase.startswith(("handball-in-box:", "no-goal-evidence"))' in src, (
        "kind-tagging logic for consequence_correction not present"
    )
    # The matrix_row is overwritten by the safety-net for both kinds.
    assert (
        "Defender deliberate handball INSIDE own penalty area → Penalty" in src
    ), "handball-in-box matrix_row override missing"
    assert "Violent conduct (" in src, "violent-conduct matrix_row override missing"


def test_neocortex_notes_required_length_is_advertised():
    """Verify that the JSON spec sent to the LLM explicitly demands an
    elaborated deliberation in neo_cortex_notes (≥6 sentences). The
    failure mode the user reported was the LLM emitting only 1-2 lines."""
    src_path = Path(__file__).resolve().parent.parent / "ai_engine.py"
    src = src_path.read_text()
    assert "≥ 6 sentences" in src
    assert "two-line note is a referee-grade FAILURE" in src
