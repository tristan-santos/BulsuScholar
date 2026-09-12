const DEFAULT_COLUMN_WEIGHT = 1

export const ADMIN_REPORT_TYPES = Object.freeze({
	STUDENTS: "students",
	GRANTORS: "grantors",
	SCHOLARSHIPS: "scholarships",
	REQUIREMENTS: "requirements",
	COMPLIANCE: "compliance",
	TOP_STUDENTS: "top_students",
})

function normalizeColumn(column, index) {
	if (typeof column === "string") {
		return { key: `column_${index}`, label: column, weight: DEFAULT_COLUMN_WEIGHT }
	}
	return {
		key: String(column?.key || `column_${index}`),
		label: String(column?.label || column?.key || `Column ${index + 1}`),
		weight: Math.max(0.25, Number(column?.weight) || DEFAULT_COLUMN_WEIGHT),
	}
}

function normalizeCell(value) {
	if (value === null || value === undefined || value === "") return "-"
	return String(value)
}

export function createCanonicalReport(config = {}) {
	const columnDefinitions = (config.columnDefinitions || config.columns || []).map(normalizeColumn)
	const sourceRows = Array.isArray(config.csvRows)
		? config.csvRows
		: Array.isArray(config.rows)
			? config.rows
			: []
	const rows = sourceRows.map((row) => {
		if (Array.isArray(row)) {
			return columnDefinitions.map((_, index) => normalizeCell(row[index]))
		}
		return columnDefinitions.map((column) => normalizeCell(row?.[column.key]))
	})

	return {
		...config,
		key: config.key || config.reportType || "report",
		reportType: config.reportType || config.key || "report",
		columnDefinitions,
		columns: columnDefinitions.map((column) => column.label),
		csvRows: rows,
		stats: Array.isArray(config.stats) ? config.stats : [],
		filename: sanitizeReportFilename(config.filename || config.title || "bulsuscholar-report"),
	}
}

export function sanitizeReportFilename(value = "bulsuscholar-report") {
	const normalized = String(value || "bulsuscholar-report")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[-_.]+|[-_.]+$/g, "")
	return normalized || "bulsuscholar-report"
}

export function isWithinInclusiveDateRange(value, dateFrom = "", dateTo = "") {
	if (!dateFrom && !dateTo) return true
	const date = value?.toDate ? value.toDate() : new Date(value)
	if (Number.isNaN(date.getTime())) return false
	const timestamp = date.getTime()
	if (dateFrom) {
		const start = new Date(`${dateFrom}T00:00:00`).getTime()
		if (timestamp < start) return false
	}
	if (dateTo) {
		const end = new Date(`${dateTo}T23:59:59.999`).getTime()
		if (timestamp > end) return false
	}
	return true
}

export function overlapsInclusiveDateRange(startValue, endValue, dateFrom = "", dateTo = "") {
	if (!dateFrom && !dateTo) return true
	const startDate = startValue?.toDate ? startValue.toDate() : new Date(startValue || endValue)
	const endDate = endValue?.toDate ? endValue.toDate() : new Date(endValue || startValue)
	if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return false
	const filterStart = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY
	const filterEnd = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY
	return endDate.getTime() >= filterStart && startDate.getTime() <= filterEnd
}

export function matchesReportSearch(values = [], search = "") {
	const keyword = String(search || "").trim().toLowerCase()
	if (!keyword) return true
	return values.some((value) => String(value ?? "").toLowerCase().includes(keyword))
}
