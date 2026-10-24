"""Non-sensitive local PDF fixture; the fixed test password is not a secret."""
import io
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

raw = io.BytesIO()
page = canvas.Canvas(raw)
page.drawString(72, 700, "Synthetic encrypted PDF preview - no student data")
page.save()
writer = PdfWriter(clone_from=PdfReader(io.BytesIO(raw.getvalue())))
writer.encrypt("fixture-only-password", algorithm="AES-256")
folder = Path(__file__).resolve().parents[1] / "test-results"
folder.mkdir(exist_ok=True)
writer.write(folder / "romel-encrypted-preview.pdf")
print("Synthetic encrypted preview fixture created.")
