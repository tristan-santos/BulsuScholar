const CALLBACK_QUERY_KEYS = [
	"code",
	"error",
	"error_code",
	"error_description",
	"sb_flow_id",
	"token_hash",
	"type",
]

const CALLBACK_HASH_KEYS = [
	"access_token",
	"expires_at",
	"expires_in",
	"refresh_token",
	"token_type",
	"type",
	"error",
	"error_code",
	"error_description",
]

const activeResolutions = new Map()

export function summarizeAuthError(error) {
	if (!error) return null
	return {
		name: String(error.name || "Error"),
		code: String(error.code || error.error_code || "auth_callback_error"),
		status: Number(error.status || 0) || undefined,
		message: String(error.message || "Authentication callback failed."),
	}
}

export function logEmailConfirmationStep(step, details = {}) {
	console.info(`[BulsuScholar][Email Confirmation] ${step}`, details)
}

function callbackShape(url) {
	const query = url.searchParams
	const hash = new URLSearchParams(url.hash.replace(/^#/, ""))
	return {
		path: url.pathname,
		type: query.get("type") || hash.get("type") || "unknown",
		hasTokenHash: Boolean(query.get("token_hash")),
		hasCode: Boolean(query.get("code")),
		hasImplicitTokens: Boolean(hash.get("access_token") && hash.get("refresh_token")),
		hasProviderError: Boolean(callbackError(query) || callbackError(hash)),
	}
}

function callbackError(params) {
	const message = params.get("error_description") || params.get("error")
	if (!message) return null
	const error = new Error(message.replaceAll("+", " "))
	error.code = params.get("error_code") || params.get("error") || "auth_callback_error"
	return error
}

export function clearAuthCallbackFromUrl() {
	const url = new URL(window.location.href)
	CALLBACK_QUERY_KEYS.forEach((key) => url.searchParams.delete(key))

	const hash = new URLSearchParams(url.hash.replace(/^#/, ""))
	CALLBACK_HASH_KEYS.forEach((key) => hash.delete(key))
	const cleanHash = hash.toString()
	url.hash = cleanHash ? `#${cleanHash}` : ""
	window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
}

async function clearInvalidLocalSession(supabase) {
	await supabase.auth.signOut({ scope: "local" }).catch(() => {})
}

async function useCurrentSessionAfterCallbackError(supabase, error, method) {
	const { data, error: sessionError } = await supabase.auth.getSession()
	if (data?.session?.user) {
		logEmailConfirmationStep("callback_session_recovered", {
			method,
			authUserId: data.session.user.id,
			emailConfirmed: Boolean(data.session.user.email_confirmed_at),
			originalError: summarizeAuthError(error),
		})
		return { session: data.session, error: null, hadCallback: true }
	}
	logEmailConfirmationStep("callback_session_failed", {
		method,
		error: summarizeAuthError(error),
		sessionError: summarizeAuthError(sessionError),
	})
	return { session: null, error, hadCallback: true }
}

async function resolveAuthCallback(supabase, allowedOtpTypes) {
	const url = new URL(window.location.href)
	const query = url.searchParams
	const hash = new URLSearchParams(url.hash.replace(/^#/, ""))
	const urlError = callbackError(query) || callbackError(hash)
	const shape = callbackShape(url)
	logEmailConfirmationStep("confirmation_page_opened", shape)

	if (urlError) {
		logEmailConfirmationStep("provider_redirect_error", { ...shape, error: summarizeAuthError(urlError) })
		clearAuthCallbackFromUrl()
		return { session: null, error: urlError, hadCallback: true }
	}

	const tokenHash = query.get("token_hash")
	if (tokenHash) {
		const otpType = query.get("type") || "email"
		if (allowedOtpTypes.length && !allowedOtpTypes.includes(otpType)) {
			clearAuthCallbackFromUrl()
			return {
				session: null,
				error: new Error("This authentication link is for a different action."),
				hadCallback: true,
			}
		}
		logEmailConfirmationStep("token_hash_verification_started", { type: otpType })
		const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType })
		clearAuthCallbackFromUrl()
		if (error) return useCurrentSessionAfterCallbackError(supabase, error, "token_hash")
		logEmailConfirmationStep("token_hash_verification_succeeded", {
			authUserId: data?.session?.user?.id || "",
			emailConfirmed: Boolean(data?.session?.user?.email_confirmed_at),
		})
		return { session: data?.session || null, error, hadCallback: true }
	}

	const code = query.get("code")
	if (code) {
		const flowId = query.get("sb_flow_id")
		logEmailConfirmationStep("authorization_code_exchange_started", { hasFlowId: Boolean(flowId) })
		const { data, error } = await supabase.auth.exchangeCodeForSession(
			code,
			flowId ? { flowId } : undefined,
		)
		clearAuthCallbackFromUrl()
		if (error) return useCurrentSessionAfterCallbackError(supabase, error, "authorization_code")
		logEmailConfirmationStep("authorization_code_exchange_succeeded", {
			authUserId: data?.session?.user?.id || "",
			emailConfirmed: Boolean(data?.session?.user?.email_confirmed_at),
		})
		return { session: data?.session || null, error, hadCallback: true }
	}

	const accessToken = hash.get("access_token")
	const refreshToken = hash.get("refresh_token")
	if (accessToken && refreshToken) {
		logEmailConfirmationStep("implicit_session_exchange_started", {})
		const { data, error } = await supabase.auth.setSession({
			access_token: accessToken,
			refresh_token: refreshToken,
		})
		clearAuthCallbackFromUrl()
		if (error) return useCurrentSessionAfterCallbackError(supabase, error, "implicit")
		logEmailConfirmationStep("implicit_session_exchange_succeeded", {
			authUserId: data?.session?.user?.id || "",
			emailConfirmed: Boolean(data?.session?.user?.email_confirmed_at),
		})
		return { session: data?.session || null, error, hadCallback: true }
	}

	const { data, error } = await supabase.auth.getSession()
	if (error) await clearInvalidLocalSession(supabase)
	logEmailConfirmationStep("stored_session_checked", {
		hasSession: Boolean(data?.session?.user),
		authUserId: data?.session?.user?.id || "",
		error: summarizeAuthError(error),
	})
	return { session: data?.session || null, error, hadCallback: false }
}

export function resolveSupabaseAuthCallback(supabase, { allowedOtpTypes = [] } = {}) {
	// React StrictMode can run the page effect twice. Confirmation tokens are
	// one-time credentials, so every route gets exactly one exchange promise.
	const requestKey = `${window.location.pathname}|${allowedOtpTypes.join(",")}`
	if (activeResolutions.has(requestKey)) {
		logEmailConfirmationStep("callback_resolution_reused", { path: window.location.pathname })
		return activeResolutions.get(requestKey)
	}
	const promise = resolveAuthCallback(supabase, allowedOtpTypes)
	activeResolutions.set(requestKey, promise)
	return promise
}
