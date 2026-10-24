import { supabase } from "./supabaseClient"
import { trackedFetch } from "./operationTracker"
import { getPortalIdentity } from "./portalSessionStorage"

let pendingSessionRefresh = null

async function refreshReadSession() {
	if (!pendingSessionRefresh) {
		pendingSessionRefresh = supabase.auth.refreshSession().finally(() => { pendingSessionRefresh = null })
	}
	return pendingSessionRefresh
}

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
	const identity = getPortalIdentity()
	const actorId = overrides.actorId || identity.userId || ""
	const storedActorType = identity.userType || ""
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
	const abortFromCaller = () => controller?.abort()
	if (options.signal?.aborted) abortFromCaller()
	else options.signal?.addEventListener("abort", abortFromCaller, { once: true })
	const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
	try {
		const send = async () => trackedFetch(`${baseUrl}${path}`, {
			method: "POST",
			headers: await buildPortalRequestHeaders(options.actor || {}),
			body: JSON.stringify(payload),
			...(controller || options.signal ? { signal: controller?.signal || options.signal } : {}),
		}, options.operation || null)
		response = await send()
		// Retry only an authorized read, never a mutation or an OTP/revocation denial.
		if (path === "/portal/data/query" && response.status === 401) {
			const denial = await response.clone().json().catch(() => ({}))
			if (denial.detail === "invalid_authentication_session") {
				const identity = getPortalIdentity()
				const { data: session } = await supabase.auth.getSession()
				if (session?.session?.refresh_token) {
					const refreshed = await refreshReadSession()
					const current = getPortalIdentity()
					if (!refreshed.error && refreshed.data?.session && current.userId === identity.userId && current.userType === identity.userType) response = await send()
				}
			}
		}
	} catch (error) {
		if (options.signal?.aborted) throw error
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
		options.signal?.removeEventListener("abort", abortFromCaller)
	}

	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		const detailObject = data?.detail && typeof data.detail === "object" ? data.detail : null
		const detail = data?.message || detailObject?.message || data?.detail || data?.reason || data?.error || data?.result || data?.results || data
		throw new PortalApiError(typeof detail === "string" ? detail : JSON.stringify(detail), {
			status: response.status,
			reason: String(data?.reason || detailObject?.reason || detailObject?.code || (typeof data?.detail === "string" ? data.detail : "") || data?.error || ""),
			data: detailObject ? { ...data, ...detailObject } : data,
		})
	}
	return data
}
