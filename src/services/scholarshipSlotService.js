export const SCHOLARSHIP_SLOT_PRESETS = [25, 50, 75, 100, 125, 150, 175, 200]
export const OTHER_SLOT_VALUE = "other"

export const SCHOLARSHIP_SLOT_OPTIONS = [
	...SCHOLARSHIP_SLOT_PRESETS.map((value) => ({ value: String(value), label: String(value) })),
	{ value: OTHER_SLOT_VALUE, label: "Other" },
]

export function parseScholarshipSlotCount(value) {
	const text = String(value ?? "").trim()
	if (!/^\d+$/.test(text)) return null
	const parsed = Number(text)
	return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 1000 ? parsed : null
}

export function normalizeScholarshipSlots(raw = {}) {
	const totalSlots = parseScholarshipSlotCount(raw.totalSlots)
	const configured = raw.slotsConfigured === true && totalSlots !== null
	const parsedRemaining = Number(raw.remainingSlots)
	const remainingSlots = configured && Number.isFinite(parsedRemaining)
		? Math.min(totalSlots, Math.max(0, Math.trunc(parsedRemaining)))
		: null
	return {
		slotsConfigured: configured,
		totalSlots,
		remainingSlots,
		lowSlotNotificationSentAt: raw.lowSlotNotificationSentAt || null,
	}
}

export function getScholarshipSlotState(announcement = {}) {
	const slotManaged = announcement.source === "grantor" || Boolean(announcement.grantorId)
	if (!slotManaged || announcement.applicationEnabled !== true) {
		return { managed: false, configured: false, full: false, low: false, label: "" }
	}
	const slots = normalizeScholarshipSlots(announcement)
	if (!slots.slotsConfigured) {
		return {
			managed: true,
			configured: false,
			full: false,
			low: false,
			label: "Slots not configured",
			...slots,
		}
	}
	const full = slots.remainingSlots === 0
	const low = slots.remainingSlots > 0 && slots.remainingSlots < 10
	return {
		managed: true,
		configured: true,
		full,
		low,
		label: full ? "No slots remaining" : `${slots.remainingSlots} slot${slots.remainingSlots === 1 ? "" : "s"} remaining`,
		...slots,
	}
}
