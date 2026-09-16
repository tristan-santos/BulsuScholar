export function getNameInitials(value = "", fallback = "G") {
	const parts = String(value || "").trim().split(/\s+/).filter(Boolean)
	if (parts.length === 0) return fallback
	const first = parts[0]?.[0] || ""
	const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : ""
	return `${first}${last}`.toUpperCase() || fallback
}

