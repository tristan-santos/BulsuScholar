const BACKEND_API_URL = (
	import.meta.env.VITE_BACKEND_API_URL ||
	import.meta.env.VITE_DOCUMENT_SCAN_API_URL ||
	"https://bulsuscholar.onrender.com"
).replace(/\/$/, "")

export async function matchAdminGrantorStudents(students = [], grantorScholars = []) {
	const response = await fetch(`${BACKEND_API_URL}/admin/match-grantor-students`, {
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
	const response = await fetch(`${BACKEND_API_URL}/admin/check-student-duplicates`, {
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
