# BulsuScholar: Welcome Email Template

This document contains the official HTML template for the student welcome email. It follows the senior-friendly design principles: high-contrast, large typography, and a clear call-to-action.

---

## 1. Visual Specification
- **Base Font Size:** 18px (for readability).
- **Primary Color:** `#00633C` (BulSU Green).
- **Secondary Background:** `#f4f4f4`.
- **Button Style:** Large, bold, centered with a 2px border for high visibility.

---

## 2. HTML Source Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to BulsuScholar</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; color: #333333; }
        .email-wrapper { width: 100%; background-color: #f4f4f4; padding: 20px 0; }
        .email-content { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #dddddd; }
        .header { background-color: #00633C; padding: 40px 20px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 32px; letter-spacing: 1px; }
        .body-content { padding: 40px 30px; line-height: 1.8; }
        .body-content h2 { font-size: 26px; color: #00633C; margin-top: 0; }
        .body-content p { font-size: 18px; margin-bottom: 25px; }
        .btn-container { text-align: center; padding: 20px 0; }
        .cta-button { background-color: #00633C; color: #ffffff !important; padding: 20px 40px; text-decoration: none; font-size: 20px; font-weight: bold; border-radius: 8px; display: inline-block; border: 2px solid #004d2e; }
        .features { background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #00633C; }
        .features ul { padding-left: 20px; margin: 0; }
        .features li { font-size: 18px; margin-bottom: 10px; }
        .footer { background-color: #eeeeee; padding: 30px 20px; text-align: center; font-size: 14px; color: #666666; border-top: 1px solid #dddddd; }
        .footer p { margin: 5px 0; }
        @media screen and (max-width: 600px) { .body-content { padding: 20px 15px; } .header h1 { font-size: 24px; } }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="email-content">
            <div class="header">
                <h1>BulsuScholar</h1>
            </div>
            <div class="body-content">
                <h2>Welcome to the Portal!</h2>
                <p>Hello,</p>
                <p>We are excited to have you on <strong>BulsuScholar</strong>. Our goal is to make your scholarship journey as simple and accessible as possible.</p>
                <div class="features">
                    <p style="margin-bottom: 10px; font-weight: bold;">What you can do now:</p>
                    <ul>
                        <li>View available scholarship programs.</li>
                        <li>Request your Statement of Enrollment (SOE).</li>
                        <li>Track your application status in real-time.</li>
                    </ul>
                </div>
                <p>To get started, please log in to your dashboard using the button below:</p>
                <div class="btn-container">
                    <a href="https://your-website-url.com/login" class="cta-button">Go to My Dashboard</a>
                </div>
                <p>If you have any questions or need help navigating the system, our support team is just an email away.</p>
                <p>Best Regards,<br><strong>The BulsuScholar Team</strong></p>
            </div>
            <div class="footer">
                <p>&copy; 2026 Bulacan State University - Scholarship Office</p>
                <p>Malolos City, Bulacan, Philippines</p>
            </div>
        </div>
    </div>
</body>
</html>
```
