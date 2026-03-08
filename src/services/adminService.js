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
		const appliedScholarship = scholarships[0]?.name || scholarships[0]?.provider || "-"
		return {
			id: item.id || item.studentnumber || "-",
			fullName: fullName || "Student",
			course: item.course || "-",
			yearLevel: item.year || "-",
			validationStatus:
				item.isValidated === true || item.isValidated === "true"
					? "Validated"
					: "Pending",
			appliedScholarship,
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
		const row = ensureProgram(
			application.scholarshipName || application.provider || application.providerType,
			application.providerType,
		)
		if (isScholarshipActive(application.status)) {
			row.activeRecipients += 1
		}
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
	const { provider = "All", status = "All" } = filters
	return rows.filter((row) => {
		const providerMatch =
			provider === "All" ||
			String(row.providerType || "").toLowerCase() === provider.toLowerCase()
		const statusMatch = status === "All" || row.status === status
		return providerMatch && statusMatch
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
			"Applied Scholarship",
		]],
		body: rows.map((row) => [
			row.id,
			row.fullName,
			row.course,
			row.yearLevel,
			row.validationStatus,
			row.appliedScholarship,
		]),
		styles: { fontSize: 8 },
	})
	doc.save(`students-report-${Date.now()}.pdf`)
}

export async function exportScholarshipsReportPdf(rows = [], filterLabel = "", logoUrl = "") {
	const doc = new jsPDF()
	await drawPdfHeader(doc, "Scholarship Programs Report", logoUrl)
	if (filterLabel) {
		doc.setFontSize(9)
		doc.text(`Filters: ${filterLabel}`, 14, 42)
	}
	autoTable(doc, {
		startY: 46,
		head: [[
			"Program Name",
			"Provider Type",
			"Total Slots",
			"Active Recipients",
			"Status",
		]],
		body: rows.map((row) => [
			row.programName,
			row.providerType,
			String(row.totalSlots),
			String(row.activeRecipients),
			row.status,
		]),
		styles: { fontSize: 8 },
	})
	doc.save(`scholarships-report-${Date.now()}.pdf`)
}

export async function exportSoeRequestsReportPdf(rows = [], filterLabel = "", logoUrl = "") {
	const doc = new jsPDF()
	await drawPdfHeader(doc, "SOE Requests Report", logoUrl)
	if (filterLabel) {
		doc.setFontSize(9)
		doc.text(`Filters: ${filterLabel}`, 14, 42)
	}
	autoTable(doc, {
		startY: 46,
		head: [[
			"Student ID",
			"Scholarship",
			"Provider",
			"Status",
			"Date Requested",
		]],
		body: rows.map((row) => [
			row.studentId || "-",
			row.scholarshipName || "-",
			row.providerType || "-",
			row.status || "-",
			formatDate(row.timestamp || row.dateRequested || row.createdAt),
		]),
		styles: { fontSize: 8 },
	})
	doc.save(`soe-requests-report-${Date.now()}.pdf`)
}
