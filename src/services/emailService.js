const BACKEND_API_URL = (
	import.meta.env.VITE_BACKEND_API_URL ||
	import.meta.env.VITE_DOCUMENT_SCAN_API_URL ||
	"https://bulsuscholar.onrender.com"
).replace(/\/$/, "")
const RESEND_ENDPOINT = import.meta.env.VITE_RESEND_API_ENDPOINT || `${BACKEND_API_URL}/email/send`

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

/**
 * Generates the HTML for the Welcome Email
 */
export const getWelcomeEmailBody = (studentName) => {
  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #00633C;">Welcome to BulsuScholar, ${studentName}!</h2>
      <p>We are excited to have you on board. Our goal is to make your scholarship journey as simple and accessible as possible.</p>
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; border-left: 5px solid #00633C; margin: 20px 0;">
        <p style="margin-top: 0; font-weight: bold;">What you can do now:</p>
        <ul style="padding-left: 20px;">
          <li>View available scholarship programs.</li>
          <li>Request your Statement of Enrollment (SOE).</li>
          <li>Track your application status in real-time.</li>
        </ul>
      </div>
      <p>To get started, please log in to your dashboard to manage your scholarships.</p>
      <p>If you have any questions, our support team is here to help!</p>
      <p>Best Regards,<br><strong>The BulsuScholar Team</strong></p>
    </div>
  `;
};

/**
 * Generates the HTML for Password Reset Email
 */
export const getForgotPasswordEmailBody = (resetLink) => {
  return `
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
              <a href="${resetLink}" style="display:inline-block;background:#00633C;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:8px;font-size:15px;font-weight:700;">Reset Password</a>
              <p style="margin:22px 0 0;color:#6b7c90;font-size:13px;line-height:1.5;">If the button does not work, copy and paste this link into your browser:</p>
              <p style="margin:8px 0 0;word-break:break-all;color:#00633C;font-size:12px;line-height:1.5;">${resetLink}</p>
            </div>
            <p style="margin:18px 0 0;color:#6b7c90;font-size:13px;line-height:1.6;text-align:center;">If you did not request this password reset, you can safely ignore this email.</p>
            <p style="margin:18px 0 0;color:#0b1f17;font-size:14px;text-align:center;">BulsuScholar</p>
          </div>
        </div>
      </div>
    </div>
  `;
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
