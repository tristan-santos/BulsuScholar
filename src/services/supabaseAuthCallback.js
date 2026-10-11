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

async function recoverCurrentSessionAfterCallbackError(supabase, error) {
	const { data } = await supabase.auth.getSession()
	if (data?.session?.user) {
		return { session: data.session, error: null, hadCallback: true }
	}
	return { session: null, error, hadCallback: true }
}

async function resolveAuthCallback(supabase, allowedOtpTypes) {
	const url = new URL(window.location.href)
	const query = url.searchParams
	const hash = new URLSearchParams(url.hash.replace(/^#/, ""))
	const urlError = callbackError(query) || callbackError(hash)

	if (urlError) {
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
		const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType })
		clearAuthCallbackFromUrl()
		if (error) return recoverCurrentSessionAfterCallbackError(supabase, error)
		return { session: data?.session || null, error, hadCallback: true }
	}

	const code = query.get("code")
	if (code) {
		const flowId = query.get("sb_flow_id")
		const { data, error } = await supabase.auth.exchangeCodeForSession(
			code,
			flowId ? { flowId } : undefined,
		)
		clearAuthCallbackFromUrl()
		if (error) return recoverCurrentSessionAfterCallbackError(supabase, error)
		return { session: data?.session || null, error, hadCallback: true }
	}

	const accessToken = hash.get("access_token")
	const refreshToken = hash.get("refresh_token")
	if (accessToken && refreshToken) {
		const { data, error } = await supabase.auth.setSession({
			access_token: accessToken,
			refresh_token: refreshToken,
		})
		clearAuthCallbackFromUrl()
		if (error) return recoverCurrentSessionAfterCallbackError(supabase, error)
		return { session: data?.session || null, error, hadCallback: true }
	}

	const { data, error } = await supabase.auth.getSession()
	if (error) await clearInvalidLocalSession(supabase)
	return { session: data?.session || null, error, hadCallback: false }
}

export function resolveSupabaseAuthCallback(supabase, { allowedOtpTypes = [] } = {}) {
	// React StrictMode can run the page effect twice. Confirmation tokens are
	// one-time credentials, so every route gets exactly one exchange promise.
	const requestKey = `${window.location.pathname}|${allowedOtpTypes.join(",")}`
	if (activeResolutions.has(requestKey)) {
		return activeResolutions.get(requestKey)
	}
	const promise = resolveAuthCallback(supabase, allowedOtpTypes)
	activeResolutions.set(requestKey, promise)
	return promise
}
