export const REJECTION_REAPPLY_COOLDOWN_MS = 24 * 60 * 60 * 1000

export function toDateMs(value) {
	if (!value) return 0
	const date = value?.toDate ? value.toDate() : new Date(value)
	return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

export function isRejectedScholarship(entry = {}) {
	const normalized = String(entry?.status || entry?.reviewStatus || "").toLowerCase()
	return entry?.rejected === true || ["rejected", "denied", "declined"].some((keyword) => normalized.includes(keyword))
}

export function getRejectedAtMs(entry = {}) {
	return toDateMs(entry?.rejectedAt || entry?.archivedAt || entry?.updatedAt || entry?.applicationDate || entry?.appliedAt || entry?.createdAt)
}

export function getRejectionCooldown(entry = {}) {
	const rejectedAt = getRejectedAtMs(entry)
	if (!rejectedAt) return { active: false, remainingMs: 0, readyAt: null }
	const readyAtMs = rejectedAt + REJECTION_REAPPLY_COOLDOWN_MS
	return {
		active: Date.now() < readyAtMs,
		remainingMs: Math.max(0, readyAtMs - Date.now()),
		readyAt: new Date(readyAtMs),
	}
}

export function formatCooldownDuration(ms = 0) {
	const totalMinutes = Math.ceil(ms / (60 * 1000))
	if (totalMinutes <= 0) return "now"
	const hours = Math.floor(totalMinutes / 60)
	const minutes = totalMinutes % 60
	if (hours <= 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`
	if (minutes <= 0) return `${hours} hour${hours === 1 ? "" : "s"}`
	return `${hours}h ${minutes}m`
}

export function hasActiveRejectionCooldown(scholarships = []) {
	return (scholarships || []).some((entry) => isRejectedScholarship(entry) && getRejectionCooldown(entry).active)
}

export function getLatestRejectedScholarship(scholarships = []) {
	return (scholarships || [])
		.filter(isRejectedScholarship)
		.sort((left, right) => getRejectedAtMs(right) - getRejectedAtMs(left))[0] || null
}

export function splitExpiredRejectedScholarships(scholarships = []) {
	const active = []
	const expiredRejected = []
	;(scholarships || []).forEach((entry) => {
		if (isRejectedScholarship(entry) && !getRejectionCooldown(entry).active) {
			expiredRejected.push(entry)
		} else {
			active.push(entry)
		}
	})
	return { active, expiredRejected }
}
