import { requireBackendApiUrl } from "../config/backendApi"
import { postPortalJson } from "./portalApi"

async function postNotification(path, payload = {}, options = {}) {
	return postPortalJson(requireBackendApiUrl("Notification backend"), path, payload, "Notification", { timeoutMs: 15000, ...options })
}

async function loadNotificationInbox(path, portalLabel) {
	try {
		return await postNotification(path)
	} catch (error) {
		if ([404, 405].includes(error.status)) {
			error.message = `The deployed backend is missing the ${portalLabel} inbox API. Deploy the latest backend to Railway, then reload this page.`
			error.reason = "inbox_deployment_required"
		}
		throw error
	}
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

export async function loadAdminNotifications() {
	return loadNotificationInbox("/notifications/admin/list", "administrator")
}

export function loadStudentNotifications() {
	return loadNotificationInbox("/notifications/student/list", "student")
}

export function loadGrantorNotifications() {
	return loadNotificationInbox("/notifications/grantor/list", "grantor")
}

export function deleteAdminNotification(id = "") {
	return postNotification("/notifications/admin/delete", { id })
}

export function createGrantorNotification(payload = {}) {
	return postNotification("/notifications/grantor/create", payload, { timeoutMs: 45000 })
}

export function updateStudentNotification(id = "", data = {}, sourceTable = "studentNotifications") {
	return postNotification("/notifications/student/update", { id, data, sourceTable })
}

export function updateStudentNotifications(ids = [], data = {}, sourceTable = "studentNotifications") {
	return postNotification("/notifications/student/update-many", { ids, data, sourceTable })
}

export function updateGrantorNotification(id = "", data = {}, sourceTable = "grantorNotifications") {
	return postNotification("/notifications/grantor/update", { id, data, sourceTable })
}

export function updateGrantorNotifications(ids = [], data = {}, sourceTable = "grantorNotifications") {
	return postNotification("/notifications/grantor/update-many", { ids, data, sourceTable })
}

export function deleteStudentNotification(id = "", sourceTable = "studentNotifications") {
	return postNotification("/notifications/student/delete", { id, sourceTable })
}

export function deleteGrantorNotification(id = "", sourceTable = "grantorNotifications") {
	return postNotification("/notifications/grantor/delete", { id, sourceTable })
}
