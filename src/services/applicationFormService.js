import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

function safeText(value, fallback = "N/A") {
	const text = String(value ?? "").trim()
	return text || fallback
}

function formatLongDate(value = new Date()) {
	const date = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(date.getTime())) return "N/A"
	return date.toLocaleDateString("en-PH", {
		day: "2-digit",
		month: "long",
		year: "numeric",
	})
}

export async function exportApplicationFormPdfDocument({
	student = {},
	studentId = "",
	scholarship = {},
	autoDownload = true,
} = {}) {
	const pdfDoc = await PDFDocument.create()
	const page = pdfDoc.addPage([612, 792])
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
	const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

	const fullName =
		[student?.fname, student?.mname, student?.lname].filter(Boolean).join(" ") || "Student"
	const scholarshipName = safeText(scholarship?.name || scholarship?.provider, "Scholarship")
	const provider = safeText(scholarship?.provider || scholarship?.name, "Scholarship Office")
	const applicationNumber = safeText(
		scholarship?.applicationNumber || scholarship?.requestNumber || scholarship?.id,
		"Pending",
	)
	const course = safeText(student?.course)
	const yearLevel = safeText(student?.year)
	const section = safeText(student?.section)
	const email = safeText(student?.email)
	const contact = safeText(student?.contact || student?.mobile)

	page.drawText("BulsuScholar Application Form", {
		x: 50,
		y: 735,
		size: 22,
		font: boldFont,
		color: rgb(0.04, 0.34, 0.17),
	})

	page.drawText("Requested scholarship application document for student release.", {
		x: 50,
		y: 712,
		size: 10,
		font,
		color: rgb(0.29, 0.33, 0.38),
	})

	const rows = [
		["Date Generated", formatLongDate()],
		["Student Name", fullName],
		["Student ID", safeText(studentId || student?.studentnumber)],
		["Scholarship", scholarshipName],
		["Provider", provider],
		["Application Number", applicationNumber],
		["Course", course],
		["Year / Section", `${yearLevel} / ${section}`],
		["Email", email],
		["Contact Number", contact],
	]

	let currentY = 660
	rows.forEach(([label, value]) => {
		page.drawText(label, {
			x: 52,
			y: currentY,
			size: 10,
			font: boldFont,
			color: rgb(0.12, 0.18, 0.24),
		})
		page.drawText(value, {
			x: 210,
			y: currentY,
			size: 10,
			font,
			color: rgb(0.12, 0.18, 0.24),
		})
		currentY -= 28
	})

	page.drawText("Declaration", {
		x: 50,
		y: 360,
		size: 12,
		font: boldFont,
		color: rgb(0.04, 0.34, 0.17),
	})

	page.drawText(
		"I confirm that the information reflected in this generated application form follows the current scholarship record stored in BulsuScholar. This document is issued upon approved student request.",
		{
			x: 50,
			y: 336,
			size: 10,
			font,
			color: rgb(0.29, 0.33, 0.38),
			maxWidth: 510,
			lineHeight: 14,
		},
	)

	page.drawText("Office of Scholarships", {
		x: 50,
		y: 120,
		size: 11,
		font: boldFont,
		color: rgb(0.12, 0.18, 0.24),
	})
	page.drawText("Bulacan State University", {
		x: 50,
		y: 104,
		size: 10,
		font,
		color: rgb(0.29, 0.33, 0.38),
	})

	const pdfBytes = await pdfDoc.save()

	if (autoDownload) {
		downloadApplicationFormPdfBytes(
			pdfBytes,
			`Application_Form_${safeText(studentId || student?.studentnumber, "student")}.pdf`,
		)
	}

	return { pdfBytes }
}

export function downloadApplicationFormPdfBytes(
	pdfBytes,
	fileName = "Application_Form.pdf",
) {
	const blob = new Blob([pdfBytes], { type: "application/pdf" })
	const link = document.createElement("a")
	const url = URL.createObjectURL(blob)
	link.href = url
	link.download = fileName
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}
