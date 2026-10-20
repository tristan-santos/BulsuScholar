import { requireBackendApiUrl } from "../config/backendApi"
import { buildPortalRequestHeaders, PortalApiError } from "./portalApi"
import { trackedFetch } from "./operationTracker"

export async function uploadScholarshipRequirementFiles(applicationId, requirementKey, files) {
	if (!applicationId) throw new Error("This application needs to be refreshed before uploading. Reload the page and try again.")
	const form = new FormData()
	files.forEach((file) => form.append("files", file))
	const headers = await buildPortalRequestHeaders()
	delete headers["Content-Type"]
	const response = await trackedFetch(`${requireBackendApiUrl("Scholarship uploads")}/student/scholarships/${encodeURIComponent(applicationId)}/requirements/${encodeURIComponent(requirementKey)}/files`, {
		method: "POST", headers, body: form,
	}, "document.upload")
	const data = await response.json().catch(() => ({}))
	if (!response.ok || data.ok === false) {
		const detail = data.detail || data.reason || "Document upload failed"
		const reason = typeof detail === "string" ? detail : detail.message || "Document upload failed"
		throw new PortalApiError(reason.replaceAll("_", " "), { status: response.status, reason, data })
	}
	return data
}
