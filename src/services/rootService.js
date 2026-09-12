import { requireBackendApiUrl } from "../config/backendApi"
import { supabase } from "./supabaseClient"

const ROOT_SESSION_KEY = "bulsuscholar_root_session"
const ROOT_DEVICE_KEY = "bulsuscholar_root_trusted_device"

async function rootHeaders(json = true, accessToken = "") {
	const { data } = await supabase.auth.getSession()
	const token = accessToken || data?.session?.access_token || ""
	return {
		...(json ? { "Content-Type": "application/json" } : {}),
		...(token ? { Authorization: `Bearer ${token}` } : {}),
		...(localStorage.getItem(ROOT_SESSION_KEY) ? { "X-Root-Session": localStorage.getItem(ROOT_SESSION_KEY) } : {}),
	}
}

async function rootRequest(path, { method = "GET", payload, accessToken = "", signal } = {}) {
	let response
	try {
		response = await fetch(`${requireBackendApiUrl("Root administration backend")}${path}`, {
			method,
			headers: await rootHeaders(payload !== undefined, accessToken),
			...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
			...(signal ? { signal } : {}),
		})
	} catch (error) {
		throw new Error(error?.name === "AbortError" ? "Request cancelled." : "Root administration backend is unavailable.")
	}
	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		const detail = data?.detail || data?.reason || data?.message || "Root administration request failed."
		const message = typeof detail === "string" ? detail : detail?.reason || JSON.stringify(detail)
		const error = new Error(message.replaceAll("_", " "))
		error.status = response.status
		error.data = data
		throw error
	}
	return data
}

export async function rootLogin(userId, password) {
	return rootRequest("/root/auth/login", { method: "POST", payload: { userId, password, deviceToken: localStorage.getItem(ROOT_DEVICE_KEY) || "" } })
}

export const changeRootPassword = (accessToken, newPassword) => rootRequest("/root/auth/change-password", { method: "POST", accessToken, payload: { newPassword } })
export const verifyRootCode = (accessToken, challengeId, code, rememberDevice = true) => rootRequest("/root/auth/verify", { method: "POST", accessToken, payload: { challengeId, code, rememberDevice, deviceLabel: navigator.platform || "Browser" } })
export const requestRootCode = (accessToken) => rootRequest("/root/auth/resend", { method: "POST", accessToken, payload: {} })
export const reauthenticateRoot = (password) => rootRequest("/root/auth/reauthenticate", { method: "POST", payload: { password } })
export const updateRootPassword = (currentPassword, newPassword) => rootRequest("/root/security/password", { method: "POST", payload: { currentPassword, newPassword } })
export const regenerateRootRecoveryCodes = () => rootRequest("/root/security/recovery-codes", { method: "POST", payload: {} })

export async function establishRootSession(result, authTokens) {
	localStorage.setItem(ROOT_SESSION_KEY, result.rootSession)
	if (result.trustedDeviceToken) localStorage.setItem(ROOT_DEVICE_KEY, result.trustedDeviceToken)
	await supabase.auth.setSession({ access_token: authTokens.accessToken, refresh_token: authTokens.refreshToken })
	sessionStorage.setItem("bulsuscholar_userId", result.root?.id || "Tristan@Root")
	sessionStorage.setItem("bulsuscholar_userType", "root")
}

export async function clearRootSession(callBackend = true) {
	if (callBackend && localStorage.getItem(ROOT_SESSION_KEY)) {
		await rootRequest("/root/auth/logout", { method: "POST", payload: {} }).catch(() => {})
	}
	localStorage.removeItem(ROOT_SESSION_KEY)
	sessionStorage.removeItem("bulsuscholar_userId")
	sessionStorage.removeItem("bulsuscholar_userType")
	await supabase.auth.signOut()
}

export const hasRootSession = () => Boolean(localStorage.getItem(ROOT_SESSION_KEY))
export const getRootOverview = () => rootRequest("/root/overview")
export const getRootMetrics = () => rootRequest("/root/metrics")
export const getRootData = (dataset, page = 1, search = "") => rootRequest(`/root/data/${encodeURIComponent(dataset)}?page=${page}&page_size=25&search=${encodeURIComponent(search)}`)
export async function getAllRootData(dataset, search = "") {
	const rows = []
	for (let page = 1; page <= 250; page += 1) {
		const result = await rootRequest(`/root/data/${encodeURIComponent(dataset)}?page=${page}&page_size=100&search=${encodeURIComponent(search)}`)
		rows.push(...(result.rows || []))
		if (!result.hasMore) break
	}
	return rows
}
export const getRootSqlPresets = () => rootRequest("/root/sql/presets")
export const executeRootSql = (sql) => rootRequest("/root/sql/query", { method: "POST", payload: { sql } })
export const executeRootSqlMaintenance = (action) => rootRequest("/root/sql/maintenance", { method: "POST", payload: { action } })
export const getRootAdmins = () => rootRequest("/root/admins")
export const saveRootAdmin = (payload) => rootRequest("/root/admins/save", { method: "POST", payload })
export const getRootSupport = () => rootRequest("/root/support")
export const updateRootSupport = (payload) => rootRequest("/root/support/update", { method: "POST", payload })
export const getRootLogs = () => rootRequest("/root/logs")
export const saveRootSetting = (id, payload) => rootRequest(`/root/settings/${id}`, { method: "POST", payload })
export const getRootBrandingVersions = () => rootRequest("/root/branding/versions")
export const saveRootBrandingDraft = (payload) => rootRequest("/root/branding/drafts", { method: "POST", payload })
export const publishRootBrandingVersion = (id) => rootRequest(`/root/branding/${encodeURIComponent(id)}/publish`, { method: "POST", payload: {} })
export async function uploadRootBrandingAsset(file) {
	const form = new FormData()
	form.append("file", file)
	const response = await fetch(`${requireBackendApiUrl("Root branding backend")}/root/branding/assets`, { method: "POST", headers: await rootHeaders(false), body: form })
	const data = await response.json().catch(() => ({}))
	if (!response.ok) throw new Error(String(data.detail || "Branding asset upload failed.").replaceAll("_", " "))
	return data
}
export const getRootFiles = () => rootRequest("/root/files?limit=500")
export const getRootCanonicalReport = (reportType) => rootRequest(`/root/reports/data/${encodeURIComponent(reportType)}`)
export const getRootIntegrations = () => rootRequest("/root/integrations")
export const runRootIntegrationAction = (payload) => rootRequest("/root/integrations/action", { method: "POST", payload })
export const getRootDevices = () => rootRequest("/root/security/devices")
export const revokeRootDevice = (id) => rootRequest(`/root/security/devices/${encodeURIComponent(id)}`, { method: "DELETE" })
export const getRootSessions = () => rootRequest("/root/security/sessions")
export const revokeRootSession = (id) => rootRequest(`/root/security/sessions/${encodeURIComponent(id)}`, { method: "DELETE" })

export async function downloadRootPdf(title, sourceRows) {
	if (!sourceRows?.length) throw new Error("There are no records to export.")
	const columns = [...new Set(sourceRows.flatMap((row) => Object.keys(row)))].filter((key) => !/password|token|secret|recovery/i.test(key)).slice(0, 20)
	const payload = {
		title,
		filename: `${String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`,
		columns: columns.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), weight: 1 })),
		rows: sourceRows.map((row) => columns.map((key) => typeof row[key] === "object" ? JSON.stringify(row[key]) : String(row[key] ?? "-"))),
		generatedAt: new Date().toISOString(),
		filterLabel: "All records",
	}
	const response = await fetch(`${requireBackendApiUrl("Root report backend")}/root/reports/pdf`, { method: "POST", headers: await rootHeaders(true), body: JSON.stringify(payload) })
	if (!response.ok) throw new Error("The root PDF report could not be generated.")
	const blob = await response.blob()
	if (!blob.size || !blob.type.includes("pdf")) throw new Error("The report backend returned an invalid PDF.")
	const url = URL.createObjectURL(blob); const anchor = document.createElement("a")
	anchor.href = url; anchor.download = payload.filename; anchor.click(); URL.revokeObjectURL(url)
}

export async function downloadRootCanonicalPdf(report) {
	if (!report?.rows?.length) throw new Error("There are no records to export.")
	const filename = `${String(report.reportType || "root-report").replace(/[^a-z0-9_-]+/gi, "-")}.pdf`
	const payload = {
		title: report.title || "BulsuScholar Report",
		filename,
		columns: report.columns || [],
		rows: report.rows,
		generatedAt: report.generatedAt || new Date().toISOString(),
		filterLabel: report.filterLabel || "All records",
		stats: [{ label: "Total Records", value: report.rowCount || report.rows.length }],
	}
	const response = await fetch(`${requireBackendApiUrl("Root report backend")}/root/reports/pdf`, { method: "POST", headers: await rootHeaders(true), body: JSON.stringify(payload) })
	if (!response.ok) throw new Error("The root PDF report could not be generated.")
	const blob = await response.blob()
	if (!blob.size || !blob.type.includes("pdf")) throw new Error("The report backend returned an invalid PDF.")
	const url = URL.createObjectURL(blob); const anchor = document.createElement("a")
	anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
}

export async function downloadRootStudentFile(file) {
	const response = await fetch(`${requireBackendApiUrl("Root file backend")}/root/files/download`, { method: "POST", headers: await rootHeaders(true), body: JSON.stringify(file) })
	if (!response.ok) throw new Error("The student file is unavailable or access was denied.")
	const blob = await response.blob()
	if (!blob.size) throw new Error("The downloaded student file is empty.")
	const url = URL.createObjectURL(blob); const anchor = document.createElement("a")
	anchor.href = url; anchor.download = file.name || "student-document"; anchor.click(); URL.revokeObjectURL(url)
}
