import { supabase } from "./supabaseClient"

export class PortalApiError extends Error {
	constructor(message, { status = 0, reason = "", data = null } = {}) {
		super(message)
		this.name = "PortalApiError"
		this.status = status
		this.reason = reason
		this.data = data
	}
}

export async function buildPortalRequestHeaders(overrides = {}) {
	const actorId = overrides.actorId || sessionStorage.getItem("bulsuscholar_userId") || ""
	const storedActorType = sessionStorage.getItem("bulsuscholar_userType") || ""
	const overrideActorType = overrides.actorType === "provider" ? "grantor" : overrides.actorType
	const actorType = overrideActorType || (storedActorType === "provider" ? "grantor" : storedActorType)
	const { data } = await supabase.auth.getSession()
	const accessToken = data?.session?.access_token || ""

	return {
		"Content-Type": "application/json",
		...(actorId ? { "X-Portal-Actor-Id": actorId } : {}),
		...(actorType ? { "X-Portal-Actor-Type": actorType } : {}),
		...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
	}
}

export async function postPortalJson(baseUrl, path, payload = {}, errorLabel = "Request", options = {}) {
	let response
	const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(1000, Number(options.timeoutMs)) : 0
	const controller = timeoutMs > 0 ? new AbortController() : null
	const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
	try {
		response = await fetch(`${baseUrl}${path}`, {
			method: "POST",
			headers: await buildPortalRequestHeaders(options.actor || {}),
			body: JSON.stringify(payload),
			...(controller ? { signal: controller.signal } : {}),
		})
	} catch (error) {
		if (error?.name === "AbortError") {
			throw new PortalApiError(`${errorLabel} timed out. Please try again.`, {
				status: 408,
				reason: "request_timeout",
			})
		}
		throw new PortalApiError(`${errorLabel} backend is unavailable at ${baseUrl}. ${error?.message || ""}`.trim(), {
			reason: "backend_unavailable",
		})
	} finally {
		if (timeoutId) clearTimeout(timeoutId)
	}

	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		const detail = data?.message || data?.detail || data?.reason || data?.error || data?.result || data?.results || data
		throw new PortalApiError(typeof detail === "string" ? detail : JSON.stringify(detail), {
			status: response.status,
			reason: String(data?.reason || data?.detail || data?.error || ""),
			data,
		})
	}
	return data
}
