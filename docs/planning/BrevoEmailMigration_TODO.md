# Brevo Email Migration TODO

Goal: migrate important system emails to Brevo while keeping routine updates inside the BulsuScholar inbox.

## Recommended Email Strategy

Use email only for important account-related messages:

- Account confirmation
- Forgot password
- Welcome email
- Important account/security notices

Use in-app inbox notifications for routine updates:

- SOE/material approval or rejection
- Application status updates
- Announcement notifications
- Profile update notices
- Grantor/admin workflow updates
- Archive/unarchive notices

## Why Brevo

- Free plan allows up to 300 emails/day.
- Good enough for capstone alpha/beta testing.
- Easy SMTP setup.
- Can be connected to Supabase Auth.
- Can also be used by the Python backend.

## Part 1: Brevo Account Setup

- Create a Brevo account.
- Verify sender email or domain.
- Go to `SMTP & API`.
- Get:
  - SMTP server
  - SMTP port
  - SMTP login
  - SMTP key/password
  - verified sender email

Common Brevo SMTP values:

```txt
SMTP host: smtp-relay.brevo.com
Port: 587
```

## Part 2: Supabase Auth SMTP Setup

Use Brevo SMTP for Supabase Auth emails.

In Supabase:

- Go to Authentication.
- Go to Emails / SMTP Settings.
- Enable custom SMTP.
- Set:

```txt
Host: smtp-relay.brevo.com
Port: 587
Username: Brevo SMTP login
Password: Brevo SMTP key
Sender email: verified Brevo sender email
Sender name: BulsuScholar
```

## Part 3: Supabase Auth Redirect URLs

Make sure Supabase Auth redirects use Vercel, not localhost.

Site URL:

```txt
https://bulsu-scholar.vercel.app
```

Redirect URLs:

```txt
https://bulsu-scholar.vercel.app/*
https://bulsu-scholar.vercel.app/reset-password
https://bulsu-scholar.vercel.app/confirm-email
```

## Part 4: Backend Custom Emails

Current backend email can be changed from Resend to Brevo SMTP.

Frontend should still call:

```txt
/email/send
```

Only the backend email implementation should change.

Backend environment variables to add:

```env
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your_brevo_smtp_login
BREVO_SMTP_PASSWORD=your_brevo_smtp_key
BREVO_FROM_EMAIL=your_verified_sender_email
BREVO_FROM_NAME=BulsuScholar
```

Optional fallback during migration:

```env
EMAIL_PROVIDER=brevo
```

## Part 5: Code Migration Tasks

- Update `backend/email_service.py`.
- Replace Resend API sending with Brevo SMTP sending.
- Keep the same `/email/send` API contract.
- Do not change frontend email calls unless required.
- Keep confirmation and forgot password handled by Supabase Auth.
- Keep routine notifications in the inbox only.
- Remove or deprecate unused Resend variables after Brevo is tested.

## Part 6: Vercel/Frontend Env Check

Frontend should still use:

```env
VITE_BACKEND_API_URL=https://your-backend-url
VITE_APP_URL=https://bulsu-scholar.vercel.app
VITE_PUBLIC_SITE_URL=https://bulsu-scholar.vercel.app
```

Do not expose Brevo SMTP password in Vercel frontend variables.

## Part 7: Render/Railway Backend Env Check

Add Brevo variables to the backend hosting service:

```env
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your_brevo_smtp_login
BREVO_SMTP_PASSWORD=your_brevo_smtp_key
BREVO_FROM_EMAIL=your_verified_sender_email
BREVO_FROM_NAME=BulsuScholar
```

Remove only after successful migration:

```env
RESEND_API_KEY
RESEND_FROM_EMAIL
```

## Part 8: Testing Checklist

Test after migration:

- Student account creation sends confirmation email.
- Confirmation email link redirects to Vercel.
- Forgot password sends email.
- Forgot password link redirects to Vercel.
- Welcome email sends if enabled.
- No SOE approval email is sent.
- SOE approval appears only in student inbox.
- Brevo dashboard logs show successful delivery.
- No localhost links appear in emails.
- No email rate-limit issue appears during normal testing.
- No Brevo SMTP credentials appear in browser console.

## Part 9: Beta Testing Reminder

For 75 beta users:

- Do not ask everyone to spam forgot password.
- Do not resend confirmation repeatedly.
- Use inbox for normal updates.
- Monitor Brevo daily usage.
- Free plan should be enough if email is only used for account-related messages.
