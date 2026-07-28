const BACKEND_API_URL = (
	import.meta.env.VITE_BACKEND_API_URL ||
	import.meta.env.VITE_DOCUMENT_SCAN_API_URL ||
	"https://bulsuscholar.onrender.com"
).replace(/\/$/, "")
const RESEND_ENDPOINT = import.meta.env.VITE_RESEND_API_ENDPOINT || `${BACKEND_API_URL}/email/send`
const APP_URL = (import.meta.env.VITE_APP_URL || import.meta.env.VITE_PUBLIC_SITE_URL || "https://bulsu-scholar.vercel.app").replace(/\/$/, "")

/**
 * Sends an email through the Python Resend endpoint.
 * @param {string} toEmail - Recipient's email address
 * @param {string} toName - Recipient's name
 * @param {string} subject - Email subject
 * @param {string} messageBody - Dynamic HTML content for the email body
 */
export const sendEmailNotification = async (toEmail, toName, subject, messageBody) => {
  const normalizedEmail = String(toEmail || "").trim();
  const normalizedName = String(toName || "").trim();
  const normalizedSubject = String(subject || "").trim();

  if (!RESEND_ENDPOINT) {
    console.warn('Resend endpoint missing. Email not sent.');
    return { sent: false, reason: "missing_config" };
  }

  if (!normalizedEmail) {
    console.warn("Email recipient missing. Email not sent.");
    return { sent: false, reason: "missing_recipient" };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: normalizedEmail,
        toName: normalizedName,
        subject: normalizedSubject,
        html: messageBody,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.sent === false) {
      const detail = data?.detail || data;
      const reason = detail?.reason || data?.error || `Email failed: ${response.status}`;
      console.error("Email endpoint rejected request:", detail);
      throw new Error(reason);
    }
    return { sent: true, response: data };
  } catch (error) {
    console.error('Email failed to send:', error);
    throw error;
  }
};

const escapeHtml = (value = "") =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const buildModernEmailLayout = ({
  eyebrow = "BulsuScholar",
  title = "",
  intro = "",
  buttonLabel = "",
  buttonUrl = "",
  children = "",
  footerNote = "This message was sent by BulsuScholar. Please do not share secure account links with anyone.",
}) => `
  <div data-bulsuscholar-email="true" style="margin:0;padding:0;background:#eef7f3;font-family:Arial,Helvetica,sans-serif;color:#0b1f17;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eef7f3;">
      <tr>
        <td align="center" style="padding:30px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;border-collapse:collapse;background:#ffffff;border:1px solid #cfe1d8;border-radius:14px;overflow:hidden;box-shadow:0 18px 42px rgba(2,48,31,0.12);">
            <tr>
              <td style="height:8px;background:#00633c;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:30px 30px 22px;background:linear-gradient(135deg,#ffffff 0%,#eef8f3 100%);border-bottom:1px solid #dbe9e2;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="vertical-align:middle;width:62px;">
                      <div style="width:52px;height:52px;border-radius:50%;background:#00633c;color:#ffffff;text-align:center;line-height:52px;font-size:20px;font-weight:700;">BS</div>
                    </td>
                    <td style="vertical-align:middle;">
                      <div style="color:#00633c;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">${eyebrow}</div>
                      <div style="color:#17342a;font-size:16px;font-weight:700;margin-top:3px;">BulSU Scholarship Portal</div>
                    </td>
                  </tr>
                </table>
                <h1 style="margin:28px 0 0;color:#052f20;font-size:30px;line-height:1.18;font-weight:800;">${title}</h1>
                ${intro ? `<p style="margin:12px 0 0;color:#43566b;font-size:15px;line-height:1.65;">${intro}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px 30px;">
                ${children}
                ${buttonLabel && buttonUrl ? `
                  <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px auto 22px;border-collapse:collapse;">
                    <tr>
                      <td align="center" style="border-radius:8px;background:#00633c;">
                        <a href="${buttonUrl}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;border-radius:8px;">${buttonLabel}</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;color:#6a7b8e;font-size:12px;line-height:1.55;text-align:center;">If the button does not work, copy and paste this link into your browser:</p>
                  <p style="margin:8px 0 0;color:#00633c;font-size:12px;line-height:1.5;word-break:break-all;text-align:center;">${buttonUrl}</p>
                ` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 30px;background:#f7fbf9;border-top:1px solid #dbe9e2;text-align:center;">
                <p style="margin:0;color:#607083;font-size:12px;line-height:1.55;">${footerNote}</p>
                <p style="margin:8px 0 0;color:#17342a;font-size:12px;font-weight:700;">BulsuScholar</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
`;

/**
 * Generates the HTML for the Welcome Email
 */
export const getWelcomeEmailBody = (studentName = "Student", options = {}) => {
  const safeName = escapeHtml(studentName || "Student");
  const dashboardUrl = options.dashboardUrl || `${APP_URL}/student/dashboard`;
  const verificationLabel = options.isAutoVerified === false ? "Account submitted for review" : "Account ready";
  const verificationCopy = options.isAutoVerified === false
    ? "Your account was created and is waiting for manual verification. You can still keep your information ready while the office reviews your documents."
    : "Your account has been created successfully. You can now access the student portal after confirming your email address.";

  return buildModernEmailLayout({
    eyebrow: "Welcome",
    title: `Welcome to BulsuScholar, ${safeName}`,
    intro: "Your scholarship portal account has been created. BulsuScholar helps you monitor announcements, applications, documents, and scholarship progress in one place.",
    buttonLabel: "Open Student Portal",
    buttonUrl: dashboardUrl,
    children: `
      <div style="border-radius:16px;overflow:hidden;background:#00633c;box-shadow:0 16px 34px rgba(0,99,60,0.18);">
        <div style="padding:22px 22px;background:linear-gradient(135deg,#00633c 0%,#16875c 58%,#eef8f3 180%);">
          <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,0.16);color:#ffffff;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;">${verificationLabel}</div>
          <p style="margin:12px 0 0;color:#ffffff;font-size:20px;line-height:1.35;font-weight:800;">Your student scholarship workspace is ready.</p>
          <p style="margin:8px 0 0;color:#dff8ec;font-size:14px;line-height:1.65;">${verificationCopy}</p>
        </div>
      </div>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border-collapse:separate;border-spacing:0 10px;">
        <tr>
          <td style="width:42px;vertical-align:top;">
            <div style="width:32px;height:32px;border-radius:50%;background:#e8f5ef;color:#00633c;text-align:center;line-height:32px;font-size:13px;font-weight:800;">1</div>
          </td>
          <td style="padding:0 0 0 4px;vertical-align:top;">
            <strong style="display:block;color:#052f20;font-size:14px;">Confirm your email</strong>
            <span style="display:block;margin-top:3px;color:#53667b;font-size:13px;line-height:1.5;">Use the verification email from Supabase if your account still asks for confirmation.</span>
          </td>
        </tr>
        <tr>
          <td style="width:42px;vertical-align:top;">
            <div style="width:32px;height:32px;border-radius:50%;background:#e8f5ef;color:#00633c;text-align:center;line-height:32px;font-size:13px;font-weight:800;">2</div>
          </td>
          <td style="padding:0 0 0 4px;vertical-align:top;">
            <strong style="display:block;color:#052f20;font-size:14px;">Review your document vault</strong>
            <span style="display:block;margin-top:3px;color:#53667b;font-size:13px;line-height:1.5;">Check your COR, ROG, Student ID, and application form records after signing in.</span>
          </td>
        </tr>
        <tr>
          <td style="width:42px;vertical-align:top;">
            <div style="width:32px;height:32px;border-radius:50%;background:#e8f5ef;color:#00633c;text-align:center;line-height:32px;font-size:13px;font-weight:800;">3</div>
          </td>
          <td style="padding:0 0 0 4px;vertical-align:top;">
            <strong style="display:block;color:#052f20;font-size:14px;">Watch announcements and inbox</strong>
            <span style="display:block;margin-top:3px;color:#53667b;font-size:13px;line-height:1.5;">Grantor updates, application actions, and system notices will appear in your student portal.</span>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-collapse:collapse;">
        <tr>
          <td style="padding:14px;border:1px solid #dbe9e2;border-radius:12px;background:#fbfefc;">
            <div style="color:#00633c;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;">What you can do next</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 8px;border-right:1px solid #dbe9e2;text-align:center;">
                  <strong style="display:block;color:#052f20;font-size:13px;">Progress</strong>
                  <span style="display:block;margin-top:4px;color:#53667b;font-size:12px;line-height:1.45;">Track stages</span>
                </td>
                <td style="padding:10px 8px;border-right:1px solid #dbe9e2;text-align:center;">
                  <strong style="display:block;color:#052f20;font-size:13px;">Inbox</strong>
                  <span style="display:block;margin-top:4px;color:#53667b;font-size:12px;line-height:1.45;">Read notices</span>
                </td>
                <td style="padding:10px 8px;text-align:center;">
                  <strong style="display:block;color:#052f20;font-size:13px;">Documents</strong>
                  <span style="display:block;margin-top:4px;color:#53667b;font-size:12px;line-height:1.45;">Manage files</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `,
  });
};

/**
 * Generates the HTML for Password Reset Email
 */
export const getForgotPasswordEmailBody = (resetLink) => {
  return buildModernEmailLayout({
    eyebrow: "Account Security",
    title: "Reset your BulsuScholar password",
    intro: "We received a request to change your account password. Use the secure button below to create a new one.",
    buttonLabel: "Reset Password",
    buttonUrl: resetLink,
    children: `
      <div style="border:1px solid #f1d7d7;background:#fff8f8;border-radius:12px;padding:16px;color:#7f1d1d;font-size:13px;line-height:1.6;">
        If you did not request this password reset, ignore this email. Your password will not change unless this link is opened and a new password is saved.
      </div>
    `,
  });
};

export const getAccountVerificationEmailBody = (confirmationLink) => {
  return buildModernEmailLayout({
    eyebrow: "Verify Account",
    title: "Confirm your BulsuScholar email",
    intro: "Complete your account setup by confirming that this email address belongs to you.",
    buttonLabel: "Verify Email Address",
    buttonUrl: confirmationLink,
    children: `
      <div style="border:1px solid #dbe9e2;background:#fbfefc;border-radius:12px;padding:16px;color:#314357;font-size:14px;line-height:1.65;">
        After verification, you can sign in to the student portal and continue tracking your scholarship records, announcements, and required documents.
      </div>
    `,
  });
};

/**
 * Generates the HTML for Scholarship Approval
 */
export const getScholarshipApprovalEmailBody = (studentName, scholarshipName) => {
  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #00633C;">Scholarship Application Approved!</h2>
      <p>Hello ${studentName},</p>
      <p>Congratulations! Your application for the <strong>${scholarshipName}</strong> has been <strong>Approved</strong>.</p>
      <p>You can now view your updated status in your student dashboard.</p>
      <p>Keep up the great work!</p>
      <p>Best Regards,<br><strong>The BulsuScholar Team</strong></p>
    </div>
  `;
};

/**
 * Generates the HTML for Scholarship Disapproval
 */
export const getScholarshipDisapprovalEmailBody = (studentName, scholarshipName, reason = "") => {
  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #d32f2f;">Scholarship Application Status</h2>
      <p>Hello ${studentName},</p>
      <p>We regret to inform you that your application for the <strong>${scholarshipName}</strong> has been <strong>Disapproved</strong> at this time.</p>
      ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
      <p>If you believe this is an error, or wish to appeal this decision, please contact the Scholarship Office.</p>
      <p>Best Regards,<br><strong>The BulsuScholar Team</strong></p>
    </div>
  `;
};

/**
 * Generates the HTML for multiple scholarship compliance notice
 */
export const getMultipleScholarshipComplianceEmailBody = (studentName, scholarshipNames = []) => {
  const visibleScholarships = Array.isArray(scholarshipNames)
    ? scholarshipNames.filter(Boolean)
    : [];
  const scholarshipListMarkup = visibleScholarships.length > 0
    ? `
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #d1fae5; margin: 20px 0;">
        <p style="margin-top: 0; font-weight: bold; color: #166534;">Scholarships currently on your record:</p>
        <ul style="padding-left: 20px; margin-bottom: 0;">
          ${visibleScholarships.map((name) => `<li>${name}</li>`).join('')}
        </ul>
      </div>
    `
    : '';

  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #d97706;">Scholarship Compliance Required</h2>
      <p>Hello ${studentName},</p>
      <p>Your account currently shows multiple scholarship records. Under the one scholarship per student policy, you must keep only one scholarship in your account.</p>
      ${scholarshipListMarkup}
      <p>The scholarship office has temporarily placed your scholarship eligibility on hold until you comply.</p>
      <p>Please log in to your student dashboard and choose only one scholarship record to restore your scholarship eligibility.</p>
      <p>Best Regards,<br><strong>The BulsuScholar Team</strong></p>
    </div>
  `;
};

/**
 * Generates the HTML for SOE Request Approval
 */
export const getSoeApprovalEmailBody = (studentName, scholarshipName) => {
  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #00633C;">SOE Request Approved</h2>
      <p>Hello ${studentName},</p>
      <p>Your Request for a Statement of Expenditures (SOE) for <strong>${scholarshipName}</strong> has been <strong>Approved</strong>.</p>
      <p>You can now download your SOE directly from your dashboard.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="#" style="background-color: #00633C; color: #ffffff; padding: 12px 25px; text-decoration: none; font-weight: bold; border-radius: 5px; display: inline-block;">Go to Dashboard</a>
      </div>
      <p>Best Regards,<br><strong>The BulsuScholar Team</strong></p>
    </div>
  `;
};

/**
 * Generates the HTML for SOE Request Disapproval
 */
export const getSoeDisapprovalEmailBody = (studentName, scholarshipName, reason = "") => {
  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #d32f2f;">SOE Request Disapproved</h2>
      <p>Hello ${studentName},</p>
      <p>Your SOE request for <strong>${scholarshipName}</strong> was not approved.</p>
      ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
      <p>Please review your request and resubmit with the correct information, or contact the office for clarification.</p>
      <p>Best Regards,<br><strong>The BulsuScholar Team</strong></p>
    </div>
  `;
};

/**
 * Generates the HTML for Account Disapproval
 */
export const getAccountDisapprovalEmailBody = (studentName, reason = "") => {
  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #d32f2f;">Account Verification Status</h2>
      <p>Hello ${studentName},</p>
      <p>Thank you for registering with BulsuScholar.</p>
      <p>We regret to inform you that your account verification request has been <strong>Disapproved</strong> at this time.</p>
      ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : '<p>This may be due to incomplete documentation or eligibility requirements.</p>'}
      <p>If you believe this is an error, please contact the Scholarship Office for more information.</p>
      <p>Best Regards,<br><strong>The BulsuScholar Team</strong></p>
    </div>
  `;
};
