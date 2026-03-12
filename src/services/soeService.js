import { PDFDocument, StandardFonts } from "pdf-lib"
import { resolveSoeRequestNumber } from "./soeRequestNumberService"

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

function mapCourseToCollege(course = "") {
	const value = String(course).toLowerCase()

	if (
		value.includes("information technology") ||
		value.includes("computer engineering")
	) {
		return "College of Information Technology"
	}
	if (value.includes("industrial technology")) {
		return "College of Industrial Technology"
	}
	if (value.includes("industrial engineering")) {
		return "College of Engineering"
	}
	if (
		value.includes("business administration") ||
		value.includes("entrepreneurship")
	) {
		return "College of Business Administration"
	}
	if (
		value.includes("elementary education") ||
		value.includes("early childhood education") ||
		value.includes("secondary education") ||
		value.includes("technology and livelihood education") ||
		value.includes("physical education")
	) {
		return "College of Education"
	}

	return "BulSU Bustos Campus"
}

async function fetchTemplateBytes() {
	const response = await fetch("/soe-template-fields.pdf")
	if (!response.ok) {
		throw new Error("SOE template file could not be loaded.")
	}
	return new Uint8Array(await response.arrayBuffer())
}

export async function exportSoePdfDocument({
	student = {},
	studentId = "",
	expenses = [],
	autoDownload = true,
	requestNumber = "",
} = {}) {
	const templateBytes = await fetchTemplateBytes()
	const pdfDoc = await PDFDocument.load(templateBytes)
	const page = pdfDoc.getPage(0)
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
	const form = pdfDoc.getForm()

	const fullName =
		[student?.fname, student?.mname, student?.lname].filter(Boolean).join(" ") || "Student"
	const program = safeText(student?.course)
	const pointOfOrigination = mapCourseToCollege(program)
	const studentNumber = studentId || student?.studentnumber
	const soeRequestNumber = resolveSoeRequestNumber(requestNumber, studentNumber)

	const hasField = (fieldName) =>
		form.getFields().some((field) => field.getName() === fieldName)

	const setTextField = (fieldName, value, options = {}) => {
		if (!hasField(fieldName)) return
		const field = form.getTextField(fieldName)
		if (options.multiline) {
			field.enableMultiline()
		}
		if (options.fontSize) {
			field.setFontSize(options.fontSize)
		}
		if (options.allowEmpty && String(value ?? "").trim() === "") {
			field.setText("")
			return
		}
		field.setText(safeText(value))
	}

	// These are the editable fields embedded in "SOE Template-with TextField.pdf".
	setTextField("text_3qscf", pointOfOrigination) // Point of origination
	setTextField("text_2wwnz", formatLongDate()) // Date accomplished
	setTextField("text_1siso", fullName) // Name of scholar
	setTextField("text_4rhuf", studentNumber) // Student number
	setTextField("text_5pwyp", program) // Program
	setTextField("text_7bm", soeRequestNumber) // SOE request number
	const expenseRows = (Array.isArray(expenses) ? expenses : [])
		.map((item) => ({
			label: safeText(item?.label, ""),
			amount: Number(item?.amount),
		}))
		.filter((item) => item.label && Number.isFinite(item.amount) && item.amount > 0)
		.slice(0, 10)

	let total = 0
	const expenseLines = []
	const amountLines = []
	for (const row of expenseRows) {
		total += row.amount
		expenseLines.push(row.label)
		amountLines.push(
			`P ${new Intl.NumberFormat("en-PH", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			}).format(row.amount)}`,
		)
	}
	// Use template text areas as containers, then draw with controlled spacing/alignment.
	setTextField("textarea_13bzn", "", {
		multiline: true,
		fontSize: 10,
		allowEmpty: true,
	})
	setTextField("textarea_14kegw", "", {
		multiline: true,
		fontSize: 10,
		allowEmpty: true,
	})
	setTextField("text_7oqxr", "", { multiline: true, fontSize: 10, allowEmpty: true }) // legacy
	setTextField("text_8ddkx", "", { multiline: true, fontSize: 10, allowEmpty: true }) // legacy

	const expensesRect = hasField("textarea_13bzn")
		? form.getTextField("textarea_13bzn").acroField.getWidgets()[0].getRectangle()
		: hasField("text_7oqxr")
			? form.getTextField("text_7oqxr").acroField.getWidgets()[0].getRectangle()
			: null
	const amountsRect = hasField("textarea_14kegw")
		? form.getTextField("textarea_14kegw").acroField.getWidgets()[0].getRectangle()
		: hasField("text_8ddkx")
			? form.getTextField("text_8ddkx").acroField.getWidgets()[0].getRectangle()
			: null

	if (expensesRect && amountsRect && expenseLines.length > 0) {
		const fontSize = 11
		const lineHeight = 20
		const blockHeight = expenseLines.length * lineHeight
		const firstBaselineY = expensesRect.y + (expensesRect.height + blockHeight) / 2 - 12

		for (let i = 0; i < expenseLines.length; i += 1) {
			const y = firstBaselineY - i * lineHeight
			const expenseText = expenseLines[i]
			const amountText = amountLines[i]
			const expenseWidth = font.widthOfTextAtSize(expenseText, fontSize)
			const amountWidth = font.widthOfTextAtSize(amountText, fontSize)
			const expenseX = expensesRect.x + Math.max(4, (expensesRect.width - expenseWidth) / 2)
			const amountX = amountsRect.x + Math.max(4, (amountsRect.width - amountWidth) / 2)

			page.drawText(expenseText, { x: expenseX, y, size: fontSize, font })
			page.drawText(amountText, { x: amountX, y, size: fontSize, font })
		}
	}

	const totalText = `P ${new Intl.NumberFormat("en-PH", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(total)}`
	setTextField("text_15tjxv", totalText) // latest template total field
	setTextField("text_9nixx", totalText) // old template total field
	if (!hasField("text_15tjxv") && !hasField("text_9nixx")) {
		page.drawText(totalText, {
			x: 430,
			y: 350,
			size: 11,
			font,
		})
	}

	form.updateFieldAppearances(font)
	form.flatten()

	const pdfBytes = await pdfDoc.save()

	if (autoDownload) {
		downloadSoePdfBytes(
			pdfBytes,
			`SOE_${safeText(studentId || student?.studentnumber, "student")}.pdf`,
		)
	}

	return {
		requestNumber: soeRequestNumber,
		pdfBytes,
	}
}

export function downloadSoePdfBytes(pdfBytes, fileName = "SOE.pdf") {
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
