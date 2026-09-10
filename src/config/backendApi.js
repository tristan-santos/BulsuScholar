const normalizeBaseUrl = (value = "") => String(value || "").trim().replace(/\/$/, "")

const developmentBackendUrl = import.meta.env.DEV ? "http://127.0.0.1:8000" : ""

export const BACKEND_API_URL = normalizeBaseUrl(
	import.meta.env.VITE_BACKEND_API_URL || developmentBackendUrl,
)

export const DOCUMENT_SCAN_API_URL = normalizeBaseUrl(
	import.meta.env.VITE_DOCUMENT_SCAN_API_URL || BACKEND_API_URL,
)

export function requireBackendApiUrl(label = "Backend") {
	if (BACKEND_API_URL) return BACKEND_API_URL
	throw new Error(
		`${label} URL is not configured. Set VITE_BACKEND_API_URL and redeploy the frontend.`,
	)
}

export function requireDocumentScanApiUrl() {
	if (DOCUMENT_SCAN_API_URL) return DOCUMENT_SCAN_API_URL
	throw new Error(
		"Document scanner URL is not configured. Set VITE_DOCUMENT_SCAN_API_URL or VITE_BACKEND_API_URL and redeploy the frontend.",
	)
}
