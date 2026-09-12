import { requireBackendApiUrl } from "../config/backendApi"
import { buildPortalRequestHeaders } from "./portalApi"

async function postPriorityOne(path, payload = {}) {
	const response = await fetch(`${requireBackendApiUrl("Portal backend")}${path}`, {
		method: "POST",
		headers: await buildPortalRequestHeaders(),
		body: JSON.stringify(payload),
	})
	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		throw new Error(data?.reason || data?.detail || `Request failed (${response.status})`)
	}
	return data
}

export const askHelpAssistant = (message) => postPriorityOne("/support/chat", { message })
export const submitSupportFeedback = (payload) => postPriorityOne("/support/feedback", payload)
