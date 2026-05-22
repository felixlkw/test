# 호반 EHS 24개 목업 문서를 PDF로 생성.
#
# 사용: python backend/scripts/gen_mockup_pdfs.py
#
# 입력:  backend/data/guideline-summary-hoban.json
# 출력:  backend/data/mockup_pdfs/<id>.pdf
#
# 한국어 본문은 reportlab의 CID font(HYSMyeongJoStd-Medium) 사용 — 별도 .ttf 불필요.
# PDF 1개당 ~30~60KB. 24개 = ~1MB. git 트래킹 OK.

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)

BASE = Path(__file__).resolve().parent.parent
SRC = BASE / "data" / "guideline-summary-hoban.json"
OUT_DIR = BASE / "data" / "mockup_pdfs"

# Korean CID font (built into reportlab — no external file).
KO_FONT = "HYSMyeongJo-Medium"
pdfmetrics.registerFont(UnicodeCIDFont(KO_FONT))


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Heading1"],
            fontName=KO_FONT,
            fontSize=16,
            leading=20,
            spaceAfter=6 * mm,
            textColor="#1a1a1a",
        ),
        "meta": ParagraphStyle(
            "meta",
            parent=base["Normal"],
            fontName=KO_FONT,
            fontSize=9,
            leading=12,
            textColor="#777",
            spaceAfter=4 * mm,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName=KO_FONT,
            fontSize=10.5,
            leading=15.5,
            textColor="#222",
        ),
    }


def _escape(text: str) -> str:
    """reportlab Paragraph는 일부 글자(&, <, >)를 entity로 escape 필요."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _content_to_paragraphs(content: str, body_style) -> list:
    """content 문자열을 빈줄 기준으로 분할해 Paragraph 리스트로 변환."""
    out = []
    # content는 \n으로 줄바꿈이 있는 평문. 빈 줄은 단락 구분.
    blocks = [b.strip() for b in content.split("\n\n") if b.strip()]
    for block in blocks:
        # 단일 단락 내부 \n은 <br/>로 보존.
        text = _escape(block).replace("\n", "<br/>")
        out.append(Paragraph(text, body_style))
        out.append(Spacer(1, 2 * mm))
    return out


def _gen_one(doc: dict, out_path: Path, styles: dict) -> None:
    pdf = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=doc.get("title", ""),
        author="SafeMate Hoban Mockup",
    )
    flow = []
    flow.append(Paragraph(_escape(doc.get("title", "")), styles["title"]))
    meta = f"문서 ID: {doc.get('id', '')} · 발행일: {doc.get('date', '')} · 호반그룹 SafeMate 데모용"
    flow.append(Paragraph(_escape(meta), styles["meta"]))
    flow.extend(_content_to_paragraphs(doc.get("content", ""), styles["body"]))
    pdf.build(flow)


def main() -> int:
    if not SRC.exists():
        print(f"ERROR: source not found: {SRC}", file=sys.stderr)
        return 2
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    docs = json.loads(SRC.read_text(encoding="utf-8"))
    styles = _styles()
    ok = 0
    for d in docs:
        doc_id = d.get("id")
        if not doc_id:
            print(f"SKIP doc with no id: {d.get('title', '')}", file=sys.stderr)
            continue
        out_path = OUT_DIR / f"{doc_id}.pdf"
        _gen_one(d, out_path, styles)
        size = out_path.stat().st_size
        print(f"  OK {doc_id}: {size:>6} bytes -> {out_path.relative_to(BASE)}")
        ok += 1
    print(f"\nGenerated {ok}/{len(docs)} PDFs in {OUT_DIR.relative_to(BASE)}")
    return 0 if ok == len(docs) else 1


if __name__ == "__main__":
    sys.exit(main())
