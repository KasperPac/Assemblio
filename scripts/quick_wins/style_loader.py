"""Load Manuva design tokens with a fallback for machines without the tokens repo."""
from __future__ import annotations

import warnings
from pathlib import Path

CANONICAL_TOKENS_PATH = Path(r"C:\dev\manuva-tokens\Manuva Design System\colors_and_type.css")

FALLBACK_TOKENS = """:root {
  --brand-1: #0E5BFF;
  --brand-1-soft: #E6EEFF;
  --brand-2: #1B2433;
  --ink-strong: #0F1320;
  --ink-muted: #5A6273;
  --bg-card: #FFFFFF;
  --bg-canvas: #F5F7FB;
  --border-subtle: #E3E7EE;
  --success: #1AA563;
  --warning: #F0A91E;
  --danger: #E04646;
  --priority-1: var(--brand-1);
  --priority-2: #5B8DEF;
  --priority-3: #9CB5F2;
}
body { color: var(--ink-strong); background: var(--bg-canvas); }
"""


def load_tokens(canonical_path: Path | None = None) -> str:
    path = canonical_path if canonical_path is not None else CANONICAL_TOKENS_PATH
    if path.exists():
        return path.read_text(encoding="utf-8")
    warnings.warn(
        f"colors_and_type.css not found at {path}; using fallback tokens.",
        stacklevel=2,
    )
    return FALLBACK_TOKENS
