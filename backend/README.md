# BulsuScholar Python Document Scanner

This FastAPI service scans COR/COG PDF or image files and returns structured fields for the React signup form.

## Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Required OCR Install

Install Tesseract OCR on Windows, then make sure `tesseract.exe` is available in PATH.

For scanned PDF OCR, install Poppler and add its `bin` folder to PATH. Digital PDFs can be read without Poppler.

## React Env

Add this to `.env`:

```env
VITE_DOCUMENT_SCAN_API_URL=https://bulsuscholar.onrender.com
VITE_BACKEND_API_URL=https://bulsuscholar.onrender.com
```
