# BulsuScholar Supabase Auth Email Templates

Supabase sends account confirmation and password reset emails directly from Auth. To use the BulsuScholar design, paste these into:

Supabase Dashboard -> Authentication -> Email Templates

Use the matching template:
- Confirm signup: paste **Account Verification Email**
- Reset password: paste **Forgot Password Email**

## Account Verification Email

Subject:

```text
Confirm your BulsuScholar email
```

Body:

```html
<div data-bulsuscholar-email="true" style="margin:0;padding:0;background:#eef7f3;font-family:Arial,Helvetica,sans-serif;color:#0b1f17;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eef7f3;">
    <tr>
      <td align="center" style="padding:30px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;border-collapse:collapse;background:#ffffff;border:1px solid #cfe1d8;border-radius:14px;overflow:hidden;box-shadow:0 18px 42px rgba(2,48,31,0.12);">
          <tr><td style="height:8px;background:#00633c;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:30px 30px 22px;background:linear-gradient(135deg,#ffffff 0%,#eef8f3 100%);border-bottom:1px solid #dbe9e2;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <tr>
                  <td style="vertical-align:middle;width:62px;">
                    <div style="width:52px;height:52px;border-radius:50%;background:#00633c;color:#ffffff;text-align:center;line-height:52px;font-size:20px;font-weight:700;">BS</div>
                  </td>
                  <td style="vertical-align:middle;">
                    <div style="color:#00633c;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Verify Account</div>
                    <div style="color:#17342a;font-size:16px;font-weight:700;margin-top:3px;">BulSU Scholarship Portal</div>
                  </td>
                </tr>
              </table>
              <h1 style="margin:28px 0 0;color:#052f20;font-size:30px;line-height:1.18;font-weight:800;">Confirm your BulsuScholar email</h1>
              <p style="margin:12px 0 0;color:#43566b;font-size:15px;line-height:1.65;">Complete your account setup by confirming that this email address belongs to you.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 30px 30px;">
              <div style="border:1px solid #dbe9e2;background:#fbfefc;border-radius:12px;padding:16px;color:#314357;font-size:14px;line-height:1.65;">
                After verification, you can sign in to the student portal and continue tracking your scholarship records, announcements, and required documents.
              </div>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px auto 22px;border-collapse:collapse;">
                <tr>
                  <td align="center" style="border-radius:8px;background:#00633c;">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;border-radius:8px;">Verify Email Address</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#6a7b8e;font-size:12px;line-height:1.55;text-align:center;">If the button does not work, copy and paste this link into your browser:</p>
              <p style="margin:8px 0 0;color:#00633c;font-size:12px;line-height:1.5;word-break:break-all;text-align:center;">{{ .ConfirmationURL }}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 30px;background:#f7fbf9;border-top:1px solid #dbe9e2;text-align:center;">
              <p style="margin:0;color:#607083;font-size:12px;line-height:1.55;">This message was sent by BulsuScholar. Please do not share secure account links with anyone.</p>
              <p style="margin:8px 0 0;color:#17342a;font-size:12px;font-weight:700;">BulsuScholar</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
```

## Forgot Password Email

Subject:

```text
Reset your BulsuScholar password
```

Body:

```html
<div data-bulsuscholar-email="true" style="margin:0;padding:0;background:#eef7f3;font-family:Arial,Helvetica,sans-serif;color:#0b1f17;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eef7f3;">
    <tr>
      <td align="center" style="padding:30px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;border-collapse:collapse;background:#ffffff;border:1px solid #cfe1d8;border-radius:14px;overflow:hidden;box-shadow:0 18px 42px rgba(2,48,31,0.12);">
          <tr><td style="height:8px;background:#00633c;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:30px 30px 22px;background:linear-gradient(135deg,#ffffff 0%,#eef8f3 100%);border-bottom:1px solid #dbe9e2;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <tr>
                  <td style="vertical-align:middle;width:62px;">
                    <div style="width:52px;height:52px;border-radius:50%;background:#00633c;color:#ffffff;text-align:center;line-height:52px;font-size:20px;font-weight:700;">BS</div>
                  </td>
                  <td style="vertical-align:middle;">
                    <div style="color:#00633c;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Account Security</div>
                    <div style="color:#17342a;font-size:16px;font-weight:700;margin-top:3px;">BulSU Scholarship Portal</div>
                  </td>
                </tr>
              </table>
              <h1 style="margin:28px 0 0;color:#052f20;font-size:30px;line-height:1.18;font-weight:800;">Reset your BulsuScholar password</h1>
              <p style="margin:12px 0 0;color:#43566b;font-size:15px;line-height:1.65;">We received a request to change your account password. Use the secure button below to create a new one.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 30px 30px;">
              <div style="border:1px solid #f1d7d7;background:#fff8f8;border-radius:12px;padding:16px;color:#7f1d1d;font-size:13px;line-height:1.6;">
                If you did not request this password reset, ignore this email. Your password will not change unless this link is opened and a new password is saved.
              </div>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px auto 22px;border-collapse:collapse;">
                <tr>
                  <td align="center" style="border-radius:8px;background:#00633c;">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;border-radius:8px;">Reset Password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#6a7b8e;font-size:12px;line-height:1.55;text-align:center;">If the button does not work, copy and paste this link into your browser:</p>
              <p style="margin:8px 0 0;color:#00633c;font-size:12px;line-height:1.5;word-break:break-all;text-align:center;">{{ .ConfirmationURL }}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 30px;background:#f7fbf9;border-top:1px solid #dbe9e2;text-align:center;">
              <p style="margin:0;color:#607083;font-size:12px;line-height:1.55;">This message was sent by BulsuScholar. Please do not share secure account links with anyone.</p>
              <p style="margin:8px 0 0;color:#17342a;font-size:12px;font-weight:700;">BulsuScholar</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
```
