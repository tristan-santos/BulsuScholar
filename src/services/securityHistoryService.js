import { requireBackendApiUrl } from "../config/backendApi"
import { buildPortalRequestHeaders, PortalApiError } from "./portalApi"
import { trackedFetch } from "./operationTracker"

async function request(path, options = {}) {
	const headers = await buildPortalRequestHeaders()
	if (options.body instanceof FormData) delete headers["Content-Type"]
	const response = await trackedFetch(`${requireBackendApiUrl("Portal workflow backend")}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } })
	const contentType = response.headers.get("content-type") || ""
	if (response.ok && !contentType.includes("application/json")) return response
	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		const detail = data?.detail || data?.reason || "portal_workflow_failed"
		throw new PortalApiError(typeof detail === "string" ? detail.replaceAll("_", " ") : JSON.stringify(detail), { status: response.status, reason: typeof detail === "string" ? detail : "portal_workflow_failed", data })
	}
	return data
}

export const listStudentHistory = ({ page = 1, pageSize = 20, cycle = "", eventType = "" } = {}) => {
	const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
	if (cycle) query.set("cycle", cycle)
	if (eventType) query.set("event_type", eventType)
	return request(`/student/history?${query}`)
}

export const uploadSignedSoe = (applicationId, file) => {
	const body = new FormData()
	body.append("file", file)
	return request(`/student/applications/${encodeURIComponent(applicationId)}/signed-soe`, { method: "POST", body })
}

export const listSignedSoe = (applicationId) => request(`/student/applications/${encodeURIComponent(applicationId)}/signed-soe`)

export async function openSignedSoe(submissionId) {
	const response = await request(`/signed-soe/${encodeURIComponent(submissionId)}/content`)
	const url = URL.createObjectURL(await response.blob())
	window.open(url, "_blank", "noopener,noreferrer")
	window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export const reopenSignedSoe = (submissionId, reason) => request(`/admin/signed-soe/${encodeURIComponent(submissionId)}/reopen`, { method: "POST", body: JSON.stringify({ reason }) })

export const createLostEmailTicket = (userId, reason) => request("/support/recovery/tickets", { method: "POST", body: JSON.stringify({ userId, reason }) })
export const getLostEmailTicket = (ticketId, secret) => request(`/support/recovery/tickets/${encodeURIComponent(ticketId)}?secret=${encodeURIComponent(secret)}`)
export const sendLostEmailMessage = (ticketId, secret, message) => request(`/support/recovery/tickets/${encodeURIComponent(ticketId)}/messages?secret=${encodeURIComponent(secret)}`, { method: "POST", body: JSON.stringify({ message }) })
export const deleteLostEmailTicket = (ticketId, secret) => request(`/support/recovery/tickets/${encodeURIComponent(ticketId)}?secret=${encodeURIComponent(secret)}`, { method: "DELETE" })
export const confirmLostEmail = (ticketId, secret, code) => request(`/support/recovery/tickets/${encodeURIComponent(ticketId)}/confirm-email?secret=${encodeURIComponent(secret)}`, { method: "POST", body: JSON.stringify({ code }) })
export const uploadLostEmailAttachment = (ticketId, secret, file) => {
	const body = new FormData()
	body.append("file", file)
	return request(`/support/recovery/tickets/${encodeURIComponent(ticketId)}/attachments?secret=${encodeURIComponent(secret)}`, { method: "POST", body })
}
