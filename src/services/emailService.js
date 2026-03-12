import emailjs from '@emailjs/browser';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

/**
 * Sends an email using EmailJS
 * @param {string} toEmail - Recipient's email address
 * @param {string} toName - Recipient's name
 * @param {string} subject - Email subject
 * @param {string} messageBody - Dynamic HTML content for the email body
 */
export const sendEmailNotification = async (toEmail, toName, subject, messageBody) => {
  const normalizedEmail = String(toEmail || "").trim();
  const normalizedName = String(toName || "").trim();
  const normalizedSubject = String(subject || "").trim();

  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    console.warn('EmailJS credentials missing. Email not sent.');
    return { sent: false, reason: "missing_config" };
  }

  if (!normalizedEmail) {
    console.warn("Email recipient missing. Email not sent.");
    return { sent: false, reason: "missing_recipient" };
  }

  try {
    const templateParams = {
      to_email: normalizedEmail,
      email: normalizedEmail,
      user_email: normalizedEmail,
      recipient_email: normalizedEmail,
      to_name: normalizedName,
      name: normalizedName,
      user_name: normalizedName,
      subject: normalizedSubject,
      message_body: messageBody,
    };

    const response = await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY);
    return { sent: true, response };
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
    <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #00633C;">Password Reset Request</h2>
      <p>You requested to reset your password for your BulsuScholar account.</p>
      <p>Please click the button below to set a new password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #00633C; color: #ffffff; padding: 12px 25px; text-decoration: none; font-weight: bold; border-radius: 5px; display: inline-block;">Reset My Password</a>
      </div>
      <p>If you did not request this, you can safely ignore this email.</p>
      <p>Best Regards,<br><strong>The BulsuScholar Team</strong></p>
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
