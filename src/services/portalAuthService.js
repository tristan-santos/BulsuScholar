import { requireBackendApiUrl } from "../config/backendApi"
import { supabase } from "./supabaseClient"
import { buildPortalRequestHeaders, PortalApiError } from "./portalApi"
import { trackedFetch } from "./operationTracker"

async function authRequest(path, { method = "POST", payload, operation = "auth.login" } = {}) {
	const response = await trackedFetch(`${requireBackendApiUrl("Authentication backend")}${path}`, {
		method,
		headers: await buildPortalRequestHeaders(),
		...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
	}, operation)
	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		const detail = data?.detail
		const missingRoute = response.status === 404 || response.status === 405
		const code = missingRoute ? "authentication_backend_update_required" : typeof detail === "object" ? detail.code : detail || data?.reason || "authentication_failed"
		const message = missingRoute
			? "Authentication is temporarily unavailable. Please contact the scholarship office."
			: String(code).replaceAll("_", " ")
		const error = new PortalApiError(message, {
			status: response.status,
			reason: String(code),
			data: typeof detail === "object" ? detail : data,
		})
		throw error
	}
	return data
}

export async function loginWithUserId(userId, password) {
	const result = await authRequest("/auth/login", { payload: { userId, password } })
	const session = result.session || {}
	const { error } = await supabase.auth.setSession({
		access_token: session.access_token,
		refresh_token: session.refresh_token,
	})
	if (error) throw error
	return result.account
}

export const validatePortalSession = () => authRequest("/auth/session", {
	method: "GET",
	operation: "generic.background",
})

export const requestPasswordRecovery = (userId) => authRequest("/auth/recovery/request", {
	payload: { userId },
	operation: "auth.password-request",
})

export const completePasswordRecovery = (challenge) => authRequest("/auth/recovery/complete", {
	payload: { challenge },
	operation: "auth.password-update",
})

export const getLoginSecuritySettings = () => authRequest("/admin/security/settings", { method: "GET", operation: "generic.background" })

export const saveLoginSecuritySettings = (loginAttemptLimit) => authRequest("/admin/security/settings", {
	payload: { loginAttemptLimit },
	operation: "record.save",
})
