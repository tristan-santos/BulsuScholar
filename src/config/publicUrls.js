const normalizeUrl = (value = "") => String(value || "").trim().replace(/\/$/, "")

const developmentAppUrl = import.meta.env.DEV && typeof window !== "undefined"
	? window.location.origin
	: ""

export const PUBLIC_APP_URL = normalizeUrl(
	import.meta.env.VITE_APP_URL || import.meta.env.VITE_PUBLIC_SITE_URL || developmentAppUrl,
)

export function requirePublicAppUrl() {
	if (PUBLIC_APP_URL) return PUBLIC_APP_URL
	throw new Error(
		"Public application URL is not configured. Set VITE_APP_URL and redeploy the frontend.",
	)
}
