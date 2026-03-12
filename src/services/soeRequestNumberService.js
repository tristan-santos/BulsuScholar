function getStudentNumberSuffix(studentId = "") {
	const digits = String(studentId ?? "").replace(/\D/g, "")
	if (!digits) return "000"
	return digits.slice(-3).padStart(3, "0")
}

function buildRandomLowercaseAlphaNumeric(length = 6) {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	let value = ""
	for (let index = 0; index < length; index += 1) {
		value += chars[Math.floor(Math.random() * chars.length)]
	}
	return value
}

export function generateFallbackSoeRequestNumber(studentId = "") {
	return `${getStudentNumberSuffix(studentId)}-${buildRandomLowercaseAlphaNumeric(6)}`
}

export function resolveSoeRequestNumber(requestNumber = "", studentId = "") {
	const normalized = String(requestNumber ?? "").trim()
	return normalized || generateFallbackSoeRequestNumber(studentId)
}
