import { requireDocumentScanApiUrl } from "../config/backendApi"

export async function scanStudentDocument(file, documentType = "cor") {
	if (!file) return null
	const documentScanApiUrl = requireDocumentScanApiUrl()

	const formData = new FormData()
	formData.append("file", file)

	let response
	try {
		response = await fetch(
			`${documentScanApiUrl}/scan-document?document_type=${encodeURIComponent(documentType)}`,
			{
				method: "POST",
				body: formData,
			},
		)
	} catch (error) {
		throw new Error(
			`Document scanner is unavailable at ${documentScanApiUrl}. Check the backend deployment and CORS settings. ${error?.message || ""}`.trim(),
		)
	}

	if (!response.ok) {
		const errorPayload = await response.clone().json().catch(() => null)
		const fallbackMessage = await response.text().catch(() => "")
		if (errorPayload?.detail?.error === "ocr_dependency_missing") {
			throw new Error(
				"Tesseract OCR is not installed on the deployed backend. Redeploy the backend using the repository Dockerfile so COR/ROG scanned PDFs can be read.",
			)
		}
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
