export function sanitizeContactNumber(value = "") {
	return String(value || "").replace(/\D/g, "")
}

export function normalizeContactNumber(value = "") {
	const digits = sanitizeContactNumber(value)
	if (/^9\d{9}$/.test(digits)) return `0${digits}`
	return digits
}

export function isValidContactNumber(value = "") {
	const digits = sanitizeContactNumber(value)
	return /^09\d{9}$/.test(digits) || /^9\d{9}$/.test(digits)
}

export const CONTACT_NUMBER_RULE_MESSAGE =
	"Contact number must be 11 digits starting with 09, or 10 digits starting with 9."
