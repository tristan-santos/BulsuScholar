import { normalizeGrantorAnnouncement, toJsDate } from "./grantorService"
import { toScholarshipProviderType } from "./scholarshipService"

function toAnnouncementPreviewText(raw = {}) {
	return raw.previewText || raw.content || raw.description || ""
}

export function normalizeStudentAnnouncement(raw = {}, id = "", source = "admin") {
	if (source === "grantor") {
		const normalized = normalizeGrantorAnnouncement(raw, id)
		return {
			...normalized,
			source: "grantor",
			sourceLabel:
				normalized.grantorName || normalized.providerLabel || "Grantor Announcement",
			providerType:
				normalized.providerType ||
				toScholarshipProviderType(
					normalized.grantorName || normalized.providerLabel || normalized.title,
				),
			previewText: toAnnouncementPreviewText(normalized),
		}
	}

	return {
		id: raw.id || id,
		title: raw.title || "Announcement",
		description: raw.description || raw.content || "",
		content: raw.content || raw.description || "",
		previewText: toAnnouncementPreviewText(raw),
		type: raw.type || "Update",
		imageUrl: raw.imageUrl || "",
		imageUrls: Array.isArray(raw.imageUrls) ? raw.imageUrls : [],
		startDate: raw.startDate || null,
		endDate: raw.endDate || raw.scheduleEnd || null,
		archived: raw.archived === true,
		status: raw.archived === true ? "Archived" : raw.status || "Published",
		createdAt: raw.createdAt || raw.date || null,
		updatedAt: raw.updatedAt || null,
		source: "admin",
		sourceLabel: "Scholarship Office",
		providerType:
			raw.providerType || toScholarshipProviderType(raw.providerLabel || raw.title || ""),
	}
}

export function sortStudentAnnouncements(rows = []) {
	return [...rows].sort((left, right) => {
		const leftDate =
			toJsDate(left.updatedAt || left.createdAt || left.startDate || left.endDate)?.getTime() || 0
		const rightDate =
			toJsDate(right.updatedAt || right.createdAt || right.startDate || right.endDate)?.getTime() || 0
		return rightDate - leftDate
	})
}

export function isPreviousStudentAnnouncement(item = {}, now = new Date()) {
	if (item.archived === true) return true

	const normalizedStatus = String(item.status || "").toLowerCase()
	if (
		["archived", "closed", "expired", "ended"].some((keyword) =>
			normalizedStatus.includes(keyword),
		)
	) {
		return true
	}

	const endDate = toJsDate(item.endDate)
	return Boolean(endDate && endDate.getTime() < now.getTime())
}
