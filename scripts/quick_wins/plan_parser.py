"""Parse docs/marketing/90-day-gtm-plan.md into structured task records."""
from __future__ import annotations

import re
from pathlib import Path
from typing import TypedDict


class PlanTask(TypedDict):
    week: int
    phase: str
    index: int
    text: str
    deliverable: str


_PHASE_HEADING = re.compile(r"^###\s+Phase\s+([A-C])\b", re.MULTILINE)
_WEEK_HEADING = re.compile(r"^####\s+Week\s+(\d+)\b", re.MULTILINE)
_TASK_LINE = re.compile(r"^(\d+)\.\s+(.*)$")
_DELIVERABLE_RE = re.compile(r"\*\*Deliverable:\s*([^*]+)\*\*", re.IGNORECASE)


def _split_into_week_sections(content: str) -> list[tuple[str, int, str]]:
    """Return (phase_letter, week_number, week_body) tuples in document order."""
    sections: list[tuple[str, int, str]] = []
    phase_matches = list(_PHASE_HEADING.finditer(content))
    for i, pm in enumerate(phase_matches):
        phase = pm.group(1)
        phase_start = pm.end()
        phase_end = phase_matches[i + 1].start() if i + 1 < len(phase_matches) else len(content)
        phase_body = content[phase_start:phase_end]
        week_matches = list(_WEEK_HEADING.finditer(phase_body))
        for j, wm in enumerate(week_matches):
            week_num = int(wm.group(1))
            w_start = wm.end()
            w_end = week_matches[j + 1].start() if j + 1 < len(week_matches) else len(phase_body)
            sections.append((phase, week_num, phase_body[w_start:w_end]))
    return sections


def parse_plan(plan_path: Path) -> list[PlanTask]:
    content = plan_path.read_text(encoding="utf-8")
    tasks: list[PlanTask] = []
    for phase, week_num, body in _split_into_week_sections(content):
        for line in body.splitlines():
            m = _TASK_LINE.match(line.lstrip())
            if not m:
                continue
            idx = int(m.group(1))
            text = m.group(2).strip()
            deliv_m = _DELIVERABLE_RE.search(text)
            deliverable = deliv_m.group(1).strip().rstrip(" *.") if deliv_m else ""
            tasks.append(PlanTask(
                week=week_num,
                phase=phase,
                index=idx,
                text=text,
                deliverable=deliverable,
            ))
    return tasks


def parse_day_90_review(plan_path: Path) -> list[str]:
    """Extract the numbered items under the Day 90 review section."""
    content = plan_path.read_text(encoding="utf-8")
    m = re.search(r"^##\s+6\.\s+Day\s+90.*?(?=^##\s+|\Z)", content, re.MULTILINE | re.DOTALL)
    if not m:
        return []
    section = m.group(0)
    items = re.findall(r"^(\d+\.\s+\*\*[^*]+\*\*[^\n]*)", section, re.MULTILINE)
    return [it.strip() for it in items]
