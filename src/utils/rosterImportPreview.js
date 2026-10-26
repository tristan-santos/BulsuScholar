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
