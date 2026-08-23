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

## Priority 1 Services

Run `supabase/priority-one.sql` once in the Supabase SQL editor before using Help requests, LOA/return requests, or UNIFAST imports.

The Help Assistant works without an AI key by using its controlled FAQ fallback. To enable OpenAI answers, add these backend-only environment variables to Render or Railway:

```env
OPENAI_API_KEY=your-server-side-key
OPENAI_HELP_MODEL=gpt-5-mini
```

Do not add `OPENAI_API_KEY` to Vercel as a `VITE_` variable. Restart or redeploy the backend after changing server environment variables.
