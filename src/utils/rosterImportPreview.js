export function getRosterImportMappingIssues(mapping = [], scholarshipTitle = "") {
	const issues = []
	if (!mapping.includes("studentId")) {
		if (!mapping.includes("course")) issues.push("Map Course when importing without student numbers.")
		if (!mapping.includes("yearLevel")) issues.push("Map Year Level when importing without student numbers.")
	}
	if (!mapping.includes("fullName") && !(mapping.includes("fname") && mapping.includes("lname"))) issues.push("Map Full Name, or both First Name and Last Name.")
	if (!mapping.includes("scholarshipTitle") && !scholarshipTitle.trim()) issues.push("Map Scholarship Title or select a scholarship for this import.")
	return issues
}

export function summarizeRosterImportPreview(rows = []) {
	const blocked = rows.filter((row) => row.blocking === true).length
	const existing = rows.filter((row) => row.disposition === "already_imported").length
	const ready = rows.length - blocked - existing
	return `${ready} ready, ${existing} already imported, ${blocked} blocked. ${blocked ? "Review the validation result beside each row." : "Review the results before committing."}`
}
