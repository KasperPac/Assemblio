import warnings
from pathlib import Path

from scripts.quick_wins.style_loader import FALLBACK_TOKENS, load_tokens


def test_load_tokens_uses_fallback_when_missing(tmp_path):
    bogus = tmp_path / "missing.css"
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        css = load_tokens(canonical_path=bogus)
        assert css == FALLBACK_TOKENS
        assert any("colors_and_type.css" in str(rec.message) for rec in w)


def test_load_tokens_reads_existing_file(tmp_path):
    css_file = tmp_path / "tokens.css"
    css_file.write_text(":root { --brand-1: #abc; --ink-strong: #000; }", encoding="utf-8")
    assert load_tokens(canonical_path=css_file).startswith(":root")


def test_fallback_contains_required_tokens():
    assert "--brand-1" in FALLBACK_TOKENS
    assert "--ink-strong" in FALLBACK_TOKENS
    assert "--bg-card" in FALLBACK_TOKENS
