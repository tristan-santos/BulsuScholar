import { requireBackendApiUrl } from "../config/backendApi"

export async function matchAdminGrantorStudents(students = [], grantorScholars = []) {
	const response = await fetch(`${requireBackendApiUrl("Admin matching backend")}/admin/match-grantor-students`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ students, grantorScholars }),
	})
	const data = await response.json().catch(() => ({}))
	if (!response.ok) {
		throw new Error(data?.detail || data?.error || `Admin matching failed: ${response.status}`)
	}
	return data
}

export async function checkAdminStudentDuplicates(records = [], options = {}) {
	const response = await fetch(`${requireBackendApiUrl("Admin matching backend")}/admin/check-student-duplicates`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ records, options }),
	})
	const data = await response.json().catch(() => ({}))
	if (!response.ok) {
		throw new Error(data?.detail || data?.error || `Admin duplicate check failed: ${response.status}`)
	}
	return data
}
