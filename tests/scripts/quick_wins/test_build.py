import json
from pathlib import Path

from scripts.build_quick_wins import main


def test_build_produces_html_with_expected_content(tmp_path):
    out = tmp_path / "quick-wins.html"
    main(out_path=out)
    assert out.exists()
    html = out.read_text(encoding="utf-8")

    # Segment names
    assert "Katana defectors" in html
    assert "Craftybase graduates" in html
    assert "candle" in html.lower()

    # KPI formatting
    assert "AU$" in html

    # Chart.js CDN
    assert "chart.js@4" in html.lower()

    # Payload is valid JSON with correct shape
    start = html.index('<script id="payload" type="application/json">') + len(
        '<script id="payload" type="application/json">'
    )
    end = html.index("</script>", start)
    payload = json.loads(html[start:end])
    assert "bar" in payload and "scatter" in payload and "gantt" in payload
    assert len(payload["bar"]["data"]) == 9
    assert len(payload["scatter"]) == 9
    assert set(payload["gantt"].keys()) == {"Build", "Sell", "Support", "Content"}


def test_build_passes_new_context_variables(tmp_path):
    """Verify build succeeds after new context variables are wired."""
    out = tmp_path / "quick-wins.html"
    main(out_path=out)
    assert out.exists()
    html = out.read_text(encoding="utf-8")
    # Existing content still intact
    assert "Katana defectors" in html
    assert len(html) > 50_000
