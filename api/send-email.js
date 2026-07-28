import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)
const DEFAULT_RESEND_FROM_EMAIL = "BulsuScholar <onboarding@resend.dev>"

export default async function handler(request, response) {
	if (request.method !== "POST") {
		response.setHeader("Allow", "POST")
		return response.status(405).json({ error: "Method not allowed" })
	}

	if (!process.env.RESEND_API_KEY) {
		return response.status(500).json({ error: "RESEND_API_KEY is not configured." })
	}

	const { to, toEmail, toName, subject, html } = request.body || {}
	const recipient = to || toEmail
	if (!recipient || !subject || !html) {
		return response.status(400).json({ error: "Missing to, subject, or html." })
	}

	try {
		const result = await resend.emails.send({
			from: process.env.RESEND_FROM_EMAIL || DEFAULT_RESEND_FROM_EMAIL,
			to: recipient,
			subject,
			html: toName ? `<p>Hello ${toName},</p>${html}` : html,
		})
		return response.status(200).json({ sent: true, result })
	} catch (error) {
		return response.status(500).json({ error: error?.message || "Email send failed." })
	}
}
