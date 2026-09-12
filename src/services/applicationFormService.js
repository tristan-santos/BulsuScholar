import {
	downloadStorageObject,
	triggerBlobDownload,
	validatePdfBlob,
} from "./supabaseStorageService"

const DEFAULT_APPLICATION_FORM_TEMPLATE_URL = "/Templates/AplicationForm_Format.pdf"
const STUDENT_PROFILE_TEMPLATE_URL = "/Templates/STUDENT PROFILE_APPLICATION-FORMAT.pdf"

function hasStoredFileReference(file = null) {
	return Boolean(file && (file.url || file.publicUrl || file.path || file.publicId || file.storagePath))
}

async function downloadStaticPdfTemplate(url, fileName) {
	const response = await fetch(url)
	if (!response.ok) throw new Error(`template_load_failed_${response.status}`)
	const blob = await validatePdfBlob(await response.blob())
	triggerBlobDownload(blob, fileName)
	return { blob, fileName, source: "template" }
}

export function downloadStudentProfileTemplate() {
	return downloadStaticPdfTemplate(
		STUDENT_PROFILE_TEMPLATE_URL,
		"Student_Application_Profile_Template.pdf",
	)
}

export function getApplicationFormSource(scholarship = {}, materialRequest = null) {
	const requestType = String(materialRequest?.applicationFormType || "").trim().toLowerCase()
	const requestCustomForm = materialRequest?.customApplicationForm || materialRequest?.customApplicationProfile || null
	const legacyCustomForm = scholarship?.customApplicationForm || scholarship?.customApplicationProfile || null

	if (requestType === "custom") {
		return {
			type: "custom",
			label: "Custom Application Form",
			file: requestCustomForm,
			available: hasStoredFileReference(requestCustomForm),
		}
	}
	if (requestType === "default") {
		return { type: "default", label: "Default Application Form", file: null, available: true }
	}

	const customForm = hasStoredFileReference(requestCustomForm) ? requestCustomForm : legacyCustomForm
	return hasStoredFileReference(customForm)
		? { type: "custom", label: "Custom Application Form", file: customForm, available: true }
		: { type: "default", label: "Default Application Form", file: null, available: true }
}

export async function downloadScholarshipApplicationForm({ scholarship = {}, materialRequest = null } = {}) {
	const source = getApplicationFormSource(scholarship, materialRequest)
	if (source.type === "custom") {
		if (!source.available) throw new Error("custom_application_form_missing")
		const result = await downloadStorageObject(source.file, {
			fileName: source.file?.name || "Custom_Application_Form.pdf",
			validatePdf: true,
		})
		return { ...result, source: "grantor-custom", sourceLabel: source.label }
	}

	return downloadStaticPdfTemplate(
		DEFAULT_APPLICATION_FORM_TEMPLATE_URL,
		"Scholarship_Application_Form.pdf",
	)
}
