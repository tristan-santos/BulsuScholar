const DOCUMENT_SCAN_API_URL = (
	import.meta.env.VITE_DOCUMENT_SCAN_API_URL || "https://bulsuscholar.onrender.com"
).replace(/\/$/, "")

export async function scanStudentDocument(file, documentType = "cor") {
	if (!file) return null

	const formData = new FormData()
	formData.append("file", file)

	let response
	try {
		response = await fetch(
			`${DOCUMENT_SCAN_API_URL}/scan-document?document_type=${encodeURIComponent(documentType)}`,
			{
				method: "POST",
				body: formData,
			},
		)
	} catch (error) {
		throw new Error(
			`Document scanner is unavailable at ${DOCUMENT_SCAN_API_URL}. Check Render deployment and CORS. ${error?.message || ""}`.trim(),
		)
	}

	if (!response.ok) {
		const errorPayload = await response.clone().json().catch(() => null)
		const fallbackMessage = await response.text().catch(() => "")
		const detail =
			errorPayload?.message ||
			errorPayload?.detail?.message ||
			errorPayload?.detail ||
			fallbackMessage ||
			"Document scanner is not available."
		throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail))
	}

	return response.json()
}
