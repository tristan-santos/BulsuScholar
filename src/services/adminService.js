import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

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
		const accountBlocked =
			item.restrictions?.accountAccess === true ||
			item.isBlocked === true ||
			String(item.accountStatus || "").toLowerCase() === "blocked"
		const scholarshipBlocked =
			item.restrictions?.scholarshipEligibility === true ||
			item.soeComplianceBlocked === true ||
			item.scholarshipConflictWarning === true ||
			item.scholarshipRestrictionReason === "multiple_scholarships" ||
			scholarships.some((entry) => entry?.adminBlocked === true)
		const isArchived = item.archived === true
		const restrictionSummary = [
			accountBlocked ? "Account Access" : "",
			scholarshipBlocked ? "Scholarship Eligibility" : "",
		]
			.filter(Boolean)
			.join(", ")
		return {
			id: item.id || item.studentnumber || "-",
			fullName: fullName || "Student",
			email: item.email || "",
			fname: item.fname || "",
			scholarships,
			course: item.course || "-",
			yearLevel: item.year || "-",
			validationStatus:
				item.isValidated === true || item.isValidated === "true"
					? "Validated"
					: "Pending",
			recordStatus: isArchived
				? "Archived"
				: accountBlocked || scholarshipBlocked
					? "Blocked"
					: "Active",
			restrictionSummary: restrictionSummary || "-",
		}
	})
}

export function filterStudentRows(rows = [], filters = {}) {
	const { search = "", course = "All", year = "All", validation = "All" } = filters
	const keyword = search.trim().toLowerCase()
	return rows.filter((row) => {
		const matchesSearch =
			!keyword ||
			row.id.toLowerCase().includes(keyword) ||
			row.fullName.toLowerCase().includes(keyword)
		const matchesCourse = course === "All" || row.course === course
		const matchesYear = year === "All" || row.yearLevel === year
		const matchesValidation = validation === "All" || row.validationStatus === validation
		return matchesSearch && matchesCourse && matchesYear && matchesValidation
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

function toDataUrl(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => resolve(String(reader.result || ""))
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}

async function drawPdfHeader(doc, title, logoUrl) {
	if (logoUrl) {
		try {
			const response = await fetch(logoUrl)
			const blob = await response.blob()
			const dataUrl = await toDataUrl(blob)
			doc.addImage(dataUrl, "PNG", 14, 10, 14, 14)
		} catch {
			// ignore logo draw errors
		}
	}

	doc.setFontSize(14)
	doc.text("BulsuScholar", 32, 16)
	doc.setFontSize(11)
	doc.text(title, 14, 30)
	doc.setFontSize(9)
	doc.text(
		`Generated: ${new Date().toLocaleString("en-PH")}  |  Academic Year: ${getCurrentAcademicYear()}`,
		14,
		36,
	)
}

function getCurrentAcademicYear(date = new Date()) {
	const year = date.getFullYear()
	return date.getMonth() + 1 >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

export async function exportStudentsReportPdf(rows = [], filterLabel = "", logoUrl = "") {
	const doc = new jsPDF()
	await drawPdfHeader(doc, "Student Management Report", logoUrl)
	if (filterLabel) {
		doc.setFontSize(9)
		doc.text(`Filters: ${filterLabel}`, 14, 42)
	}
	autoTable(doc, {
		startY: 46,
		head: [[
			"Student ID",
			"Full Name",
			"Course",
			"Year Level",
			"Validation",
			"Record Status",
			"Restrictions",
		]],
		body: rows.map((row) => [
			row.id,
			row.fullName,
			row.course,
			row.yearLevel,
			row.validationStatus,
			row.recordStatus || "Active",
			row.restrictionSummary || "-",
		]),
		styles: { fontSize: 8 },
	})
	doc.save(`students-report-${Date.now()}.pdf`)
}

export async function exportScholarshipsReportPdf(rows = [], filterLabel = "", logoUrl = "", columns = null, bodyRows = null, title = "Scholarship Programs Report") {
	const doc = new jsPDF()
	await drawPdfHeader(doc, title, logoUrl)
	if (filterLabel) {
		doc.setFontSize(9)
		doc.text(`Filters: ${filterLabel}`, 14, 42)
	}
	const tableColumns = Array.isArray(columns) && columns.length > 0 ? columns : ["Program Name", "Provider Type", "Total Slots", "Active Recipients", "Status"]
	const tableBodyRows =
		Array.isArray(bodyRows) && bodyRows.length >= 0
			? bodyRows
			: rows.map((row) => [row.programName, row.providerType, String(row.totalSlots), String(row.activeRecipients), row.status])
	autoTable(doc, {
		startY: 46,
		head: [tableColumns],
		body: tableBodyRows,
		styles: { fontSize: 8 },
	})
	doc.save(`scholarships-report-${Date.now()}.pdf`)
}

export async function exportSoeRequestsReportPdf(rows = [], filterLabel = "", logoUrl = "") {
	const doc = new jsPDF()
	await drawPdfHeader(doc, "Materials Request Report", logoUrl)
	if (filterLabel) {
		doc.setFontSize(9)
		doc.text(`Filters: ${filterLabel}`, 14, 42)
	}
	autoTable(doc, {
		startY: 46,
		head: [[
			"Student ID",
			"Student Name",
			"Scholarship",
			"Materials",
			"Provider",
			"Status",
			"Date Requested",
			"Next Eligible",
			"Review State",
		]],
		body: rows.map((row) => [
			row.studentId || "-",
			row.fullName || "-",
			row.scholarshipName || "-",
			row.requestedMaterialsSummary || "-",
			row.providerType || "-",
			row.status || "-",
			formatDate(row.requestDate || row.timestamp || row.dateRequested || row.createdAt),
			row.nextEligibleLabel || "-",
			row.reviewStateLabel || row.reviewState || "-",
		]),
		styles: { fontSize: 8 },
	})
	doc.save(`materials-request-report-${Date.now()}.pdf`)
}

export async function exportComplianceReportPdf(rows = [], filterLabel = "", logoUrl = "") {
	const doc = new jsPDF()
	await drawPdfHeader(doc, "Compliance Monitoring Report", logoUrl)
	if (filterLabel) {
		doc.setFontSize(9)
		doc.text(`Filters: ${filterLabel}`, 14, 42)
	}
	autoTable(doc, {
		startY: 46,
		head: [[
			"Student ID",
			"Full Name",
			"Status",
			"Violations",
			"Scholarship Block",
			"Last Reviewed",
		]],
		body: rows.map((row) => [
			row.studentId || row.id || "-",
			row.fullName || "-",
			row.complianceStatus || "-",
			String(row.violationCount || 0),
			row.isBlocked ? "Yes" : "No",
			row.lastReviewed || "-",
		]),
		styles: { fontSize: 8 },
	})
	doc.save(`compliance-report-${Date.now()}.pdf`)
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
