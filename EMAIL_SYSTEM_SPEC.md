# Email Notification System Specification (EmailJS)

This document outlines the implementation plan for the automated email notification system using **EmailJS**. The system will use a single dynamic template with a fixed header and footer, where the `message_body` variable will change depending on the notification type.

---

## 1. Environment Configuration (.env)
Add these private credentials to your `.env` file. **Never commit the `.env` file to version control.**

```env
VITE_EMAILJS_SERVICE_ID=your_service_id_here
VITE_EMAILJS_TEMPLATE_ID=your_template_id_here
VITE_EMAILJS_PUBLIC_KEY=your_public_key_here
```

---

## 2. Email Template Structure (EmailJS Dashboard)
The EmailJS template should be configured with the following parameters:
- **To Email:** `{{to_email}}`
- **To Name:** `{{to_name}}`
- **Subject:** `{{subject}}`
- **Body:** `{{message_body}}` (This will contain the dynamic HTML content)

### Base HTML Wrapper (Fixed Header/Footer)
The `message_body` will be injected into a layout similar to this:
- **Header:** BulsuScholar Logo/Title (BulSU Green: `#00633C`)
- **Footer:** Bulacan State University - Scholarship Office & Contact Info

---

## 3. Required Email Notifications

### A. Authentication & Account
1.  **Welcome Email**
    *   **Trigger:** Successful student registration.
    *   **Content:** Welcome message, brief overview of portal features (SOE, Scholarship Tracking).
2.  **Forgot Password**
    *   **Trigger:** Student requests a password reset.
    *   **Content:** Reset link/OTP with instructions.

### B. Scholarship Program (Kuya Win Scholarship)
1.  **Application Approved**
    *   **Trigger:** Admin approves the student's application for the Kuya Win Scholarship Program.
    *   **Content:** Congratulations message, next steps for the scholar.
2.  **Application Disapproved**
    *   **Trigger:** Admin rejects the application.
    *   **Content:** Regret message, reason for disapproval (if provided), and instructions for re-applying or contacting support.

### C. SOE (Statement of Expenditures) Requests
1.  **SOE Request Approved**
    *   **Trigger:** Admin approves an SOE request.
    *   **Content:** Notification that the SOE is ready for download/collection.
2.  **SOE Request Disapproved**
    *   **Trigger:** Admin rejects the SOE request.
    *   **Content:** Reason for rejection (e.g., "Incomplete data", "Incorrect attachment") and a prompt to resubmit.

---

## 4. Implementation Logic (Services)

A new service `src/services/emailService.js` should be created to centralize all email triggers.

```javascript
import emailjs from '@emailjs/browser';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

export const sendEmailNotification = async (toEmail, toName, subject, body) => {
  try {
    const templateParams = {
      to_email: toEmail,
      to_name: toName,
      subject: subject,
      message_body: body,
    };

    const response = await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY);
    return response;
  } catch (error) {
    console.error('Email failed to send:', error);
    throw error;
  }
};
```

---

## 5. Dynamic Content Guidelines
To maintain the "Senior-Friendly" and "Professional" look:
- **Contrast:** High contrast text (Dark gray on white background).
- **Buttons:** Use clear, large call-to-action buttons for links.
- **Tone:** Encouraging for approvals, professional and helpful for disapprovals.
