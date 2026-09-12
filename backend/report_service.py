import io
import re
from datetime import datetime
from html import escape
from pathlib import Path
from typing import Any
from zipfile import ZipFile


MAX_REPORT_COLUMNS = 20
MAX_REPORT_ROWS = 25_000
MAX_CELL_LENGTH = 10_000


def _text(value: Any, fallback: str = "-") -> str:
    rendered = str(value if value is not None else "").strip()
    return rendered or fallback


def sanitize_report_filename(value: Any, fallback: str = "bulsuscholar-report.pdf") -> str:
    rendered = re.sub(r"[^a-zA-Z0-9._-]+", "-", _text(value, fallback)).strip("-._")
    if not rendered:
        rendered = fallback
    if not rendered.lower().endswith(".pdf"):
        rendered = f"{rendered}.pdf"
    return rendered


def validate_report_payload(payload: dict[str, Any]) -> None:
    columns = payload.get("columns") or []
    rows = payload.get("rows") or []
    grouped_pages = payload.get("groupedPages") or []
    if not isinstance(columns, list) or len(columns) == 0:
        raise ValueError("report_columns_required")
    if len(columns) > MAX_REPORT_COLUMNS:
        raise ValueError("report_column_limit_exceeded")
    if not isinstance(rows, list) or len(rows) > MAX_REPORT_ROWS:
        raise ValueError("report_row_limit_exceeded")
    if grouped_pages and not isinstance(grouped_pages, list):
        raise ValueError("invalid_grouped_report_pages")

    def validate_rows(raw_rows: Any, column_count: int) -> int:
        if not isinstance(raw_rows, list):
            raise ValueError("invalid_report_rows")
        for row in raw_rows:
            if not isinstance(row, (list, tuple)) or len(row) != column_count:
                raise ValueError("invalid_report_row_shape")
            if any(len(str(value if value is not None else "")) > MAX_CELL_LENGTH for value in row):
                raise ValueError("report_cell_limit_exceeded")
        return len(raw_rows)

    validate_rows(rows, len(columns))
    grouped_row_count = 0
    for group in grouped_pages:
        if not isinstance(group, dict):
            raise ValueError("invalid_grouped_report_pages")
        group_columns = group.get("columns") or columns
        if not isinstance(group_columns, list) or not group_columns or len(group_columns) > MAX_REPORT_COLUMNS:
            raise ValueError("invalid_grouped_report_columns")
        grouped_row_count += validate_rows(group.get("rows") or [], len(group_columns))
    if grouped_row_count > MAX_REPORT_ROWS:
        raise ValueError("report_row_limit_exceeded")


def _normalize_columns(raw_columns: list[Any]) -> list[dict[str, Any]]:
    columns = []
    for index, item in enumerate(raw_columns):
        if isinstance(item, dict):
            label = _text(item.get("label") or item.get("key"), f"Column {index + 1}")
            weight = item.get("weight") or item.get("width") or 1
        else:
            label = _text(item, f"Column {index + 1}")
            weight = 1
        try:
            normalized_weight = max(0.25, float(weight))
        except (TypeError, ValueError):
            normalized_weight = 1
        columns.append({"label": label, "weight": normalized_weight})
    return columns


def _column_widths(columns: list[dict[str, Any]], available_width: float) -> list[float]:
    total_weight = sum(column["weight"] for column in columns) or 1
    return [available_width * column["weight"] / total_weight for column in columns]


def _safe_paragraph(value: Any, style: Any) -> Any:
    from reportlab.platypus import Paragraph

    rendered = _text(value)[:MAX_CELL_LENGTH]
    return Paragraph(escape(rendered).replace("\n", "<br/>") or "-", style)


def _load_brand_images() -> tuple[bytes | None, bytes | None]:
    template_path = Path(__file__).resolve().parents[1] / "public" / "Templates" / "FORMATTED_REPORT.docx"
    if not template_path.exists():
        return None, None
    try:
        with ZipFile(template_path) as archive:
            return (
                archive.read("word/media/image1.png"),
                archive.read("word/media/image2.png"),
            )
    except (KeyError, OSError):
        return None, None


def build_report_pdf_bytes(payload: dict[str, Any]) -> bytes:
    try:
        import reportlab
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import landscape, legal
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.platypus import KeepTogether, PageBreak, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError as error:  # pragma: no cover - dependency guard
        raise RuntimeError("reportlab is required for PDF report generation.") from error

    validate_report_payload(payload)
    page_size = landscape(legal)
    page_width, page_height = page_size
    margin_left = 28
    margin_right = 28
    margin_top = 98
    margin_bottom = 72

    font_regular = "Times-Roman"
    font_bold = "Times-Bold"
    unicode_font_pairs = [
        (
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"),
        ),
        (
            Path(reportlab.__file__).resolve().parent / "fonts" / "Vera.ttf",
            Path(reportlab.__file__).resolve().parent / "fonts" / "VeraBd.ttf",
        ),
        (Path("C:/Windows/Fonts/arial.ttf"), Path("C:/Windows/Fonts/arialbd.ttf")),
        (Path("C:/Windows/Fonts/times.ttf"), Path("C:/Windows/Fonts/timesbd.ttf")),
    ]
    for regular_path, bold_path in unicode_font_pairs:
        if not regular_path.exists() or not bold_path.exists():
            continue
        pdfmetrics.registerFont(TTFont("BulsuScholarReport", str(regular_path)))
        pdfmetrics.registerFont(TTFont("BulsuScholarReport-Bold", str(bold_path)))
        font_regular = "BulsuScholarReport"
        font_bold = "BulsuScholarReport-Bold"
        break

    output = io.BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=page_size,
        leftMargin=margin_left,
        rightMargin=margin_right,
        topMargin=margin_top,
        bottomMargin=margin_bottom,
        title=_text(payload.get("title"), "BulsuScholar Report"),
        author="BulsuScholar",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontName=font_bold,
        fontSize=15,
        leading=18,
        textColor=colors.HexColor("#063d2d"),
        spaceAfter=3,
        alignment=0,
    )
    meta_style = ParagraphStyle(
        "ReportMeta",
        parent=styles["BodyText"],
        fontName=font_regular,
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#475569"),
    )
    group_style = ParagraphStyle(
        "ReportGroup",
        parent=styles["Heading2"],
        fontName=font_bold,
        fontSize=11,
        leading=13,
        textColor=colors.HexColor("#063d2d"),
        spaceAfter=4,
    )
    header_style = ParagraphStyle(
        "ReportTableHeader",
        parent=styles["BodyText"],
        fontName=font_bold,
        fontSize=7.2,
        leading=8.5,
        textColor=colors.white,
        alignment=1,
    )
    cell_style = ParagraphStyle(
        "ReportTableCell",
        parent=styles["BodyText"],
        fontName=font_regular,
        fontSize=7.2,
        leading=8.7,
        textColor=colors.HexColor("#172033"),
        splitLongWords=True,
    )
    stat_value_style = ParagraphStyle(
        "ReportStatValue",
        parent=cell_style,
        fontName=font_bold,
        fontSize=10,
        leading=11,
        textColor=colors.HexColor("#00633c"),
        alignment=1,
    )
    stat_label_style = ParagraphStyle(
        "ReportStatLabel",
        parent=cell_style,
        fontSize=7,
        textColor=colors.HexColor("#526176"),
        alignment=1,
    )

    header_image, footer_image = _load_brand_images()

    def draw_page(canvas, doc) -> None:
        canvas.saveState()
        if header_image:
            canvas.drawImage(
                ImageReader(io.BytesIO(header_image)),
                margin_left,
                page_height - 82,
                width=page_width - margin_left - margin_right,
                height=70,
                preserveAspectRatio=True,
                anchor="c",
                mask="auto",
            )
        else:
            canvas.setFillColor(colors.HexColor("#00633c"))
            canvas.rect(0, page_height - 12, page_width, 12, fill=1, stroke=0)
            canvas.setFont(font_bold, 13)
            canvas.drawString(margin_left, page_height - 42, "BulsuScholar")
        if footer_image:
            canvas.drawImage(
                ImageReader(io.BytesIO(footer_image)),
                margin_left,
                12,
                width=page_width - margin_left - margin_right,
                height=48,
                preserveAspectRatio=True,
                anchor="c",
                mask="auto",
            )
        canvas.setFillColor(colors.HexColor("#475569"))
        canvas.setFont(font_regular, 7)
        canvas.drawRightString(page_width - margin_right, 8, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    def report_heading() -> list[Any]:
        heading = [_safe_paragraph(payload.get("title") or "BulsuScholar Report", title_style)]
        if payload.get("subtitle"):
            heading.append(_safe_paragraph(payload.get("subtitle"), meta_style))
        heading.append(_safe_paragraph(f"Generated: {datetime.now().strftime('%b %d, %Y %I:%M %p')}", meta_style))
        if payload.get("filterLabel"):
            heading.append(_safe_paragraph(f"Filters: {payload['filterLabel']}", meta_style))
        heading.append(Spacer(1, 7))
        stats = [item for item in payload.get("stats") or [] if isinstance(item, dict)]
        if stats:
            stat_cells = [
                [_safe_paragraph(item.get("value"), stat_value_style), _safe_paragraph(item.get("label"), stat_label_style)]
                for item in stats[:6]
            ]
            stat_table = Table([stat_cells], colWidths=[(page_width - margin_left - margin_right) / len(stat_cells)] * len(stat_cells))
            stat_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f2faf6")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#b7d7c7")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d5e7dd")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            heading.extend([stat_table, Spacer(1, 8)])
        return heading

    def report_table(raw_columns: list[Any], raw_rows: list[Any]) -> Any:
        columns = _normalize_columns(raw_columns)
        headers = [_safe_paragraph(column["label"], header_style) for column in columns]
        table_data = [headers]
        for raw_row in raw_rows:
            row = raw_row if isinstance(raw_row, (list, tuple)) else [raw_row]
            table_data.append([_safe_paragraph(row[index] if index < len(row) else "-", cell_style) for index in range(len(columns))])
        if len(table_data) == 1:
            table_data.append([_safe_paragraph("No records matched the selected filters.", cell_style)] + ["" for _ in columns[1:]])
        table = Table(
            table_data,
            colWidths=_column_widths(columns, page_width - margin_left - margin_right),
            repeatRows=1,
            hAlign="LEFT",
            splitByRow=1,
        )
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#00633c")),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#b7c8be")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fbf9")]),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        if not raw_rows:
            table.setStyle(TableStyle([("SPAN", (0, 1), (-1, 1)), ("ALIGN", (0, 1), (-1, 1), "CENTER")]))
        return table

    story: list[Any] = []
    grouped_pages = [item for item in payload.get("groupedPages") or [] if isinstance(item, dict)]
    if grouped_pages:
        for group_index, group in enumerate(grouped_pages):
            if group_index:
                story.append(PageBreak())
            story.extend(report_heading())
            group_heading = [_safe_paragraph(group.get("title") or f"Group {group_index + 1}", group_style)]
            if group.get("subtitle"):
                group_heading.append(_safe_paragraph(group.get("subtitle"), meta_style))
            group_heading.append(Spacer(1, 5))
            story.append(KeepTogether(group_heading))
            story.append(report_table(group.get("columns") or payload.get("columns") or [], group.get("rows") or []))
    else:
        story.extend(report_heading())
        story.append(report_table(payload.get("columns") or [], payload.get("rows") or []))

    document.build(story, onFirstPage=draw_page, onLaterPages=draw_page)
    return output.getvalue()
