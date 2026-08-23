import { supabase } from "./supabaseClient"

const BACKEND_URL = (import.meta.env.VITE_BACKEND_API_URL || "https://bulsuscholar.onrender.com").replace(/\/$/, "")
const PRIORITY_ONE_READ_TABLES = new Set(["leave_requests", "support_feedback", "unifast_records"])
const PRIORITY_ONE_FILTER_FIELDS = {
	leave_requests: new Set(["studentId", "grantorId", "requestType", "status"]),
	support_feedback: new Set(["userId", "userType", "category", "status"]),
	unifast_records: new Set(["studentId", "status", "academicCycle", "eligible"]),
}

async function postPriorityOne(path, payload = {}) {
	const response = await fetch(`${BACKEND_URL}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	})
	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		throw new Error(data?.reason || data?.detail || `Request failed (${response.status})`)
	}
	return data
}

async function listPriorityRecordsFromSupabase(table, filters = {}, limit = 5000) {
	if (!PRIORITY_ONE_READ_TABLES.has(table)) {
		throw new Error("unsupported_priority_one_table")
	}
	const allowedFields = PRIORITY_ONE_FILTER_FIELDS[table] || new Set()
	let request = supabase.from(table).select("*").limit(Math.min(Number(limit) || 5000, 10000))
	Object.entries(filters || {}).forEach(([field, value]) => {
		if (!allowedFields.has(field) || value == null || value === "") return
		request = request.eq(`data->>${field}`, typeof value === "boolean" ? String(value).toLowerCase() : value)
	})
	const { data, error } = await request
	if (error) throw error
	const records = (data || [])
		.map((row) => ({ id: row.id, ...(row.data || {}) }))
		.sort((left, right) =>
			String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")),
		)
	return { ok: true, records, count: records.length, source: "supabase_fallback" }
}

export const askHelpAssistant = (message) => postPriorityOne("/support/chat", { message })
export const submitSupportFeedback = (payload) => postPriorityOne("/support/feedback", payload)
export const createLeaveRequest = (payload) => postPriorityOne("/workflows/leave/create", payload)
export const reviewLeaveRequest = (payload) => postPriorityOne("/workflows/leave/review", payload)
export async function listPriorityRecords(table, filters = {}) {
	try {
		return await postPriorityOne("/priority-one/records", { table, filters })
	} catch (error) {
		const message = String(error?.message || "")
		const backendRouteUnavailable =
			message.includes("Method Not Allowed") ||
			message.includes("Request failed (405)") ||
			message.includes("api_route_not_found")
		if (!backendRouteUnavailable) throw error
		console.warn("[BulsuScholar] Priority-one backend lookup unavailable. Using Supabase read fallback.", {
			table,
			filters,
			error,
		})
		return listPriorityRecordsFromSupabase(table, filters)
	}
}
export const importUnifastRecords = (payload) => postPriorityOne("/unifast/import", payload)

export async function downloadPriorityOneReport(format, payload) {
	const response = await fetch(`${BACKEND_URL}/reports/${format}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	})
	if (!response.ok) throw new Error(`Report generation failed (${response.status})`)
	const blob = await response.blob()
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = payload.filename || `report.${format === "excel" ? "xlsx" : format}`
	document.body.appendChild(anchor)
	anchor.click()
	anchor.remove()
	URL.revokeObjectURL(url)
}
