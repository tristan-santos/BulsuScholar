const stage = (title, detail) => ({ title, detail })

function normalizeMessage(message, fallback) {
	if (!message) return fallback
	if (typeof message === "string") return stage(message, "")
	return message
}

export const OPERATION_PROFILES = Object.freeze({
	"generic.background": {
		kind: "background",
		delayMs: 1200,
		showSuccess: false,
		loading: [
			stage("Loading the latest information...", "Keeping this page up to date."),
			stage("Still loading...", "The service is taking a little longer than usual."),
			stage("Almost there...", "Finishing the latest data refresh."),
		],
	},
	"generic.foreground": {
		kind: "foreground",
		delayMs: 250,
		loading: [
			stage("Processing your request...", "Please keep this page open."),
			stage("Working on it...", "Your request is being handled securely."),
			stage("Almost there...", "Finishing the last checks."),
		],
		success: stage("Request completed", "Your changes are ready."),
		error: stage("Unable to complete the request", "Review the message on the page and try again."),
	},
	"auth.login": {
		kind: "foreground",
		loading: [
			stage("Verifying your credentials...", "Checking your account securely."),
			stage("Preparing your dashboard...", "Loading your access and workspace."),
			stage("Almost there...", "Opening your BulsuScholar workspace."),
		],
		success: stage("Welcome back!", "Your dashboard is ready."),
		error: stage("Sign-in unsuccessful", "Check your credentials or follow the guidance on the page."),
	},
	"auth.signup": {
		kind: "foreground",
		loading: [
			stage("Creating your secure account...", "Validating your student information."),
			stage("Preparing email verification...", "Securing your account documents and access."),
			stage("Almost there...", "Finishing your account registration."),
		],
		success: stage("Check your inbox", "Use the verification email to activate your account."),
		error: stage("Account creation was not completed", "Review the highlighted information and try again."),
	},
	"auth.confirm": {
		kind: "foreground",
		loading: [
			stage("Verifying your confirmation link...", "Confirming that this secure link is valid."),
			stage("Activating your account...", "Connecting your verified email to BulsuScholar."),
			stage("Almost there...", "Preparing your confirmed account."),
		],
		success: stage("Account verified", "Welcome to BulsuScholar."),
		error: stage("Email confirmation was unsuccessful", "Use the latest email link or request assistance."),
	},
	"auth.password-request": {
		kind: "foreground",
		loading: [
			stage("Finding your account...", "Checking the information you provided."),
			stage("Preparing a secure reset link...", "Connecting to the email delivery service."),
			stage("Almost there...", "Finishing your password request."),
		],
		success: stage("Check your inbox", "Your password-reset instructions are on the way."),
		error: stage("Reset request was not completed", "Review the message on the page and try again."),
	},
	"auth.password-update": {
		kind: "foreground",
		loading: [
			stage("Updating your password...", "Applying your new secure credentials."),
			stage("Securing your account...", "Refreshing your authentication session."),
			stage("Almost there...", "Finishing the password update."),
		],
		success: stage("Password updated", "You can now sign in with your new password."),
		error: stage("Password update was unsuccessful", "Review the requirements and try again."),
	},
	"document.upload": {
		kind: "foreground",
		loading: [
			stage("Uploading your document...", "Keeping the file connected to the correct record."),
			stage("Securing your file...", "Updating your document information."),
			stage("Almost there...", "Finishing the document update."),
		],
		success: stage("Upload complete", "Your document is now available for review."),
		error: stage("Document upload failed", "Keep the file selected and try again."),
	},
	"document.download": {
		kind: "foreground",
		loading: [
			stage("Preparing your file...", "Locating the correct secured document."),
			stage("Starting your secure download...", "Validating the file before download."),
			stage("Almost there...", "Finishing your document download."),
		],
		success: stage("Your file is ready", "The download has started."),
		error: stage("File download failed", "The document could not be retrieved right now."),
	},
	"report.generate": {
		kind: "foreground",
		loading: [
			stage("Preparing your report...", "Collecting the selected records."),
			stage("Generating the document...", "Formatting the complete report preview."),
			stage("Almost there...", "Finishing the report pages."),
		],
		success: stage("Report ready", "Your preview and download are prepared."),
		error: stage("Report generation failed", "Retry after checking the selected report data."),
	},
	"application.submit": {
		kind: "foreground",
		loading: [
			stage("Checking scholarship availability...", "Revalidating eligibility and remaining slots."),
			stage("Reserving your application slot...", "Creating your application safely."),
			stage("Almost there...", "Finalizing your scholarship application."),
		],
		success: stage("Application submitted", "You can now follow its progress in Scholarships."),
		error: stage("Application was not submitted", "Your slot was not consumed. Review the message and retry."),
	},
	"scholarship.choose": {
		kind: "foreground",
		loading: [
			stage("Confirming your scholarship choice...", "Revalidating your selected application."),
			stage("Preparing your material request...", "Closing competing applications safely."),
			stage("Almost there...", "Finalizing your scholarship commitment."),
		],
		success: stage("Scholarship selected", "Your material request is ready for review."),
		error: stage("Scholarship selection failed", "No partial commitment was created."),
	},
	"application.withdraw": {
		kind: "foreground",
		loading: [
			stage("Withdrawing your application...", "Confirming the application and reserved slot."),
			stage("Returning the scholarship slot...", "Preserving your application history."),
			stage("Almost there...", "Finishing the withdrawal."),
		],
		success: stage("Application withdrawn", "The scholarship slot has been returned."),
		error: stage("Withdrawal failed", "Your application remains unchanged."),
	},
	"materials.request": {
		kind: "foreground",
		loading: [
			stage("Validating your request...", "Checking the application and required materials."),
			stage("Requesting your materials...", "Creating one complete material package."),
			stage("Almost there...", "Finishing the request for administrator review."),
		],
		success: stage("Materials requested", "You will be notified after administrator review."),
		error: stage("Material request failed", "No partial request was saved."),
	},
	"announcement.publish": {
		kind: "foreground",
		loading: [
			stage("Publishing your announcement...", "Saving the scholarship information."),
			stage("Notifying eligible students...", "Delivering publication notices safely."),
			stage("Almost there...", "Finishing the announcement publication."),
		],
		success: stage("Announcement published", "The announcement is now available to eligible students."),
		error: stage("Announcement was not published", "Review the message and retry without creating a duplicate."),
	},
	"invitation.send": {
		kind: "foreground",
		loading: [
			stage("Checking invitation eligibility...", "Validating the student and scholarship."),
			stage("Sending the invitation...", "Creating the student inbox notification."),
			stage("Almost there...", "Finishing the invitation."),
		],
		success: stage("Invitation sent", "The student can now respond from their portal."),
		error: stage("Invitation was not sent", "The selected student remains available for retry."),
	},
	"record.save": {
		kind: "foreground",
		loading: [
			stage("Saving your changes...", "Validating the updated information."),
			stage("Updating the record...", "Keeping related records synchronized."),
			stage("Almost there...", "Finishing the update."),
		],
		success: stage("Changes saved", "The latest information is now available."),
		error: stage("Changes were not saved", "The previous information remains in place."),
	},
	"record.approve": {
		kind: "foreground",
		loading: [
			stage("Reviewing the approval...", "Checking the latest authoritative record."),
			stage("Applying the decision...", "Updating the workflow safely."),
			stage("Almost there...", "Finishing the approval."),
		],
		success: stage("Approval recorded", "The workflow has been updated."),
		error: stage("Approval was not recorded", "The previous workflow state remains unchanged."),
	},
	"record.reject": {
		kind: "foreground",
		loading: [
			stage("Reviewing the rejection...", "Checking the latest authoritative record."),
			stage("Applying the decision...", "Preserving the record history."),
			stage("Almost there...", "Finishing the rejection."),
		],
		success: stage("Rejection recorded", "The affected user will receive the updated status."),
		error: stage("Rejection was not recorded", "The previous status remains unchanged."),
	},
	"record.archive": {
		kind: "foreground",
		loading: [
			stage("Archiving the record...", "Checking dependent workflows and invitations."),
			stage("Preserving historical data...", "Applying archive restrictions safely."),
			stage("Almost there...", "Finishing the archive process."),
		],
		success: stage("Record archived", "Historical information remains available."),
		error: stage("Archive was not completed", "The record remains in its previous state."),
	},
	"record.restore": {
		kind: "foreground",
		loading: [
			stage("Restoring the account...", "Checking the archived record and current restrictions."),
			stage("Reactivating portal access...", "Keeping historical announcements and invitations inactive."),
			stage("Almost there...", "Finishing the account restoration."),
		],
		success: stage("Account restored", "Portal access is available again."),
		error: stage("Restoration was not completed", "The account remains archived."),
	},
	"record.delete": {
		kind: "foreground",
		loading: [
			stage("Removing the selected record...", "Confirming the requested deletion."),
			stage("Updating related information...", "Finishing the removal safely."),
			stage("Almost there...", "Completing the cleanup."),
		],
		success: stage("Record removed", "The requested item is no longer active."),
		error: stage("Record was not removed", "No deletion was completed."),
	},
	"workflow.complete": {
		kind: "foreground",
		loading: [
			stage("Completing the current stage...", "Checking the latest scholarship progress."),
			stage("Advancing the workflow...", "Synchronizing student, grantor, and administrator records."),
			stage("Almost there...", "Finishing the tracking update."),
		],
		success: stage("Stage complete", "Scholarship tracking has advanced."),
		error: stage("Stage could not be completed", "The tracking position remains unchanged."),
	},
	"deployment.manage": {
		kind: "foreground",
		loading: [
			stage("Sending the deployment request...", "Connecting to the configured hosting provider."),
			stage("Deployment operation accepted...", "Waiting for the provider response."),
			stage("Almost there...", "Finishing the infrastructure request."),
		],
		success: stage("Deployment request accepted", "Monitor Health for the latest status."),
		error: stage("Deployment request failed", "No provider operation was confirmed."),
	},
})

const BACKGROUND_PATH = /(?:\/config\/public|\/health(?:$|\/)|\/deployment\/health|\/notifications\/(?:admin|grantor|student)\/list|\/scholarships\/recommend|\/matching|\/duplicates|\/overview|\/metrics|\/presets|\/data\/|\/records(?:\?|$))/i

function requestDetails(input, init = {}) {
	const url = String(typeof input === "string" ? input : input?.url || "")
	const method = String(init?.method || input?.method || "GET").toUpperCase()
	let payload = {}
	if (typeof init?.body === "string" && init.body.startsWith("{")) {
		try { payload = JSON.parse(init.body) } catch { payload = {} }
	}
	return { url, method, payload }
}

export function inferOperationKey(input, init = {}) {
	const { url, method, payload } = requestDetails(input, init)
	const lowerUrl = url.toLowerCase()

	if (/\/auth\/v1\/token/.test(lowerUrl)) {
		return lowerUrl.includes("grant_type=password") ? "auth.login" : "generic.background"
	}
	if (/\/auth\/v1\/signup/.test(lowerUrl)) return "auth.signup"
	if (/\/auth\/v1\/verify/.test(lowerUrl) || /\/workflows\/student\/email-confirmed/.test(lowerUrl)) return "auth.confirm"
	if (/\/auth\/v1\/recover/.test(lowerUrl)) return "auth.password-request"
	if (/\/auth\/v1\/user/.test(lowerUrl) && ["PUT", "PATCH"].includes(method)) return "auth.password-update"
	if (/\/auth\/v1\/logout/.test(lowerUrl)) return "generic.background"
	if (/\/root\/auth\/(?:login|verify-code)/.test(lowerUrl)) return "auth.login"
	if (/\/root\/auth\/logout/.test(lowerUrl)) return "generic.background"

	if (/\/storage\/v1\/object/.test(lowerUrl)) {
		return ["POST", "PUT", "PATCH"].includes(method) ? "document.upload" : "document.download"
	}
	if (/\/reports\/pdf/.test(lowerUrl)) return "report.generate"
	if (/\/root\/files\/download/.test(lowerUrl)) return "document.download"
	if (/\/root\/branding\/assets/.test(lowerUrl)) return "document.upload"
	if (/\/admin\/(?:match|check-student-duplicates)/.test(lowerUrl)) return "generic.background"
	if (/\/grantor\/(?:evaluate|find)-scholar-duplicate/.test(lowerUrl)) return "generic.background"
	if (/\/workflows\/student\/signup\/finalize/.test(lowerUrl)) return "auth.signup"
	if (/\/workflows\/student\/signup\/validate/.test(lowerUrl)) return "generic.background"
	if (/\/workflows\/scholarship\/apply/.test(lowerUrl)) return "application.submit"
	if (/\/workflows\/scholarship\/choose/.test(lowerUrl)) return "scholarship.choose"
	if (/\/workflows\/scholarship\/withdraw/.test(lowerUrl)) return "application.withdraw"
	if (/\/workflows\/materials/.test(lowerUrl)) return "materials.request"
	if (/\/workflows\/grantor\/announcements\/(?:create|republish)/.test(lowerUrl)) return "announcement.publish"
	if (/\/workflows\/grantor\/scholars\/invite-back/.test(lowerUrl)) return "invitation.send"
	if (/invitation\/reject|\/reject(?:\/|$)/.test(lowerUrl)) return "record.reject"
	if (/archive-state/.test(lowerUrl)) return payload?.archived === false ? "record.restore" : "record.archive"
	if (/\/archive(?:\/|$)/.test(lowerUrl)) return "record.archive"
	if (/\/delete(?:\/|$)/.test(lowerUrl)) return "record.delete"
	if (/confirm-admin-decision|\/complete(?:\/|$)/.test(lowerUrl)) return "workflow.complete"
	if (/\/workflows\/admin\/review/.test(lowerUrl)) {
		return String(payload?.decision || payload?.status || "").toLowerCase().includes("reject")
			? "record.reject"
			: "record.approve"
	}
	if (/\/root\/integrations\//.test(lowerUrl)) return "deployment.manage"
	if (BACKGROUND_PATH.test(lowerUrl)) return "generic.background"
	if (/\/rest\/v1\//.test(lowerUrl)) return "generic.background"
	if (method === "GET" || method === "HEAD" || method === "OPTIONS") return "generic.background"
	return "generic.foreground"
}

export function resolveOperationProfile(metadata, input, init = {}) {
	const explicit = typeof metadata === "string" ? { key: metadata } : metadata || {}
	const key = explicit.key || explicit.category || (input == null ? "generic.foreground" : inferOperationKey(input, init))
	const fallbackKey = explicit.kind === "background" ? "generic.background" : "generic.foreground"
	const base = OPERATION_PROFILES[key] || OPERATION_PROFILES[fallbackKey]
	const loadingSource = explicit.stagedMessages || explicit.loading || base.loading
	const loading = Array.isArray(loadingSource)
		? loadingSource.map((message) => normalizeMessage(message, base.loading?.[0]))
		: base.loading
	return {
		...base,
		...explicit,
		key,
		category: explicit.category || key,
		kind: explicit.kind || base.kind || "foreground",
		loading,
		success: normalizeMessage(explicit.successText, explicit.success || base.success),
		error: normalizeMessage(explicit.errorText, explicit.error || base.error),
		showSuccess: explicit.showCompletion ?? explicit.showSuccess ?? base.showSuccess,
		delayMs: Number.isFinite(Number(explicit.delayMs))
			? Math.max(0, Number(explicit.delayMs))
			: base.delayMs ?? (base.kind === "background" ? 1200 : 250),
		stageTimes: explicit.stageTimes || base.stageTimes || [0, 1800, 4500],
		priority: Number.isFinite(Number(explicit.priority))
			? Number(explicit.priority)
			: (explicit.key || typeof metadata === "string" ? 100 : base.kind === "foreground" ? 50 : 10),
	}
}
