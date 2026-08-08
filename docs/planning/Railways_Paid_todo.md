# Railways Paid TODO

Goal: prepare Railway hosting for beta testing with around 75 respondents while controlling cost and avoiding backend overload.

## Context

The frontend stays on Vercel, while the Python/FastAPI backend may move to Railway.

Main backend-heavy features:

- COR PDF scanning
- ROG PDF scanning
- OCR/Tesseract processing
- Document validation
- Workflow processing
- Inbox notifications
- Report generation

Normal pages like dashboard, inbox, profile, and table views are lighter than document scanning.

## Railway Hobby Plan Concern

Railway Hobby includes around `$5` monthly usage credits.

This may be enough for light capstone testing, but 75 beta users may exceed it if many users upload and scan documents.

Expected usage:

- 75 users browsing only: may stay near `$5` or slightly above.
- 75 users creating accounts with COR/ROG scanning: likely above `$5`.
- 75 users repeatedly uploading/scanning documents: may exceed `$10-$20+`.

## Cost Control Rules

- Use only 1 Railway backend service.
- Do not add Railway Postgres because Supabase is already used.
- Use 1 replica first.
- Start with the smallest available CPU/RAM setting.
- Monitor Railway usage daily during beta testing.
- Set a spending limit or budget alert if available.
- Keep Render running as backup until Railway is stable.

## File Upload Rules For Beta Testers

Tell testers:

- Upload PDF only.
- Keep files below 5-10 MB.
- Upload COR/ROG only once unless testing an error.
- Do not repeatedly upload the same file.
- Do not spam forgot password or confirmation emails.
- If scanning fails, screenshot the error instead of retrying many times.

## Recommended Beta Testing Schedule

Do not ask all 75 users to create accounts and scan documents at the same time.

Recommended batches:

- Batch 1: 15 users
- Batch 2: 20 users
- Batch 3: 20 users
- Batch 4: 20 users

After each batch:

- Check Railway usage.
- Check backend logs.
- Check scanner errors.
- Check Supabase records.
- Check inbox notifications.
- Check failed uploads.

## Backend Performance Checks

During beta testing, monitor:

- First request response time.
- COR scan time.
- ROG scan time.
- Error rate.
- Memory usage.
- CPU usage.
- Request timeout errors.
- CORS errors.
- Tesseract/Poppler errors.
- Supabase workflow errors.

## Upgrade Triggers

Consider increasing Railway resources if:

- COR/ROG scan takes too long.
- Multiple users get timeout errors.
- CPU usage is constantly high.
- Memory usage is near the limit.
- Backend restarts during scanning.
- Users report repeated `Document scanner is unavailable`.

## Optimization Before Beta

- Confirm Docker OCR dependencies are installed.
- Use direct PDF text extraction before OCR.
- Keep upload size limit active.
- Cache document scan results later.
- Avoid storing large debug data in student records.
- Use inbox notifications instead of email for routine updates.
- Keep only account confirmation and forgot password in email.

## Final Beta Readiness Checklist

- Railway backend deployed.
- Vercel points to Railway backend.
- Supabase Storage bucket is public and configured.
- File size limit is active.
- MIME type restrictions are active.
- COR/ROG scan works.
- Signup works.
- Student inbox works.
- Grantor inbox works.
- Admin inbox works.
- Admin/grantor approval flows work.
- No localhost backend requests.
- No CORS errors.
- No scanner unavailable errors.
- Railway usage is monitored during each batch.
