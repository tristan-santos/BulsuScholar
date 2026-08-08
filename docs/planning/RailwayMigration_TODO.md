# RailwayMigration TODO

Goal: move the FastAPI backend from Render to Railway while keeping the frontend, Supabase, storage, auth, and existing app flows unchanged.

## What Changes

- Backend hosting changes from Render to Railway.
- Backend URL changes from:

`https://bulsuscholar.onrender.com`

to a Railway URL similar to:

`https://bulsuscholar-production.up.railway.app`

- Vercel frontend environment variables must point to the Railway backend.
- Railway must receive all backend environment variables currently used by Render.

## What Should Not Change

- React frontend stays hosted on Vercel.
- Supabase database stays the same.
- Supabase Auth stays the same.
- Supabase Storage bucket stays the same.
- Resend/Supabase email setup stays the same.
- FastAPI routes stay the same.
- Python backend logic stays the same.
- Existing student, grantor, and admin workflows should not change.

## Backend Routes To Preserve

Make sure these routes still work on Railway:

- `/`
- `/scan-document`
- `/workflows/admin/review`
- `/workflows/grantor/...`
- `/workflows/material-request`
- `/notifications/...`
- `/email/send`
- report/export endpoints

## Railway Setup

- Create a new Railway project.
- Connect the GitHub repository.
- Set the backend service root to the backend folder if Railway asks for it.
- Prefer Docker deployment so OCR dependencies work.
- Confirm Railway uses the backend Dockerfile or root Dockerfile correctly.

## Railway Environment Variables

Add these to Railway:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=your_verified_sender_email
FRONTEND_URL=https://bulsu-scholar.vercel.app
VITE_APP_URL=https://bulsu-scholar.vercel.app
VITE_PUBLIC_SITE_URL=https://bulsu-scholar.vercel.app
DOCUMENT_SCAN_ALLOWED_ORIGINS=https://bulsu-scholar.vercel.app
DOCUMENT_SCAN_ALLOWED_ORIGIN_REGEX=https://.*\.vercel\.app
```

Optional if used by backend:

```env
PORT=8000
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in Vercel frontend variables.

## Vercel Environment Variables To Update

After Railway deploys successfully, update Vercel:

```env
VITE_BACKEND_API_URL=https://your-railway-backend-url.up.railway.app
VITE_DOCUMENT_SCAN_API_URL=https://your-railway-backend-url.up.railway.app
```

Keep these unchanged unless needed:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_STORAGE_BUCKET=bulsuscholar
VITE_APP_URL=https://bulsu-scholar.vercel.app
VITE_PUBLIC_SITE_URL=https://bulsu-scholar.vercel.app
```

## Code/Docs To Update

- Update `.env.example` with Railway backend URL example.
- Update deployment checklist with Railway backend steps.
- Keep `render.yaml` until Railway is fully tested.
- Do not delete Render service until Railway passes all verification tests.

## Verification Before Switching Vercel

Open the Railway backend URL:

- `/` should return backend status JSON.
- `/health` or equivalent status route should work if available.
- Railway logs should show no missing env variables.
- No `missing_supabase_server_config`.
- No Tesseract/Poppler missing errors.

## Verification After Switching Vercel

Redeploy Vercel after updating env vars, then test:

- Login as admin.
- Login as grantor.
- Login as student.
- Student signup COR scan.
- Student signup ROG scan.
- Document upload to Supabase Storage.
- Student inbox notification.
- Grantor inbox notification.
- Admin inbox/logs.
- Grantor application review.
- Admin requirements review.
- SOE/material request approval.
- Document preview.
- Report generation.
- Recommended scholarship loading.

## CORS Verification

Browser console should show:

- No CORS error.
- No localhost backend request.
- No `ERR_CONNECTION_REFUSED`.
- No `Document scanner is unavailable`.
- No `Failed to fetch` for Railway routes.

## Rollback Plan

If Railway fails:

- Revert Vercel env vars back to:

```env
VITE_BACKEND_API_URL=https://bulsuscholar.onrender.com
VITE_DOCUMENT_SCAN_API_URL=https://bulsuscholar.onrender.com
```

- Redeploy Vercel.
- Keep Render running until Railway is stable.

## Final Migration Checklist

- Railway backend is deployed.
- Railway env vars are complete.
- Railway backend root URL works.
- OCR scan works.
- Vercel env vars point to Railway.
- Vercel redeployed successfully.
- Student/grantor/admin workflows tested.
- No CORS or localhost errors.
- Render is kept as backup until final confirmation.
