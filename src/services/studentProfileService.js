import { requireBackendApiUrl } from "../config/backendApi"
import { buildPortalRequestHeaders, PortalApiError } from "./portalApi"
import { trackedFetch } from "./operationTracker"

const baseUrl = () => requireBackendApiUrl("Student profile backend")

async function parseResponse(response, fallback) {
	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		const detail = data?.detail || data?.message || data?.reason || fallback
		const message = typeof detail === "object" ? detail.code || JSON.stringify(detail) : String(detail)
		throw new PortalApiError(message.replaceAll("_", " "), {
			status: response.status,
			reason: typeof detail === "object" ? detail.code || "" : String(detail),
			data,
		})
	}
	return data
}

async function jsonRequest(path, { method = "GET", payload, operation = "document.upload" } = {}) {
	const response = await trackedFetch(`${baseUrl()}${path}`, {
		method,
		headers: await buildPortalRequestHeaders(),
		...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
	}, operation)
	return parseResponse(response, "Profile request failed")
}

export function getStudentProfileWorkspace() {
	return jsonRequest("/student/profile/workspace", { operation: null })
}

export function saveStudentProfileDraft(profile) {
	return jsonRequest("/student/profile/draft", { method: "PUT", payload: { profile } })
}

export async function uploadStudentProfilePhoto(file) {
	const form = new FormData()
	form.append("file", file)
	const headers = await buildPortalRequestHeaders()
	delete headers["Content-Type"]
	const response = await trackedFetch(`${baseUrl()}/student/profile/photo`, {
		method: "POST",
		headers,
		body: form,
	}, "document.upload")
	return parseResponse(response, "Profile photo upload failed")
}

export async function getStudentProfilePhotoBlob() {
	const response = await trackedFetch(`${baseUrl()}/student/profile/photo/content`, {
		headers: await buildPortalRequestHeaders(),
	}, "generic.background")
	if (!response.ok) throw new PortalApiError("Unable to open your profile photo.", { status: response.status })
	return response.blob()
}

export async function previewStudentProfileDraft(profile) {
	const response = await trackedFetch(`${baseUrl()}/student/profile/preview`, {
		method: "POST",
		headers: await buildPortalRequestHeaders(),
		body: JSON.stringify({ profile }),
	}, "document.download")
	if (!response.ok) throw new PortalApiError("Unable to preview this profile.", { status: response.status })
	return response.blob()
}

export function submitStudentProfile(signatureDataUrl) {
	return jsonRequest("/student/profile/submit", { method: "POST", payload: { signatureDataUrl } })
}

export async function uploadStudentVerificationDocument(documentType, file, documentKind = "") {
	const form = new FormData()
	form.append("file", file)
	const headers = await buildPortalRequestHeaders()
	delete headers["Content-Type"]
	const params = documentKind ? `?document_kind=${encodeURIComponent(documentKind)}` : ""
	const response = await trackedFetch(`${baseUrl()}/student/profile/documents/${encodeURIComponent(documentType)}${params}`, {
		method: "POST",
		headers,
		body: form,
	}, "document.upload")
	return parseResponse(response, "Document upload failed")
}

export async function getStudentVerificationDocumentBlob(submissionId) {
	const response = await trackedFetch(`${baseUrl()}/student/profile/documents/${encodeURIComponent(submissionId)}/content`, {
		headers: await buildPortalRequestHeaders(),
	}, "document.download")
	if (!response.ok) throw new PortalApiError("Unable to open this document.", { status: response.status })
	return response.blob()
}

export function getDocumentReviewQueue(filters = {}) {
	const params = new URLSearchParams()
	Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
	return jsonRequest(`/admin/document-reviews${params.size ? `?${params}` : ""}`, { operation: null })
}

export function getPendingStudentAccounts() {
	return jsonRequest("/admin/students/pending", { operation: null })
}

export function approvePendingStudentAccount(studentId) {
	return jsonRequest(`/admin/students/pending/${encodeURIComponent(studentId)}/approve`, {
		method: "POST",
	})
}

export function reviewStudentDocument(submissionId, decision) {
	return jsonRequest(`/admin/document-reviews/${encodeURIComponent(submissionId)}`, {
		method: "POST",
		payload: decision,
	})
}

export function updateDocumentPolicy(policy) {
	const payload = typeof policy === "string" ? { corMode: policy } : policy
	return jsonRequest("/admin/document-policy", { method: "POST", payload })
}

export function createDocumentException(payload) {
	return jsonRequest("/admin/document-exceptions", { method: "POST", payload })
}
