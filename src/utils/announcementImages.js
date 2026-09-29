export const MAX_ANNOUNCEMENT_IMAGES = 5
export const MAX_ANNOUNCEMENT_IMAGE_BYTES = 10 * 1024 * 1024
export const ANNOUNCEMENT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"]

export function addAnnouncementImageFiles(currentFiles = [], selectedFiles = []) {
	const incoming = Array.from(selectedFiles || [])
	if (currentFiles.length + incoming.length > MAX_ANNOUNCEMENT_IMAGES) {
		throw new Error(`Select no more than ${MAX_ANNOUNCEMENT_IMAGES} announcement images.`)
	}
	for (const file of incoming) {
		if (!ANNOUNCEMENT_IMAGE_TYPES.includes(String(file?.type || "").toLowerCase())) {
			throw new Error("Announcement images must be PNG, JPEG, or WebP files.")
		}
		if (Number(file?.size || 0) <= 0 || Number(file.size) > MAX_ANNOUNCEMENT_IMAGE_BYTES) {
			throw new Error("Each announcement image must be no larger than 10 MB.")
		}
	}
	return [...currentFiles, ...incoming]
}

export function getAnnouncementImageUrls(announcement = {}) {
	const objectUrls = Array.isArray(announcement.images)
		? announcement.images.map((image) => image?.url || image?.publicUrl || "")
		: []
	const directUrls = Array.isArray(announcement.imageUrls) ? announcement.imageUrls : []
	return [announcement.imageUrl, ...directUrls, ...objectUrls]
		.map((value) => String(value || "").trim())
		.filter((value, index, rows) => value && rows.indexOf(value) === index)
}
