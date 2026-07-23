const DOCUMENT_SCAN_API_URL = (
	import.meta.env.VITE_DOCUMENT_SCAN_API_URL || "https://bulsuscholar.onrender.com"
).replace(/\/$/, "")

export async function scanStudentDocument(file, documentType = "cor") {
	if (!file) return null

	const formData = new FormData()
	formData.append("file", file)

	const response = await fetch(
		`${DOCUMENT_SCAN_API_URL}/scan-document?document_type=${encodeURIComponent(documentType)}`,
		{
			method: "POST",
			body: formData,
		},
	)

	if (!response.ok) {
		const message = await response.text().catch(() => "")
		throw new Error(message || "Document scanner is not available.")
	}

	return response.json()
}
