import { CONTACT_NUMBER_RULE_MESSAGE, isValidContactNumber } from "./contactNumber.js"

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

export function getManualScholarIssues(form = {}) {
	const issues = []
	if (!String(form.fname || "").trim() || !String(form.lname || "").trim()) issues.push("Enter the student's first and last name.")
	if (!String(form.course || "").trim() || !String(form.yearLevel || "").trim()) issues.push("Select the student's course and year level.")
	if (!String(form.scholarshipTitle || "").trim()) issues.push("Select the scholarship title for this scholar.")
	if (String(form.cpNumber || "").trim() && !isValidContactNumber(form.cpNumber)) issues.push(CONTACT_NUMBER_RULE_MESSAGE)
	return issues
}
