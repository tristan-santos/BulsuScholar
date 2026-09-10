import { requireBackendApiUrl } from "../config/backendApi"
import { postPortalJson } from "./portalApi"

async function postNotification(path, payload = {}) {
	return postPortalJson(requireBackendApiUrl("Notification backend"), path, payload, "Notification", { timeoutMs: 15000 })
}

export function createStudentNotification(payload = {}) {
	return postNotification("/notifications/student/create", payload)
}

export function broadcastStudentNotification(payload = {}) {
	return postNotification("/notifications/student/broadcast", payload)
}

export function createAdminNotification(payload = {}) {
	return postNotification("/notifications/admin/create", payload)
}

export function updateAdminNotification(id = "", data = {}) {
	return postNotification("/notifications/admin/update", { id, data })
}

export function deleteAdminNotification(id = "") {
	return postNotification("/notifications/admin/delete", { id })
}

export function createGrantorNotification(payload = {}) {
	return postNotification("/notifications/grantor/create", payload)
}

export function updateStudentNotification(id = "", data = {}) {
	return postNotification("/notifications/student/update", { id, data })
}

export function updateStudentNotifications(ids = [], data = {}) {
	return postNotification("/notifications/student/update-many", { ids, data })
}

export function updateGrantorNotification(id = "", data = {}) {
	return postNotification("/notifications/grantor/update", { id, data })
}

export function updateGrantorNotifications(ids = [], data = {}) {
	return postNotification("/notifications/grantor/update-many", { ids, data })
}

export function deleteStudentNotification(id = "") {
	return postNotification("/notifications/student/delete", { id })
}

export function deleteGrantorNotification(id = "") {
	return postNotification("/notifications/grantor/delete", { id })
}
