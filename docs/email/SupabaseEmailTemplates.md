# Supabase Auth Email Templates

Paste these templates into Supabase Dashboard -> Authentication -> Email Templates.
Brevo SMTP delivers them; Supabase creates the secure authentication URL. Keep
Brevo transactional click tracking disabled so the link is not rewritten.

## Confirm Signup

Subject:

```txt
Confirm your BulsuScholar account
```

Body:

```html
<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#eef5f2;color:#102a20;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background:#eef5f2;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;border-collapse:collapse;background:#ffffff;border:1px solid #cfe1d8;">
        <tr><td style="height:8px;background:#00633c;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:30px 32px 18px;">
          <p style="margin:0;color:#00633c;font-size:13px;font-weight:700;text-transform:uppercase;">BulsuScholar</p>
          <h1 style="margin:12px 0 0;color:#102a20;font-size:28px;line-height:1.25;">Confirm your email address</h1>
          <p style="margin:14px 0 0;color:#50657a;font-size:15px;line-height:1.65;">Confirm this email address to activate your student account. You cannot enter the dashboard until confirmation is complete.</p>
        </td></tr>
        <tr><td align="center" style="padding:12px 32px 28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;"><tr><td bgcolor="#00633c" style="border-radius:6px;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Confirm Email Address</a>
          </td></tr></table>
          <p style="margin:24px 0 0;color:#6b7c90;font-size:12px;line-height:1.55;">If the button does not open, paste this address into your browser:</p>
          <p style="margin:8px 0 0;color:#00633c;font-size:12px;line-height:1.5;word-break:break-all;">{{ .ConfirmationURL }}</p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f7fbf9;border-top:1px solid #dbe9e2;">
          <p style="margin:0;color:#607083;font-size:12px;line-height:1.55;">For your security, do not forward this message or share its link. If you did not create this account, ignore this email or contact <a href="mailto:support@bulsuscholar.com" style="color:#00633c;">support@bulsuscholar.com</a>.</p>
          <p style="margin:10px 0 0;color:#102a20;font-size:12px;font-weight:700;">https://bulsuscholar.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

## Reset Password

Subject:

```txt
Reset your BulsuScholar password
```

Body:

```html
<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#eef5f2;color:#102a20;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background:#eef5f2;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;border-collapse:collapse;background:#ffffff;border:1px solid #cfe1d8;">
        <tr><td style="height:8px;background:#00633c;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:30px 32px 18px;">
          <p style="margin:0;color:#00633c;font-size:13px;font-weight:700;text-transform:uppercase;">BulsuScholar Security</p>
          <h1 style="margin:12px 0 0;color:#102a20;font-size:28px;line-height:1.25;">Reset your password</h1>
          <p style="margin:14px 0 0;color:#50657a;font-size:15px;line-height:1.65;">A password reset was requested for your account. Use the secure link below to choose a new password.</p>
        </td></tr>
        <tr><td align="center" style="padding:12px 32px 28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;"><tr><td bgcolor="#00633c" style="border-radius:6px;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Reset Password</a>
          </td></tr></table>
          <p style="margin:24px 0 0;color:#6b7c90;font-size:12px;line-height:1.55;">If the button does not open, paste this address into your browser:</p>
          <p style="margin:8px 0 0;color:#00633c;font-size:12px;line-height:1.5;word-break:break-all;">{{ .ConfirmationURL }}</p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f7fbf9;border-top:1px solid #dbe9e2;">
          <p style="margin:0;color:#607083;font-size:12px;line-height:1.55;">If you did not request this change, do not use the link. Contact <a href="mailto:support@bulsuscholar.com" style="color:#00633c;">support@bulsuscholar.com</a> if you believe your account is at risk.</p>
          <p style="margin:10px 0 0;color:#102a20;font-size:12px;font-weight:700;">https://bulsuscholar.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

## Required Auth Settings

```txt
Site URL:
https://bulsuscholar.com

Redirect URLs:
https://bulsuscholar.com/*
https://bulsuscholar.com/confirm-email
https://bulsuscholar.com/reset-password
```

Supabase SMTP uses `smtp-relay.brevo.com:587`, the Brevo SMTP login, and the
Brevo SMTP key. The sender is `BulsuScholar <no-reply@bulsuscholar.com>`.
