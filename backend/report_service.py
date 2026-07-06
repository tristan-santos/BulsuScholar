import csv
import io
from pathlib import Path
from datetime import datetime
from typing import Any


def build_csv_bytes(headers: list[str], rows: list[list[Any]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def build_report_pdf_bytes(payload: dict[str, Any]) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
        from pypdf import PdfReader, PdfWriter
    except ImportError as error:  # pragma: no cover - dependency guard
        raise RuntimeError("reportlab and pypdf are required for Python PDF report generation.") from error

    overlay_buffer = io.BytesIO()
    doc = SimpleDocTemplate(overlay_buffer, pagesize=letter, rightMargin=64, leftMargin=64, topMargin=106, bottomMargin=80)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("BulsuScholar", styles["Title"]),
        Paragraph(payload.get("title") or "Report", styles["Heading2"]),
        Paragraph(payload.get("subtitle") or "", styles["BodyText"]),
        Spacer(1, 10),
        Paragraph(f"Generated: {datetime.now().strftime('%b %d, %Y %I:%M %p')}", styles["BodyText"]),
    ]
    if payload.get("filterLabel"):
        story.append(Paragraph(f"Filters: {payload['filterLabel']}", styles["BodyText"]))
    story.append(Spacer(1, 12))

    raw_headers = payload.get("headers") or payload.get("columns") or []
    headers = [
        item.get("label", "")
        if isinstance(item, dict)
        else str(item)
        for item in raw_headers
    ]
    rows = payload.get("rows") or []
    table_data = [headers] + rows if headers else rows
    if table_data:
        table = Table(table_data, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#00633c")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#b7c8be")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(table)
    else:
        story.append(Paragraph("No rows available for the selected report.", styles["BodyText"]))

    doc.build(story)
    overlay_buffer.seek(0)

    template_path = Path(__file__).resolve().parents[1] / "public" / "Templates" / "FORMATTED_REPORT.pdf"
    if not template_path.exists():
        return overlay_buffer.getvalue()

    template_reader = PdfReader(str(template_path))
    overlay_reader = PdfReader(overlay_buffer)
    writer = PdfWriter()
    template_page = template_reader.pages[0]
    for overlay_page in overlay_reader.pages:
        page = template_page.clone(writer)
        page.merge_page(overlay_page)
        writer.add_page(page)

    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()
