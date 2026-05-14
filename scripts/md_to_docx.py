"""
Convert a markdown file to a styled Word .docx for easier reading.

Usage:
    python scripts/md_to_docx.py <input.md> [output.docx]

If output is omitted, the .docx is written next to the input with the same stem.

Handles: H1-H4, paragraphs, **bold**, *italic*, `code`, [links](url),
bullet/numbered lists, GitHub-flavoured tables, fenced code blocks,
horizontal rules, blockquotes. Aimed at the in-repo research reports —
not a general-purpose CommonMark converter.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Pt, RGBColor, Cm


# ─── Inline formatting ──────────────────────────────────────────────────────

INLINE_RE = re.compile(
    r"(\*\*[^*]+\*\*)"          # bold
    r"|(\*[^*\n]+\*)"            # italic (single-star)
    r"|(`[^`\n]+`)"              # inline code
    r"|(\[[^\]]+\]\([^)]+\))"    # link
)


def _add_hyperlink(paragraph, url: str, text: str):
    part = paragraph.part
    r_id = part.relate_to(
        url,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        is_external=True,
    )
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), r_id)

    new_run = OxmlElement("w:r")
    rPr = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "0563C1")
    rPr.append(color)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    rPr.append(underline)
    new_run.append(rPr)
    t = OxmlElement("w:t")
    t.text = text
    t.set(qn("xml:space"), "preserve")
    new_run.append(t)
    hyperlink.append(new_run)
    paragraph._p.append(hyperlink)


def render_inline(paragraph, text: str) -> None:
    """Render markdown inline formatting into runs on the given paragraph."""
    pos = 0
    for m in INLINE_RE.finditer(text):
        if m.start() > pos:
            paragraph.add_run(text[pos : m.start()])
        token = m.group(0)
        if token.startswith("**") and token.endswith("**"):
            paragraph.add_run(token[2:-2]).bold = True
        elif token.startswith("*") and token.endswith("*"):
            paragraph.add_run(token[1:-1]).italic = True
        elif token.startswith("`") and token.endswith("`"):
            run = paragraph.add_run(token[1:-1])
            run.font.name = "Consolas"
            run.font.size = Pt(10)
        elif token.startswith("["):
            link_m = re.match(r"\[([^\]]+)\]\(([^)]+)\)", token)
            if link_m:
                _add_hyperlink(paragraph, link_m.group(2), link_m.group(1))
            else:
                paragraph.add_run(token)
        pos = m.end()
    if pos < len(text):
        paragraph.add_run(text[pos:])


# ─── Block parsing ──────────────────────────────────────────────────────────


def _is_table_separator(line: str) -> bool:
    return bool(re.match(r"^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$", line))


def _split_table_row(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [cell.strip() for cell in line.split("|")]


def _add_table(doc: Document, rows: list[list[str]]) -> None:
    if not rows:
        return
    cols = max(len(r) for r in rows)
    table = doc.add_table(rows=len(rows), cols=cols)
    table.style = "Light Grid Accent 1"
    for r_idx, row in enumerate(rows):
        for c_idx in range(cols):
            cell_text = row[c_idx] if c_idx < len(row) else ""
            cell = table.cell(r_idx, c_idx)
            cell.text = ""
            para = cell.paragraphs[0]
            render_inline(para, cell_text)
            if r_idx == 0:
                for run in para.runs:
                    run.bold = True


def _add_code_block(doc: Document, code: str) -> None:
    para = doc.add_paragraph()
    para.paragraph_format.left_indent = Cm(0.5)
    para.paragraph_format.space_before = Pt(4)
    para.paragraph_format.space_after = Pt(4)
    run = para.add_run(code)
    run.font.name = "Consolas"
    run.font.size = Pt(9)
    # Subtle grey shading via paragraph border
    pPr = para._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), "F4F4F4")
    pPr.append(shd)


def _add_heading(doc: Document, text: str, level: int) -> None:
    h = doc.add_heading(level=min(level, 4))
    render_inline(h, text)


def _add_paragraph(doc: Document, text: str) -> None:
    para = doc.add_paragraph()
    render_inline(para, text)


def _add_list_item(doc: Document, text: str, style: str, indent: int = 0) -> None:
    para = doc.add_paragraph(style=style)
    if indent:
        para.paragraph_format.left_indent = Cm(0.5 * indent)
    render_inline(para, text)


def _add_blockquote(doc: Document, text: str) -> None:
    para = doc.add_paragraph()
    para.paragraph_format.left_indent = Cm(0.75)
    run_marker = para.add_run("│ ")
    run_marker.font.color.rgb = RGBColor(0xC8, 0xC8, 0xC8)
    render_inline(para, text)


def _add_hr(doc: Document) -> None:
    para = doc.add_paragraph()
    pPr = para._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "BFBFBF")
    pBdr.append(bottom)
    pPr.append(pBdr)


HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
BULLET_RE = re.compile(r"^(\s*)[-*]\s+(.*)$")
NUM_RE = re.compile(r"^(\s*)\d+\.\s+(.*)$")
BLOCKQUOTE_RE = re.compile(r"^>\s?(.*)$")
HR_RE = re.compile(r"^\s*([-*_])\s*\1\s*\1[\s\-*_]*$")


def convert(md_text: str, doc: Document) -> None:
    lines = md_text.splitlines()
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        stripped = line.strip()

        # Fenced code blocks
        if stripped.startswith("```"):
            i += 1
            buf: list[str] = []
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            if i < n:
                i += 1  # skip closing fence
            _add_code_block(doc, "\n".join(buf))
            continue

        # Tables
        if "|" in line and i + 1 < n and _is_table_separator(lines[i + 1]):
            header = _split_table_row(line)
            i += 2
            rows = [header]
            while i < n and "|" in lines[i] and lines[i].strip():
                rows.append(_split_table_row(lines[i]))
                i += 1
            _add_table(doc, rows)
            continue

        # Horizontal rule
        if HR_RE.match(stripped):
            _add_hr(doc)
            i += 1
            continue

        # Headings
        m = HEADING_RE.match(stripped)
        if m:
            level = len(m.group(1))
            _add_heading(doc, m.group(2), level)
            i += 1
            continue

        # Blockquote (single or multi-line)
        if stripped.startswith(">"):
            buf2: list[str] = []
            while i < n and lines[i].strip().startswith(">"):
                bq = BLOCKQUOTE_RE.match(lines[i].strip())
                buf2.append(bq.group(1) if bq else lines[i].strip().lstrip(">"))
                i += 1
            _add_blockquote(doc, " ".join(buf2).strip())
            continue

        # Bullet list
        if BULLET_RE.match(line):
            while i < n and BULLET_RE.match(lines[i]):
                bm = BULLET_RE.match(lines[i])
                indent = len(bm.group(1)) // 2
                _add_list_item(doc, bm.group(2), "List Bullet", indent)
                i += 1
            continue

        # Numbered list
        if NUM_RE.match(line):
            while i < n and NUM_RE.match(lines[i]):
                nm = NUM_RE.match(lines[i])
                indent = len(nm.group(1)) // 2
                _add_list_item(doc, nm.group(2), "List Number", indent)
                i += 1
            continue

        # Blank line
        if not stripped:
            i += 1
            continue

        # Default: paragraph (may span continuation lines until blank/heading/list)
        para_buf = [line]
        i += 1
        while i < n:
            nxt = lines[i]
            if (
                not nxt.strip()
                or HEADING_RE.match(nxt.strip())
                or BULLET_RE.match(nxt)
                or NUM_RE.match(nxt)
                or nxt.strip().startswith("```")
                or nxt.strip().startswith(">")
                or HR_RE.match(nxt.strip())
                or ("|" in nxt and i + 1 < n and _is_table_separator(lines[i + 1]))
            ):
                break
            para_buf.append(nxt)
            i += 1
        _add_paragraph(doc, " ".join(p.strip() for p in para_buf))


# ─── Style defaults ─────────────────────────────────────────────────────────


def _apply_defaults(doc: Document) -> None:
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    for sec in doc.sections:
        sec.top_margin = Cm(2.0)
        sec.bottom_margin = Cm(2.0)
        sec.left_margin = Cm(2.0)
        sec.right_margin = Cm(2.0)


def convert_file(md_path: Path, out_path: Path) -> None:
    text = md_path.read_text(encoding="utf-8")
    doc = Document()
    _apply_defaults(doc)
    convert(text, doc)
    doc.save(out_path)
    print(f"Wrote {out_path} ({out_path.stat().st_size:,} bytes) from {md_path.name}")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    md_path = Path(argv[1]).resolve()
    if not md_path.exists():
        print(f"Not found: {md_path}", file=sys.stderr)
        return 1
    out_path = Path(argv[2]).resolve() if len(argv) >= 3 else md_path.with_suffix(".docx")
    convert_file(md_path, out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
