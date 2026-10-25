import { requireBackendApiUrl } from "../config/backendApi"
import { buildPortalRequestHeaders } from "./portalApi"

let presenter = null
let queue = []
let active = null

export async function securityHeaders() {
	const headers = await buildPortalRequestHeaders()
	const { getRootProtectionHeaders } = await import("./rootService")
	return { ...headers, ...await getRootProtectionHeaders() }
}

export async function mpinRequest(path, payload) {
	const response = await fetch(`${requireBackendApiUrl("MPIN security")}/security/mpin${path}`, {
		method: payload === undefined ? "GET" : "POST", headers: await securityHeaders(),
		...(payload === undefined ? {} : { body: JSON.stringify(payload) }), cache: "no-store",
	})
	const data = await response.json().catch(() => ({}))
	if (!response.ok) throw new Error(data.detail?.message || String(data.detail || "MPIN request failed").replaceAll("_", " "))
	return data
}

function next() {
	if (!presenter || active || !queue.length) return
	active = queue.shift()
	const prompt = active
	presenter(prompt.options, (answer) => {
		if (active !== prompt) return
		active = null; prompt.resolve(answer)
		queueMicrotask(next)
	})
}

export function setMpinPresenter(value) {
	presenter = value
	if (!value) {
		active?.resolve(null); queue.forEach((item) => item.resolve(null)); active = null; queue = []
	} else next()
}

export function openMpinDialog(options) {
	if (!presenter) return Promise.reject(new Error("MPIN dialog is unavailable."))
	return new Promise((resolve) => { queue.push({ options, resolve }); next() })
}

export async function authorizeMpin(path, payload, knownPolicy) {
	const policy = knownPolicy || await mpinRequest("/policy", { path, payload })
	if (!policy.required) return { policy, headers: {} }
	const token = await openMpinDialog({ mode: "verify", path, payload, action: policy.action })
	if (!token) throw new DOMException("Action cancelled", "AbortError")
	return { policy, headers: { "X-MPIN-Authorization": token } }
}
