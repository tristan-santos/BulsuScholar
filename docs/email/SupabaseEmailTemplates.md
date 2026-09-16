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
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Confirm your BulsuScholar account</title>
</head>
<body style="margin:0;padding:0;background:#edf3f0;color:#172b24;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">One final step: verify your email to securely activate your BulsuScholar account.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background:#edf3f0;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;border-collapse:separate;background:#ffffff;border:1px solid #cbdcd4;border-radius:8px;box-shadow:0 10px 30px rgba(22,52,40,.10);overflow:hidden;">
        <tr><td style="height:7px;background:#00633c;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:24px 30px;background:#f8fbf9;border-bottom:1px solid #deebe5;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td width="52" valign="middle">
                <table role="presentation" width="44" height="44" cellspacing="0" cellpadding="0" border="0" style="width:44px;height:44px;border-collapse:separate;background:#00633c;border-radius:50%;"><tr><td align="center" valign="middle" style="color:#ffffff;font-size:20px;font-weight:800;">B</td></tr></table>
              </td>
              <td valign="middle">
                <p style="margin:0;color:#102a20;font-size:19px;font-weight:800;line-height:1.2;">BulsuScholar</p>
                <p style="margin:4px 0 0;color:#63766e;font-size:12px;line-height:1.4;">Scholarship Management Portal</p>
              </td>
              <td align="right" valign="middle"><span style="display:inline-block;padding:6px 9px;border:1px solid #b9d8ca;border-radius:4px;background:#edf7f2;color:#00633c;font-size:11px;font-weight:700;">ACCOUNT ACTIVATION</span></td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:34px 30px 16px;">
          <p style="margin:0;color:#b7791f;font-size:12px;font-weight:800;text-transform:uppercase;">Email verification required</p>
          <h1 style="margin:10px 0 0;color:#102a20;font-size:28px;line-height:1.25;font-weight:800;">Confirm your email address</h1>
          <p style="margin:14px 0 0;color:#52665e;font-size:15px;line-height:1.7;">Your BulsuScholar account has been created for <strong style="color:#172b24;">{{ .Email }}</strong>. Verify that this address belongs to you before accessing student records and scholarship services.</p>
        </td></tr>
        <tr><td align="center" style="padding:14px 30px 28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="#00633c" style="border:1px solid #00633c;border-radius:6px;">
            <a href="{{ .ConfirmationURL }}" aria-label="Confirm your BulsuScholar email address" style="display:inline-block;min-width:220px;padding:15px 24px;color:#ffffff;text-align:center;text-decoration:none;font-size:15px;font-weight:800;line-height:1.2;">Confirm Email Address&nbsp;&nbsp;&rarr;</a>
          </td></tr></table>
          <p style="margin:13px 0 0;color:#6b7c75;font-size:12px;line-height:1.5;">This secure link can only be used for this verification request.</p>
        </td></tr>
        <tr><td style="padding:0 30px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;border:1px solid #d9e7e1;border-radius:6px;background:#f8fbf9;">
            <tr><td colspan="3" style="padding:16px 18px 12px;color:#172b24;font-size:13px;font-weight:800;">What happens next</td></tr>
            <tr>
              <td width="33.33%" valign="top" style="padding:0 10px 17px 18px;color:#52665e;font-size:12px;line-height:1.5;"><strong style="display:block;margin-bottom:4px;color:#00633c;font-size:18px;">1</strong>Verify this email</td>
              <td width="33.33%" valign="top" style="padding:0 10px 17px;color:#52665e;font-size:12px;line-height:1.5;"><strong style="display:block;margin-bottom:4px;color:#00633c;font-size:18px;">2</strong>Confirm your student record</td>
              <td width="33.33%" valign="top" style="padding:0 18px 17px 10px;color:#52665e;font-size:12px;line-height:1.5;"><strong style="display:block;margin-bottom:4px;color:#00633c;font-size:18px;">3</strong>Access your dashboard</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 30px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;border-left:4px solid #d69e2e;background:#fffaf0;">
            <tr><td style="padding:14px 16px;color:#6b4f16;font-size:12px;line-height:1.6;"><strong style="display:block;margin-bottom:2px;color:#5b4213;">Did not create this account?</strong>No action is required. Do not forward this message or share its verification link.</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 30px;background:#102a20;">
          <p style="margin:0;color:#dce9e3;font-size:12px;line-height:1.6;">Button not working? Paste this URL into your browser:</p>
          <p style="margin:7px 0 0;color:#8ee0b8;font-size:11px;line-height:1.5;word-break:break-all;">{{ .ConfirmationURL }}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:17px;border-collapse:collapse;border-top:1px solid #365046;"><tr>
            <td style="padding-top:14px;color:#b9c9c2;font-size:11px;line-height:1.5;">Need assistance? <a href="mailto:support@bulsuscholar.com" style="color:#ffffff;text-decoration:underline;">support@bulsuscholar.com</a></td>
            <td align="right" style="padding-top:14px;color:#b9c9c2;font-size:11px;">bulsuscholar.com</td>
          </tr></table>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:#718079;font-size:11px;line-height:1.5;">This is an automated account-security message from BulsuScholar.</p>
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
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Reset your BulsuScholar password</title>
</head>
<body style="margin:0;padding:0;background:#edf3f0;color:#172b24;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">A secure password reset was requested for your BulsuScholar account.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background:#edf3f0;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;border-collapse:separate;background:#ffffff;border:1px solid #cbdcd4;border-radius:8px;box-shadow:0 10px 30px rgba(22,52,40,.10);overflow:hidden;">
        <tr><td style="height:7px;background:#b42318;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:24px 30px;background:#f8fbf9;border-bottom:1px solid #deebe5;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td width="52" valign="middle">
                <table role="presentation" width="44" height="44" cellspacing="0" cellpadding="0" border="0" style="width:44px;height:44px;border-collapse:separate;background:#00633c;border-radius:50%;"><tr><td align="center" valign="middle" style="color:#ffffff;font-size:20px;font-weight:800;">B</td></tr></table>
              </td>
              <td valign="middle">
                <p style="margin:0;color:#102a20;font-size:19px;font-weight:800;line-height:1.2;">BulsuScholar</p>
                <p style="margin:4px 0 0;color:#63766e;font-size:12px;line-height:1.4;">Account Security</p>
              </td>
              <td align="right" valign="middle"><span style="display:inline-block;padding:6px 9px;border:1px solid #f1b8b4;border-radius:4px;background:#fff1f0;color:#9f1c13;font-size:11px;font-weight:700;">SECURITY REQUEST</span></td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:34px 30px 16px;">
          <p style="margin:0;color:#b42318;font-size:12px;font-weight:800;text-transform:uppercase;">Password assistance</p>
          <h1 style="margin:10px 0 0;color:#102a20;font-size:28px;line-height:1.25;font-weight:800;">Reset your password</h1>
          <p style="margin:14px 0 0;color:#52665e;font-size:15px;line-height:1.7;">We received a password-reset request for <strong style="color:#172b24;">{{ .Email }}</strong>. Continue only if you made this request.</p>
        </td></tr>
        <tr><td align="center" style="padding:14px 30px 28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="#00633c" style="border:1px solid #00633c;border-radius:6px;">
            <a href="{{ .ConfirmationURL }}" aria-label="Reset your BulsuScholar password" style="display:inline-block;min-width:220px;padding:15px 24px;color:#ffffff;text-align:center;text-decoration:none;font-size:15px;font-weight:800;line-height:1.2;">Reset Password&nbsp;&nbsp;&rarr;</a>
          </td></tr></table>
          <p style="margin:13px 0 0;color:#6b7c75;font-size:12px;line-height:1.5;">The link is tied to this request and should not be shared.</p>
        </td></tr>
        <tr><td style="padding:0 30px 26px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;border:1px solid #d9e7e1;border-radius:6px;background:#f8fbf9;">
            <tr><td style="padding:16px 18px 9px;color:#172b24;font-size:13px;font-weight:800;">Before you continue</td></tr>
            <tr><td style="padding:0 18px 16px;color:#52665e;font-size:12px;line-height:1.75;">
              <span style="color:#00633c;font-weight:800;">01&nbsp;</span> Open the link on a device you trust.<br>
              <span style="color:#00633c;font-weight:800;">02&nbsp;</span> Create a new, unique password.<br>
              <span style="color:#00633c;font-weight:800;">03&nbsp;</span> Never disclose your password to another person.
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 30px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;border-left:4px solid #b42318;background:#fff5f4;">
            <tr><td style="padding:14px 16px;color:#762018;font-size:12px;line-height:1.6;"><strong style="display:block;margin-bottom:2px;color:#671b15;">Did not request a reset?</strong>Do not click the button. Your current password remains unchanged. Contact support if you notice suspicious account activity.</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 30px;background:#102a20;">
          <p style="margin:0;color:#dce9e3;font-size:12px;line-height:1.6;">Button not working? Paste this URL into your browser:</p>
          <p style="margin:7px 0 0;color:#8ee0b8;font-size:11px;line-height:1.5;word-break:break-all;">{{ .ConfirmationURL }}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:17px;border-collapse:collapse;border-top:1px solid #365046;"><tr>
            <td style="padding-top:14px;color:#b9c9c2;font-size:11px;line-height:1.5;">Security support: <a href="mailto:support@bulsuscholar.com" style="color:#ffffff;text-decoration:underline;">support@bulsuscholar.com</a></td>
            <td align="right" style="padding-top:14px;color:#b9c9c2;font-size:11px;">bulsuscholar.com</td>
          </tr></table>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:#718079;font-size:11px;line-height:1.5;">This is an automated security message from BulsuScholar.</p>
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
