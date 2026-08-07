export function toRequirementKey(requirement = {}, index = 0) {
	const source =
		requirement.id ||
		requirement.requirementId ||
		requirement.key ||
		requirement.name ||
		requirement.label ||
		`requirement_${index + 1}`
	return String(source)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "") || `requirement_${index + 1}`
}

export function normalizeOtherRequirements(requirements = []) {
	if (!Array.isArray(requirements)) return []
	return requirements
		.map((requirement, index) => {
			const name = String(requirement?.name || requirement?.label || "").trim()
			if (!name) return null
			const uploadCount = Number.parseInt(
				requirement.uploadCount || requirement.uploadsNeeded || requirement.count || 1,
				10,
			)
			return {
				...requirement,
				id: toRequirementKey(requirement, index),
				name,
				fileType: String(requirement.fileType || requirement.type || "PDF").toUpperCase(),
				uploadCount: Number.isFinite(uploadCount) && uploadCount > 0 ? uploadCount : 1,
			}
		})
		.filter(Boolean)
}

export function getOtherRequirementUploadEntry(scholarship = {}, requirement = {}, index = 0) {
	const key = toRequirementKey(requirement, index)
	const uploads = scholarship.otherRequirementUploads || scholarship.otherDocuments || {}
	if (Array.isArray(uploads)) {
		const match = uploads.find((entry) => {
			const entryKey = toRequirementKey(entry, index)
			return entryKey === key || String(entry.name || "").toLowerCase() === String(requirement.name || "").toLowerCase()
		})
		return match || { files: [] }
	}
	return uploads[key] || uploads[requirement.id] || uploads[requirement.name] || { files: [] }
}

export function collectOtherRequirementDocuments(scholarship = {}) {
	const requirements = normalizeOtherRequirements(scholarship.otherRequirements || [])
	return requirements.flatMap((requirement, index) => {
		const uploadEntry = getOtherRequirementUploadEntry(scholarship, requirement, index)
		const files = Array.isArray(uploadEntry.files)
			? uploadEntry.files
			: uploadEntry.url
				? [uploadEntry]
				: []
		return files
			.filter((file) => file?.url)
			.map((file, fileIndex) => ({
				requirementId: requirement.id,
				requirementName: requirement.name,
				label: requirement.name,
				title: requirement.name,
				name: file.name || `${requirement.name} ${fileIndex + 1}`,
				url: file.url,
				type: file.type || requirement.fileType,
				uploadedAt: file.uploadedAt || uploadEntry.uploadedAt || null,
			}))
	})
}
