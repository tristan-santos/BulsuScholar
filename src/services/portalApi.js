import { supabase } from "./supabaseClient"

export async function buildPortalRequestHeaders() {
	const actorId = sessionStorage.getItem("bulsuscholar_userId") || ""
	const storedActorType = sessionStorage.getItem("bulsuscholar_userType") || ""
	const actorType = storedActorType === "provider" ? "grantor" : storedActorType
	const { data } = await supabase.auth.getSession()
	const accessToken = data?.session?.access_token || ""

	return {
		"Content-Type": "application/json",
		...(actorId ? { "X-Portal-Actor-Id": actorId } : {}),
		...(actorType ? { "X-Portal-Actor-Type": actorType } : {}),
		...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
	}
}

export async function postPortalJson(baseUrl, path, payload = {}, errorLabel = "Request") {
	let response
	try {
		response = await fetch(`${baseUrl}${path}`, {
			method: "POST",
			headers: await buildPortalRequestHeaders(),
			body: JSON.stringify(payload),
		})
	} catch (error) {
		throw new Error(`${errorLabel} backend is unavailable at ${baseUrl}. ${error?.message || ""}`.trim())
	}

	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		const detail = data?.message || data?.detail || data?.reason || data?.error || data?.result || data?.results || data
		throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail))
	}
	return data
}
