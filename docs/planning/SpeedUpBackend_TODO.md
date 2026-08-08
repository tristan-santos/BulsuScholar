# SpeedUpBackend TODO

Goal: improve deployed backend speed, especially document scanning and workflow requests.

## Priority 1: Remove Cold Start Delay

- Upgrade Render backend from free tier to a paid instance.
- Keep the backend always awake.
- After upgrading, test first request speed from:
  - Login
  - Signup COR scan
  - Signup ROG scan
  - Admin requirements review
  - Grantor application review

## Priority 2: Add Backend Warm Ping

- Add a cron/ping service that requests:

`https://bulsuscholar.onrender.com/`

- Suggested interval: every 5 to 10 minutes.
- Use this only as support; paid Render is still the better fix.

## Priority 3: Confirm Docker OCR Setup

- Make sure Render deploys using the backend Dockerfile.
- Confirm Docker installs:
  - `tesseract-ocr`
  - `poppler-utils`
- Test image/PDF scanning after deployment.
- Confirm no error appears:
  - `tesseract_not_installed`
  - `Document scanner is unavailable`
  - CORS error

## Priority 4: Optimize Document Scanner

- For PDF files, extract selectable text first.
- Use OCR only when direct text extraction is empty or unreliable.
- Keep COR/ROG upload as PDF-only.
- Limit document upload size to 5 MB or 10 MB.
- Avoid storing debug scan data in student records.
- Store only needed scan output:
  - file URL/path
  - student number
  - name
  - course
  - year
  - section
  - GWA
  - semester/cycle
  - `isValid: true`

## Priority 5: Cache Scan Results

- Save scan result by file hash.
- If the same file is uploaded again, reuse the existing scan result.
- Do not rescan unchanged COR/ROG files.
- Keep security checks for reused COR files.

## Priority 6: Add Supabase Indexes

Add/check indexes for commonly queried fields:

- student ID
- normalized email
- normalized contact number
- grantor ID
- application number
- announcement ID
- scholarship ID
- notification owner ID
- created date

## Priority 7: Move Heavy Scanning to Background

Future improvement:

- Upload document first.
- Return a loading/scanning state to the frontend.
- Run OCR in a background job.
- Save scan result to Supabase.
- Notify student inbox when scan is complete.

## Priority 8: Reduce Routine Email Usage

- Use inbox notifications for normal system updates.
- Keep email only for:
  - account confirmation
  - forgot password
  - important account/security notices
- Do not email routine SOE/material approval updates.

## Priority 9: Review Backend Workers

- Check Render CPU/RAM usage during OCR.
- If requests queue during scanning, increase instance resources.
- Consider multiple workers for normal API requests.
- Keep in mind OCR is CPU-heavy, so CPU upgrade matters more than worker count.

## Final Verification

After changes, test:

- First backend request response time.
- COR scan time.
- ROG scan time.
- Student signup completion.
- Admin review workflow.
- Grantor review workflow.
- Inbox notification creation.
- Document preview.
- No localhost API calls.
- No CORS errors.
- No scanner unavailable errors.
