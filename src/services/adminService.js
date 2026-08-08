const BACKEND_API_URL = (
	import.meta.env.VITE_BACKEND_API_URL ||
	import.meta.env.VITE_DOCUMENT_SCAN_API_URL ||
	"https://bulsuscholar.onrender.com"
).replace(/\/$/, "")

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

function downloadBackendFile(blob, filename) {
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}

async function readBackendError(response) {
	const payload = await response.json().catch(() => null)
	return payload?.detail || `Backend report request failed: ${response.status}`
}

export async function fetchStudentReportPreview(filters = {}, rows = []) {
	const response = await fetch(`${BACKEND_API_URL}/reports/students/preview`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ filters, rows }),
	})
	if (!response.ok) throw new Error(await readBackendError(response))
	const report = await response.json()
	return {
		...report,
		filename: `student-management-${Date.now()}`,
		csvRows: report.rows || [],
		pdfRows: report.rows || [],
		filters,
		reportRows: rows,
	}
}

export async function downloadStudentReport(format = "pdf", filters = {}, rows = []) {
	const normalizedFormat = format === "excel" ? "excel" : "pdf"
	const response = await fetch(`${BACKEND_API_URL}/reports/students/${normalizedFormat}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ filters, rows }),
	})
	if (!response.ok) throw new Error(await readBackendError(response))
	const disposition = response.headers.get("content-disposition") || ""
	const serverFilename = disposition.match(/filename="?([^";]+)"?/i)?.[1]
	const fallback = `student-management-${Date.now()}.${normalizedFormat === "excel" ? "xlsx" : "pdf"}`
	downloadBackendFile(await response.blob(), serverFilename || fallback)
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
	groupedPages = null,
}) {
	const response = await fetch(`${BACKEND_API_URL}/reports/pdf`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			filename,
			title,
			subtitle,
			filterLabel,
			stats,
			columns,
			rows,
			logoUrl,
			groupedPages,
		}),
	})
	if (!response.ok) {
		const message = await response.text().catch(() => "")
		throw new Error(message || `Report generation failed: ${response.status}`)
	}
	const backendPdfBytes = await response.arrayBuffer()
	savePdfFile(backendPdfBytes, filename)
	return
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

export async function exportScholarshipsReportPdf(rows = [], filterLabel = "", logoUrl = "", columns = null, bodyRows = null, title = "Scholarship Programs Report", options = {}) {
	const tableColumns = Array.isArray(columns) && columns.length > 0 ? columns : ["Program Name", "Provider Type", "Total Slots", "Active Recipients", "Status"]
	const tableBodyRows =
		Array.isArray(bodyRows) && bodyRows.length >= 0
			? bodyRows
			: rows.map((row) => [row.programName, row.providerType, String(row.totalSlots), String(row.activeRecipients), row.status])

	await exportTemplateReportPdf({
		filename: options.filename || `scholarships-report-${Date.now()}.pdf`,
		title,
		subtitle: options.subtitle || "Program inventory and active recipient coverage rendered using the supplied formatted report template.",
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
		groupedPages: options.groupedPages || null,
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

export async function downloadCsvReport(filename, headers = [], rows = []) {
	try {
		const response = await fetch(`${BACKEND_API_URL}/reports/csv`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ filename, headers, rows }),
		})
		if (response.ok) {
			const blob = await response.blob()
			const url = URL.createObjectURL(blob)
			const link = document.createElement("a")
			link.href = url
			link.download = filename
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)
			return
		}
	} catch (error) {
		console.warn("Python CSV report generation unavailable. Falling back to browser CSV.", error)
	}
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
