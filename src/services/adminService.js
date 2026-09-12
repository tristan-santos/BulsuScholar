import { requireBackendApiUrl } from "../config/backendApi"
import { buildPortalRequestHeaders, PortalApiError, postPortalJson } from "./portalApi"
import { sanitizeReportFilename } from "./reportCatalog"

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

function downloadBackendFile(blob, filename) {
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function readBackendError(response) {
	const payload = await response.json().catch(() => null)
	const detail = payload?.message || payload?.detail || payload?.reason || `Backend report request failed: ${response.status}`
	return new PortalApiError(typeof detail === "string" ? detail : JSON.stringify(detail), {
		status: response.status,
		reason: String(payload?.reason || payload?.detail || "report_export_failed"),
		data: payload,
	})
}

function buildCanonicalReportPdfPayload(report = {}) {
	return {
		actorType: "admin",
		reportType: report.reportType || report.key || "report",
		filename: `${sanitizeReportFilename(report.filename)}.pdf`,
		title: report.title || "BulsuScholar Report",
		subtitle: report.description || report.subtitle || "",
		filterLabel: report.filterLabel || "",
		stats: report.stats || [],
		columns: report.columnDefinitions || report.columns || [],
		rows: report.csvRows || [],
		groupedPages: report.groupedPages || null,
		orientation: "landscape",
	}
}

async function validateReportPdfBlob(blob) {
	if (!(blob instanceof Blob) || blob.size < 5) {
		throw new PortalApiError("The report backend returned an empty PDF.", {
			reason: "empty_report_pdf",
		})
	}
	const signature = new TextDecoder("ascii").decode(
		new Uint8Array(await blob.slice(0, 5).arrayBuffer()),
	)
	if (signature !== "%PDF-") {
		throw new PortalApiError("The report backend returned an invalid PDF.", {
			reason: "invalid_report_pdf",
		})
	}
	return blob
}

export async function fetchCanonicalReportPdf(report = {}, options = {}) {
	const controller = new AbortController()
	const timeoutMs = Math.max(5000, Number(options.timeoutMs) || 45000)
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
	const abortFromCaller = () => controller.abort()
	options.signal?.addEventListener("abort", abortFromCaller, { once: true })
	let response
	try {
		response = await fetch(`${requireBackendApiUrl("Report backend")}/reports/pdf`, {
			method: "POST",
			headers: await buildPortalRequestHeaders({ actorType: "admin" }),
			body: JSON.stringify(buildCanonicalReportPdfPayload(report)),
			signal: controller.signal,
		})
	} catch (error) {
		if (error?.name === "AbortError") {
			if (options.signal?.aborted) throw error
			throw new PortalApiError("PDF report generation timed out. Please try again.", {
				status: 408,
				reason: "request_timeout",
			})
		}
		throw new PortalApiError(`Report backend is unavailable. ${error?.message || ""}`.trim(), {
			reason: "backend_unavailable",
		})
	} finally {
		clearTimeout(timeoutId)
		options.signal?.removeEventListener("abort", abortFromCaller)
	}
	if (!response.ok) throw await readBackendError(response)
	const disposition = response.headers.get("content-disposition") || ""
	const serverFilename = disposition.match(/filename="?([^";]+)"?/i)?.[1]
	const blob = await validateReportPdfBlob(await response.blob())
	return {
		blob,
		filename: serverFilename || `${sanitizeReportFilename(report.filename)}.pdf`,
	}
}

export function downloadCanonicalReportPdfBlob(blob, filename = "bulsuscholar-report.pdf") {
	downloadBackendFile(blob, sanitizeReportFilename(filename))
}

export async function exportCanonicalReportPdf(report = {}, options = {}) {
	const result = await fetchCanonicalReportPdf(report, options)
	downloadCanonicalReportPdfBlob(result.blob, result.filename)
	return result
}

export function fetchTopStudentsReport(students = [], offerings = []) {
	return postPortalJson(
		requireBackendApiUrl("Report backend"),
		"/reports/top-students/preview",
		{ actorType: "admin", students, offerings },
		"Top students report",
		{ actor: { actorType: "admin" }, timeoutMs: 30000 },
	)
}

function protectSpreadsheetCell(value) {
	const raw = String(value ?? "").replace(/\r\n?/g, "\n")
	return /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw
}

function escapeCsvValue(value) {
	const escaped = protectSpreadsheetCell(value).replaceAll('"', '""')
	return `"${escaped}"`
}

export function downloadCanonicalReportCsv(report = {}) {
	const headers = report.columns || (report.columnDefinitions || []).map((column) => column.label)
	const rows = report.csvRows || []
	const csv = [
		headers.map(escapeCsvValue).join(","),
		...rows.map((row) => row.map(escapeCsvValue).join(",")),
	].join("\r\n")
	const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" })
	downloadBackendFile(blob, `${sanitizeReportFilename(report.filename)}.csv`)
}
