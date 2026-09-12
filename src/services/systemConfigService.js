export function getCachedPublicConfiguration() {
	try {
		return JSON.parse(localStorage.getItem("bulsuscholar_public_config") || "{}")
	} catch {
		return {}
	}
}

export function getConfiguredSemesterTag() {
	const cycle = getCachedPublicConfiguration().academicCycle || {}
	if (cycle.semesterTag) return String(cycle.semesterTag)
	if (cycle.academicYear && cycle.semester) return `${cycle.academicYear}-${cycle.semester}`
	return ""
}
