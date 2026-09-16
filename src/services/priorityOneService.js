import { requireBackendApiUrl } from "../config/backendApi"
import { buildPortalRequestHeaders } from "./portalApi"

async function postPriorityOne(path, payload = {}, operation = "generic.foreground") {
	const response = await fetch(`${requireBackendApiUrl("Portal backend")}${path}`, {
		method: "POST",
		operation,
		headers: await buildPortalRequestHeaders(),
		body: JSON.stringify(payload),
	})
	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		throw new Error(data?.reason || data?.detail || `Request failed (${response.status})`)
	}
	return data
}

async function supportRequest(path, { method = "GET", payload, operation = "generic.foreground" } = {}) {
	const response = await fetch(`${requireBackendApiUrl("Portal backend")}${path}`, {
		method,
		operation,
		headers: await buildPortalRequestHeaders(),
		...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
	})
	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		const reason = data?.reason || data?.detail || `Request failed (${response.status})`
		throw new Error(typeof reason === "string" ? reason.replaceAll("_", " ") : "Support request failed.")
	}
	return data
}

export const askHelpAssistant = (message) => postPriorityOne("/support/chat", { message })
export const submitSupportFeedback = (payload) => postPriorityOne("/support/feedback", payload, "record.save")
export const createSupportTicket = (payload) => supportRequest("/support/tickets", { method: "POST", payload, operation: "record.save" })
export const getSupportTickets = () => supportRequest("/support/tickets", { operation: "generic.background" })
export const getSupportTicket = (ticketId) => supportRequest(`/support/tickets/${encodeURIComponent(ticketId)}`, { operation: "generic.background" })
export const sendSupportTicketMessage = (ticketId, message) => supportRequest(`/support/tickets/${encodeURIComponent(ticketId)}/messages`, { method: "POST", payload: { message }, operation: "record.save" })
export const deleteSupportTicket = (ticketId) => supportRequest(`/support/tickets/${encodeURIComponent(ticketId)}`, { method: "DELETE", operation: "record.delete" })
