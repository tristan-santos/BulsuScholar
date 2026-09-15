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
VITE_DOCUMENT_SCAN_API_URL=https://api.bulsuscholar.com
VITE_BACKEND_API_URL=https://api.bulsuscholar.com
```

## Transactional Email

The backend sends portal notifications through Brevo while Supabase Auth uses
Brevo SMTP for confirmation and recovery messages.

```env
EMAIL_PROVIDER=brevo
BREVO_API_KEY=
BREVO_SENDER_NAME=BulsuScholar
BREVO_SENDER_EMAIL=no-reply@bulsuscholar.com
BREVO_REPLY_TO_EMAIL=support@bulsuscholar.com
```

Keep the API key on Railway. Configure Supabase separately with the Brevo SMTP
login and SMTP key; do not expose either credential through a `VITE_` variable.

## Priority 1 Services

Run `supabase/priority-one.sql` once in the Supabase SQL editor before using Help and support feedback.

The Help Assistant works without an AI key by using its controlled FAQ fallback. To enable OpenAI answers, add these backend-only environment variables to Railway:

```env
OPENAI_API_KEY=your-server-side-key
OPENAI_HELP_MODEL=gpt-5-mini
```

Do not add `OPENAI_API_KEY` to Vercel as a `VITE_` variable. Restart or redeploy the backend after changing server environment variables.
