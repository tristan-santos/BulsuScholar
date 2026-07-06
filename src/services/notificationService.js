const BACKEND_API_URL = (
	import.meta.env.VITE_BACKEND_API_URL ||
	import.meta.env.VITE_DOCUMENT_SCAN_API_URL ||
	"http://localhost:8000"
).replace(/\/$/, "")

async function postNotification(path, payload = {}) {
	const response = await fetch(`${BACKEND_API_URL}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	})
	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		throw new Error(data?.detail || data?.reason || data?.error || `Notification request failed: ${response.status}`)
	}
	return data
}

export function createStudentNotification(payload = {}) {
	return postNotification("/notifications/student/create", payload)
}

export function createGrantorNotification(payload = {}) {
	return postNotification("/notifications/grantor/create", payload)
}

export function updateStudentNotification(id = "", data = {}) {
	return postNotification("/notifications/student/update", { id, data })
}

export function updateGrantorNotification(id = "", data = {}) {
	return postNotification("/notifications/grantor/update", { id, data })
}

export function deleteStudentNotification(id = "") {
	return postNotification("/notifications/student/delete", { id })
}

export function deleteGrantorNotification(id = "") {
	return postNotification("/notifications/grantor/delete", { id })
}
