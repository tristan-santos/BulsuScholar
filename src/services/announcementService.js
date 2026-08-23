import { isAnnouncementArchived, normalizeGrantorAnnouncement, toJsDate } from "./grantorService"
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

	const archived = isAnnouncementArchived(raw)
	return {
		id: raw.id || id,
		title: raw.title || "Announcement",
		scholarshipTitle: raw.scholarshipTitle || (raw.applicationEnabled === true ? raw.title || "" : ""),
		scholarshipKey: raw.scholarshipKey || "",
		description: raw.description || raw.content || "",
		content: raw.content || raw.description || "",
		previewText: toAnnouncementPreviewText(raw),
		type: raw.type || "Update",
		imageUrl: raw.imageUrl || "",
		imageUrls: Array.isArray(raw.imageUrls) ? raw.imageUrls : [],
		startDate: raw.startDate || null,
		endDate: raw.endDate || raw.scheduleEnd || null,
		applicationEnabled: raw.applicationEnabled === true,
		requiredDocuments: {
			cog: raw.requiredDocuments?.cog === true,
			cor: raw.requiredDocuments?.cor === true,
			applicationForm: raw.requiredDocuments?.applicationForm === true,
		},
		otherRequirements: Array.isArray(raw.otherRequirements)
			? raw.otherRequirements.map((item) => ({
					name: String(item?.name || "").trim(),
					fileType: ["png", "both"].includes(String(item?.fileType || "pdf").toLowerCase())
						? String(item?.fileType || "pdf").toLowerCase()
						: "pdf",
					uploadCount: Math.max(1, Number.parseInt(item?.uploadCount, 10) || 1),
				})).filter((item) => item.name)
			: [],
		minimumGrade:
			raw.minimumGrade !== undefined && raw.minimumGrade !== null && raw.minimumGrade !== ""
				? Number(raw.minimumGrade)
				: raw.minGwa !== undefined && raw.minGwa !== null && raw.minGwa !== ""
					? Number(raw.minGwa)
					: null,
		minGwa:
			raw.minGwa !== undefined && raw.minGwa !== null && raw.minGwa !== ""
				? Number(raw.minGwa)
				: raw.minimumGrade !== undefined && raw.minimumGrade !== null && raw.minimumGrade !== ""
					? Number(raw.minimumGrade)
					: null,
		archived,
		status: archived ? "Archived" : raw.status || "Published",
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
	return isAnnouncementArchived(item, now)
}
