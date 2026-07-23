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
		const message = await response.text().catch(() => "")
		throw new Error(message || "Document scanner is not available.")
	}

	return response.json()
}
