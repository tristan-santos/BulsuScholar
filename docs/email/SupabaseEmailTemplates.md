# Supabase Email Templates

Use these templates in the Supabase Dashboard.

## Reset Password

Dashboard path:

```txt
Supabase Dashboard -> Authentication -> Email Templates -> Reset Password
```

Subject:

```txt
Reset your BulsuScholar password
```

Body:

```html
<div style="margin:0;padding:0;background:#f4f8f6;font-family:Arial,Helvetica,sans-serif;color:#0b1f17;">
  <div style="max-width:640px;margin:0 auto;padding:32px 18px;">
    <div style="background:linear-gradient(135deg,#ffffff 0%,#eaf6f1 100%);border:1px solid #cfe1d8;border-radius:16px;overflow:hidden;box-shadow:0 18px 44px rgba(7,45,31,0.10);">
      <div style="height:8px;background:#00633C;"></div>
      <div style="padding:30px 30px 18px;text-align:center;">
        <div style="display:inline-block;width:64px;height:64px;border-radius:50%;background:#e8f5ef;color:#00633C;line-height:64px;font-size:28px;font-weight:700;margin-bottom:16px;">BS</div>
        <h1 style="margin:0;color:#063d29;font-size:26px;line-height:1.2;font-weight:700;">Reset your password</h1>
        <p style="margin:12px auto 0;max-width:460px;color:#50657a;font-size:15px;line-height:1.6;">We received a request to change the password for your BulsuScholar account.</p>
      </div>
      <div style="padding:10px 30px 30px;">
        <div style="background:#ffffff;border:1px solid #d7e5dd;border-radius:12px;padding:22px;text-align:center;">
          <p style="margin:0 0 22px;color:#23364a;font-size:15px;line-height:1.6;">Use the secure button below to create a new password. This link should only be used by you.</p>
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#00633C;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:8px;font-size:15px;font-weight:700;">Reset Password</a>
          <p style="margin:22px 0 0;color:#6b7c90;font-size:13px;line-height:1.5;">If the button does not work, copy and paste this link into your browser:</p>
          <p style="margin:8px 0 0;word-break:break-all;color:#00633C;font-size:12px;line-height:1.5;">{{ .ConfirmationURL }}</p>
        </div>
        <p style="margin:18px 0 0;color:#6b7c90;font-size:13px;line-height:1.6;text-align:center;">If you did not request this password reset, you can safely ignore this email.</p>
        <p style="margin:18px 0 0;color:#0b1f17;font-size:14px;text-align:center;">BulsuScholar</p>
      </div>
    </div>
  </div>
</div>
```

Required auth URL settings:

```txt
Site URL: https://bulsu-scholar.vercel.app
Redirect URL: https://bulsu-scholar.vercel.app/reset-password
```
