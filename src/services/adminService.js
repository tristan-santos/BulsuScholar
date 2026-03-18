import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import formattedReportTemplateUrl from "../../FORMATTED_REPORT.pdf?url"

const PAGE_MARGIN_LEFT = 64
const PAGE_MARGIN_RIGHT = 64
const PAGE_MARGIN_TOP = 156
const PAGE_MARGIN_BOTTOM = 80
const SUMMARY_GAP = 12
const SUMMARY_LINE_HEIGHT = 12
const TABLE_HEADER_HEIGHT = 22
const TABLE_CELL_PADDING_X = 5
const TABLE_CELL_PADDING_Y = 4
const TABLE_FONT_SIZE = 8.5
const TABLE_LINE_HEIGHT = 10
const MAX_SUMMARY_LINES = 6

let templateBytesPromise = null

export function formatDate(value) {
	const date = value?.toDate ? value.toDate() : new Date(value)
	if (Number.isNaN(date.getTime())) return "-"
	return date.toLocaleDateString("en-PH", {
		month: "short",
		day: "numeric",
		year: "numeric",
	})
}

function normalizeScholarshipName(raw = "") {
	const value = String(raw || "").toLowerCase()
	if (value.includes("kuya")) return "Kuya Win Scholarship Program"
	if (value.includes("tina")) return "Cong. Tina Pancho"
	if (value.includes("morisson") || value.includes("morrison")) return "Morisson"
	if (value.includes("other")) return "Other"
	return raw || "Other"
}

function isScholarshipActive(status = "") {
	const value = String(status).toLowerCase()
	return !["rejected", "withdrawn", "expired", "cancelled", "resolved"].some((s) =>
		value.includes(s),
	)
}

export function mapStudents(rawStudents = []) {
	return rawStudents.map((item) => {
		const fullName = [item.fname, item.mname, item.lname].filter(Boolean).join(" ").trim()
		const scholarships = Array.isArray(item.scholarships) ? item.scholarships : []
		const isArchived = item.archived === true
		return {
			id: item.id || item.studentnumber || "-",
			fullName: fullName || "Student",
			email: item.email || "",
			fname: item.fname || "",
			scholarships,
			course: item.course || "-",
			yearLevel: item.year || "-",
			recordStatus: isArchived ? "Archived" : "Active",
			restrictionSummary: "-",
		}
	})
}

export function filterStudentRows(rows = [], filters = {}) {
	const { search = "", course = "All", year = "All" } = filters
	const keyword = search.trim().toLowerCase()
	return rows.filter((row) => {
		const matchesSearch =
			!keyword ||
			row.id.toLowerCase().includes(keyword) ||
			row.fullName.toLowerCase().includes(keyword)
		const matchesCourse = course === "All" || row.course === course
		const matchesYear = year === "All" || row.yearLevel === year
		return matchesSearch && matchesCourse && matchesYear
	})
}

export function mapScholarshipRows(rawStudents = [], rawApplications = []) {
	const programMap = new Map()
	const ensureProgram = (name, providerType = "other") => {
		const normalizedName = normalizeScholarshipName(name)
		if (!programMap.has(normalizedName)) {
			programMap.set(normalizedName, {
				programName: normalizedName,
				providerType: providerType || "other",
				totalSlots: "-",
				activeRecipients: 0,
				status: "Open",
			})
		}
		return programMap.get(normalizedName)
	}

	rawApplications.forEach((application) => {
		ensureProgram(
			application.scholarshipName || application.provider || application.providerType,
			application.providerType,
		)
	})

	rawStudents.forEach((student) => {
		const scholarships = Array.isArray(student.scholarships) ? student.scholarships : []
		scholarships.forEach((sch) => {
			const row = ensureProgram(sch.name || sch.provider, sch.providerType)
			if (isScholarshipActive(sch.status)) {
				row.activeRecipients += 1
			}
		})
	})

	return [...programMap.values()]
}

export function filterScholarshipRows(rows = [], filters = {}) {
	const { provider = "All", status = "All", search = "" } = filters
	const keyword = search.trim().toLowerCase()
	return rows.filter((row) => {
		const matchesSearch =
			!keyword ||
			String(row.programName || "").toLowerCase().includes(keyword) ||
			String(row.providerType || "").toLowerCase().includes(keyword) ||
			String(row.status || "").toLowerCase().includes(keyword)
		const providerMatch =
			provider === "All" ||
			String(row.providerType || "").toLowerCase() === provider.toLowerCase()
		const statusMatch = status === "All" || row.status === status
		return matchesSearch && providerMatch && statusMatch
	})
}

function getCurrentAcademicYear(date = new Date()) {
	const year = date.getFullYear()
	return date.getMonth() + 1 >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

async function getTemplateBytes() {
	if (!templateBytesPromise) {
		templateBytesPromise = fetch(formattedReportTemplateUrl).then(async (response) => {
			if (!response.ok) {
				throw new Error("Unable to load FORMATTED_REPORT.pdf template.")
			}
			return response.arrayBuffer()
		})
	}
	return templateBytesPromise
}

async function embedRemoteImage(pdfDoc, logoUrl = "") {
	if (!logoUrl) return null
	try {
		const response = await fetch(logoUrl)
		if (!response.ok) return null
		const bytes = await response.arrayBuffer()
		try {
			return await pdfDoc.embedPng(bytes)
		} catch {
			return await pdfDoc.embedJpg(bytes)
		}
	} catch {
		return null
	}
}

async function createTemplatePage(pdfDoc, templateDoc) {
	const [templatePage] = await pdfDoc.copyPages(templateDoc, [0])
	pdfDoc.addPage(templatePage)
	return pdfDoc.getPage(pdfDoc.getPageCount() - 1)
}

function wrapText(text, font, fontSize, maxWidth) {
	const value = String(text ?? "-").replace(/\s+/g, " ").trim() || "-"
	const words = value.split(" ")
	const lines = []
	let current = ""

	for (const word of words) {
		const next = current ? `${current} ${word}` : word
		if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
			current = next
			continue
		}
		if (current) {
			lines.push(current)
			current = word
			continue
		}
		let chunk = ""
		for (const character of word) {
			const trial = `${chunk}${character}`
			if (font.widthOfTextAtSize(trial, fontSize) <= maxWidth) {
				chunk = trial
			} else {
				if (chunk) lines.push(chunk)
				chunk = character
			}
		}
		current = chunk
	}

	if (current) {
		lines.push(current)
	}

	return lines.length > 0 ? lines : ["-"]
}

function drawWrappedText(page, text, options) {
	const {
		x,
		y,
		maxWidth,
		font,
		fontSize,
		lineHeight,
		color = rgb(0, 0, 0),
	} = options
	const lines = wrapText(text, font, fontSize, maxWidth)
	lines.forEach((line, index) => {
		page.drawText(line, {
			x,
			y: y - index * lineHeight,
			font,
			size: fontSize,
			color,
		})
	})
	return lines.length
}

function buildSummaryLines({ filterLabel, stats = [] }) {
	const metricLine = stats
		.filter((stat) => stat?.label)
		.slice(0, 3)
		.map((stat) => `${stat.label}: ${stat.value ?? "-"}`)
		.join(" | ")

	return [
		`Generated: ${new Date().toLocaleString("en-PH")}`,
		`Academic Year: ${getCurrentAcademicYear()}`,
		filterLabel ? `Filters: ${filterLabel}` : null,
		metricLine || null,
	].filter(Boolean)
}

function estimateSummaryHeight(lines) {
	return 18 + Math.min(lines.length, MAX_SUMMARY_LINES) * SUMMARY_LINE_HEIGHT
}

function drawSummaryBlock(page, fonts, reportConfig, box) {
	const { regular, bold } = fonts
	page.drawRectangle({
		x: box.x,
		y: box.y - box.height,
		width: box.width,
		height: box.height,
		color: rgb(0.95, 0.97, 0.96),
		borderColor: rgb(0.74, 0.82, 0.76),
		borderWidth: 1,
	})

	page.drawText("Report Summary", {
		x: box.x + 12,
		y: box.y - 18,
		font: bold,
		size: 10,
		color: rgb(0.11, 0.29, 0.18),
	})

	let cursorY = box.y - 34
	const lines = buildSummaryLines(reportConfig).slice(0, MAX_SUMMARY_LINES)
	lines.forEach((line) => {
		page.drawText(line, {
			x: box.x + 12,
			y: cursorY,
			font: regular,
			size: 8.5,
			color: rgb(0.16, 0.22, 0.18),
		})
		cursorY -= SUMMARY_LINE_HEIGHT
	})
}

function computeRowHeight(row, columns, font) {
	let maxLines = 1
	row.forEach((value, index) => {
		const contentWidth = columns[index].width - TABLE_CELL_PADDING_X * 2
		const lineCount = wrapText(value, font, TABLE_FONT_SIZE, contentWidth).length
		maxLines = Math.max(maxLines, lineCount)
	})
	return maxLines * TABLE_LINE_HEIGHT + TABLE_CELL_PADDING_Y * 2
}

function drawTableHeader(page, y, columns, fonts) {
	let cursorX = PAGE_MARGIN_LEFT
	columns.forEach((column) => {
		page.drawRectangle({
			x: cursorX,
			y: y - TABLE_HEADER_HEIGHT,
			width: column.width,
			height: TABLE_HEADER_HEIGHT,
			color: rgb(0.15, 0.39, 0.24),
			borderColor: rgb(0.15, 0.39, 0.24),
			borderWidth: 1,
		})
		page.drawText(column.label, {
			x: cursorX + TABLE_CELL_PADDING_X,
			y: y - 15,
			font: fonts.bold,
			size: 8.5,
			color: rgb(1, 1, 1),
		})
		cursorX += column.width
	})
}

function drawTableRow(page, y, row, columns, fonts) {
	const rowHeight = computeRowHeight(row, columns, fonts.regular)
	let cursorX = PAGE_MARGIN_LEFT
	columns.forEach((column, index) => {
		page.drawRectangle({
			x: cursorX,
			y: y - rowHeight,
			width: column.width,
			height: rowHeight,
			borderColor: rgb(0.72, 0.78, 0.74),
			borderWidth: 1,
		})
		drawWrappedText(page, row[index], {
			x: cursorX + TABLE_CELL_PADDING_X,
			y: y - TABLE_CELL_PADDING_Y - 8,
			maxWidth: column.width - TABLE_CELL_PADDING_X * 2,
			font: fonts.regular,
			fontSize: TABLE_FONT_SIZE,
			lineHeight: TABLE_LINE_HEIGHT,
			color: rgb(0.12, 0.12, 0.12),
		})
		cursorX += column.width
	})
	return rowHeight
}

function savePdfFile(pdfBytes, filename) {
	const blob = new Blob([pdfBytes], { type: "application/pdf" })
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}

async function exportTemplateReportPdf({
	filename,
	title,
	subtitle,
	filterLabel = "",
	stats = [],
	columns = [],
	rows = [],
	logoUrl = "",
}) {
	const pdfDoc = await PDFDocument.create()
	const templateBytes = await getTemplateBytes()
	const templateDoc = await PDFDocument.load(templateBytes)
	const fonts = {
		regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
		bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
	}
	const embeddedLogo = await embedRemoteImage(pdfDoc, logoUrl)

	const createPageContext = async () => {
		const page = await createTemplatePage(pdfDoc, templateDoc)
		const { width, height } = page.getSize()
		const usableWidth = width - PAGE_MARGIN_LEFT - PAGE_MARGIN_RIGHT
		const summaryLines = buildSummaryLines({ filterLabel, stats })
		const summaryHeight = estimateSummaryHeight(summaryLines)
		const titleY = height - 110

		if (embeddedLogo) {
			page.drawImage(embeddedLogo, {
				x: PAGE_MARGIN_LEFT,
				y: height - 112,
				width: 38,
				height: 38,
			})
		}

		page.drawText("BulsuScholar", {
			x: PAGE_MARGIN_LEFT + (embeddedLogo ? 48 : 0),
			y: titleY + 16,
			font: fonts.bold,
			size: 15,
			color: rgb(0.09, 0.25, 0.14),
		})
		page.drawText(title, {
			x: PAGE_MARGIN_LEFT,
			y: titleY - 10,
			font: fonts.bold,
			size: 13,
			color: rgb(0.08, 0.08, 0.08),
		})
		if (subtitle) {
			drawWrappedText(page, subtitle, {
				x: PAGE_MARGIN_LEFT,
				y: titleY - 26,
				maxWidth: usableWidth,
				font: fonts.regular,
				fontSize: 9,
				lineHeight: 12,
				color: rgb(0.27, 0.27, 0.27),
			})
		}

		drawSummaryBlock(page, fonts, { filterLabel, stats }, {
			x: PAGE_MARGIN_LEFT,
			y: height - PAGE_MARGIN_TOP,
			width: usableWidth,
			height: summaryHeight,
		})

		const contentTopY = height - PAGE_MARGIN_TOP - summaryHeight - SUMMARY_GAP
		return { page, width, height, contentTopY }
	}

	const totalWidth = columns.reduce((sum, column) => sum + column.width, 0)
	const templateWidth = templateDoc.getPage(0).getWidth()
	const scale =
		totalWidth > 0
			? (templateWidth - PAGE_MARGIN_LEFT - PAGE_MARGIN_RIGHT) / totalWidth
			: 1
	const normalizedColumns = columns.map((column) => ({
		...column,
		width: Math.max(44, column.width * scale),
	}))

	let { page, contentTopY } = await createPageContext()
	let cursorY = contentTopY
	drawTableHeader(page, cursorY, normalizedColumns, fonts)
	cursorY -= TABLE_HEADER_HEIGHT

	for (const row of rows) {
		const rowHeight = computeRowHeight(row, normalizedColumns, fonts.regular)
		if (cursorY - rowHeight < PAGE_MARGIN_BOTTOM) {
			;({ page, contentTopY } = await createPageContext())
			cursorY = contentTopY
			drawTableHeader(page, cursorY, normalizedColumns, fonts)
			cursorY -= TABLE_HEADER_HEIGHT
		}
		cursorY -= drawTableRow(page, cursorY, row, normalizedColumns, fonts)
	}

	if (rows.length === 0) {
		page.drawRectangle({
			x: PAGE_MARGIN_LEFT,
			y: cursorY - 28,
			width: normalizedColumns.reduce((sum, column) => sum + column.width, 0),
			height: 28,
			borderColor: rgb(0.72, 0.78, 0.74),
			borderWidth: 1,
		})
		page.drawText("No rows available for the selected report.", {
			x: PAGE_MARGIN_LEFT + 8,
			y: cursorY - 18,
			font: fonts.regular,
			size: 9,
			color: rgb(0.35, 0.35, 0.35),
		})
	}

	const pdfBytes = await pdfDoc.save()
	savePdfFile(pdfBytes, filename)
}

function buildStudentReportStats(rows) {
	return [
		{ label: "Records", value: rows.length },
		{ label: "Active", value: rows.filter((row) => row.recordStatus !== "Archived").length },
		{ label: "Archived", value: rows.filter((row) => row.recordStatus === "Archived").length },
	]
}

function buildScholarshipReportStats(rows) {
	return [
		{ label: "Programs", value: rows.length },
		{ label: "Recipients", value: rows.reduce((sum, row) => sum + Number(row.activeRecipients || 0), 0) },
		{ label: "Grantors", value: new Set(rows.map((row) => row.providerType || "-")).size },
	]
}

function buildSoeReportStats(rows) {
	return [
		{ label: "Rows", value: rows.length },
		{ label: "Pending", value: rows.filter((row) => String(row.reviewStateLabel || row.reviewState).toLowerCase().includes("pending") || String(row.reviewStateLabel || row.reviewState).toLowerCase().includes("incoming")).length },
		{ label: "Approved", value: rows.filter((row) => String(row.reviewStateLabel || row.reviewState).toLowerCase().includes("approved")).length },
	]
}

function buildComplianceReportStats(rows) {
	return [
		{ label: "Cases", value: rows.length },
		{ label: "High Risk", value: rows.filter((row) => Number(row.violationCount || 0) >= 3).length },
		{ label: "Flags", value: rows.filter((row) => String(row.complianceStatus).toLowerCase().includes("non")).length },
	]
}

export async function exportStudentsReportPdf(rows = [], filterLabel = "", logoUrl = "") {
	await exportTemplateReportPdf({
		filename: `students-report-${Date.now()}.pdf`,
		title: "Student Management Report",
		subtitle: "Student lifecycle, scholarship access, and archival status aligned to the provided formatted report template.",
		filterLabel,
		stats: buildStudentReportStats(rows),
		logoUrl,
		columns: [
			{ label: "Student ID", width: 82 },
			{ label: "Full Name", width: 136 },
			{ label: "Course", width: 94 },
			{ label: "Year Level", width: 64 },
			{ label: "Status", width: 70 },
			{ label: "Restrictions", width: 118 },
		],
		rows: rows.map((row) => [
			row.id,
			row.fullName,
			row.course,
			row.yearLevel,
			row.recordStatus || "Active",
			row.restrictionSummary || "-",
		]),
	})
}

export async function exportScholarshipsReportPdf(rows = [], filterLabel = "", logoUrl = "", columns = null, bodyRows = null, title = "Scholarship Programs Report") {
	const tableColumns = Array.isArray(columns) && columns.length > 0 ? columns : ["Program Name", "Provider Type", "Total Slots", "Active Recipients", "Status"]
	const tableBodyRows =
		Array.isArray(bodyRows) && bodyRows.length >= 0
			? bodyRows
			: rows.map((row) => [row.programName, row.providerType, String(row.totalSlots), String(row.activeRecipients), row.status])

	await exportTemplateReportPdf({
		filename: `scholarships-report-${Date.now()}.pdf`,
		title,
		subtitle: "Program inventory and active recipient coverage rendered using the supplied formatted report template.",
		filterLabel,
		stats: buildScholarshipReportStats(rows),
		logoUrl,
		columns: tableColumns.map((label, index) => ({
			label,
			width:
				[
					166,
					92,
					64,
					88,
					74,
					84,
					84,
				][index] || 88,
		})),
		rows: tableBodyRows,
	})
}

export async function exportSoeRequestsReportPdf(rows = [], filterLabel = "", logoUrl = "") {
	await exportTemplateReportPdf({
		filename: `materials-request-report-${Date.now()}.pdf`,
		title: "Materials Request Report",
		subtitle: "Request lifecycle, download readiness, and review state exported in the required formatted layout.",
		filterLabel,
		stats: buildSoeReportStats(rows),
		logoUrl,
		columns: [
			{ label: "Student ID", width: 76 },
			{ label: "Student Name", width: 112 },
			{ label: "Scholarship", width: 102 },
			{ label: "Materials", width: 88 },
			{ label: "Status", width: 58 },
			{ label: "Request Date", width: 72 },
			{ label: "Review State", width: 74 },
		],
		rows: rows.map((row) => [
			row.studentId || "-",
			row.fullName || "-",
			row.scholarshipName || "-",
			row.requestedMaterialsSummary || row.visibleMaterialsSummary || "-",
			row.status || "-",
			formatDate(row.requestDate || row.timestamp || row.dateRequested || row.createdAt),
			row.reviewStateLabel || row.reviewState || "-",
		]),
	})
}

export async function exportComplianceReportPdf(rows = [], filterLabel = "", logoUrl = "") {
	await exportTemplateReportPdf({
		filename: `compliance-report-${Date.now()}.pdf`,
		title: "Compliance Monitoring Report",
		subtitle: "Violation counts and current compliance standing prepared on top of the provided formatted report template.",
		filterLabel,
		stats: buildComplianceReportStats(rows),
		logoUrl,
		columns: [
			{ label: "Student ID", width: 88 },
			{ label: "Full Name", width: 150 },
			{ label: "Status", width: 92 },
			{ label: "Violations", width: 62 },
			{ label: "Last Reviewed", width: 88 },
		],
		rows: rows.map((row) => [
			row.studentId || row.id || "-",
			row.fullName || "-",
			row.complianceStatus || "-",
			String(row.violationCount || 0),
			row.lastReviewed || "-",
		]),
	})
}

export function downloadCsvReport(filename, headers = [], rows = []) {
	const headerLine = headers.map((value) => escapeCsvValue(value)).join(",")
	const bodyLines = rows.map((row) => row.map((value) => escapeCsvValue(value)).join(","))
	const csv = [headerLine, ...bodyLines].join("\n")
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}

function escapeCsvValue(value) {
	const raw = String(value ?? "")
	const escaped = raw.replaceAll('"', '""')
	return `"${escaped}"`
}
