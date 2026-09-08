import { supabase } from "./supabaseClient"
import { adminReviewWorkflow, updateGrantorArchiveStateWorkflow } from "./workflowService"

function operationFailure(operation, detail) {
	return {
		step: operation.step,
		...(operation.announcementId ? { announcementId: operation.announcementId } : {}),
		detail,
	}
}

async function runCompatibilityArchiveState(payload = {}) {
	if (payload.actorType !== "admin") throw new Error("admin_archive_fallback_not_allowed")
	const grantorIds = [...new Set((payload.grantorIds || []).map((id) => String(id || "").trim()).filter(Boolean))]
	if (grantorIds.length === 0) throw new Error("missing_grantor_ids")
	const archived = payload.archived === true
	const now = new Date().toISOString()
	const failures = []
	const results = []
	let announcementCount = 0
	let invitationCount = 0
	let notificationCount = 0

	for (const grantorId of grantorIds) {
		const accountPatch = archived
			? { archived: true, archivedAt: now, status: "Archived", updatedAt: now }
			: { ...(payload.restoreData || {}), archived: false, archivedAt: null, status: "Active", updatedAt: now }
		const portalPatch = archived
			? accountPatch
			: { archived: false, archivedAt: null, status: "Active", updatedAt: now }
		const operations = [
			{ step: "provider", table: "providers", id: grantorId, data: accountPatch },
			{ step: "portal", table: "grantor_portals", id: grantorId, data: portalPatch },
		]
		const studentNotifications = []
		const grantorFailures = []
		let archivedAnnouncements = 0
		let cancelledInvitations = 0
		let sentNotifications = 0

		if (archived) {
			const { data: announcements, error } = await supabase
				.from("grantor_portal_announcements")
				.select("id")
				.eq("parent_id", grantorId)
			if (error) {
				grantorFailures.push({ step: "announcement_lookup", detail: error.message })
			} else {
				for (const announcement of announcements || []) {
					operations.push({
						step: "announcement_archive",
						announcementId: announcement.id,
						table: "grantor_portal_announcements",
						id: announcement.id,
						data: {
							archived: true,
							status: "Archived",
							grantorAccountArchived: true,
							hiddenFromStudents: true,
							archivedAt: now,
							archivedBy: payload.actorId || "admin",
							archiveSource: "grantor_account",
							archivedByAccountAction: true,
							updatedAt: now,
						},
					})
				}
			}

			const [{ data: studentRows, error: studentError }, { data: scholarRows, error: scholarError }] = await Promise.all([
				supabase.from("students").select("id,data"),
				supabase.from("grantor_portal_scholars").select("id,parent_id,data").eq("parent_id", grantorId),
			])
			if (studentError) {
				grantorFailures.push({ step: "invitation_lookup", detail: studentError.message })
			} else {
				for (const row of studentRows || []) {
					const invitations = Array.isArray(row.data?.scholarshipInvitations) ? row.data.scholarshipInvitations : []
					const cancelledIds = invitations
						.filter((invitation) => String(invitation?.grantorId || invitation?.providerId || "").trim() === grantorId && ["pending", "invited"].includes(String(invitation?.status || "pending").toLowerCase()))
						.map((invitation) => String(invitation.id || "legacy"))
					if (cancelledIds.length === 0) continue
					operations.push({
						step: "invitation_cancel",
						table: "students",
						id: row.id,
						data: {
							scholarshipInvitations: invitations.map((invitation) =>
								String(invitation?.grantorId || invitation?.providerId || "").trim() === grantorId && ["pending", "invited"].includes(String(invitation?.status || "pending").toLowerCase())
									? { ...invitation, status: "Cancelled", cancelledAt: now, cancellationReason: "grantor_account_archived", cancelledBy: payload.actorId || "admin", updatedAt: now }
									: invitation),
							updatedAt: now,
						},
						cancelledCount: cancelledIds.length,
					})
					studentNotifications.push({
						target: "student",
						data: {
							id: `grantor_archive_cancel_${grantorId}_${row.id}`,
							studentId: row.id,
							source: "personal",
							type: "scholarship_invitation_cancelled",
							title: "Scholarship Invitation Cancelled",
							message: "A scholarship invitation was cancelled because the grantor account was archived. Restoring the account will not restore this invitation.",
							grantorId,
							reason: "grantor_account_archived",
							route: "/student-dashboard/scholarships",
							read: false,
							createdAt: now,
							updatedAt: now,
						},
					})
				}
			}
			if (scholarError) {
				grantorFailures.push({ step: "invitation_roster_lookup", detail: scholarError.message })
			} else {
				for (const row of scholarRows || []) {
					if (row.data?.unarchiveInvitationPending !== true) continue
					operations.push({
						step: "invitation_roster_cancel",
						table: "grantor_portal_scholars",
						id: row.id,
						data: {
							archived: true,
							status: "Archived",
							unarchiveInvitationPending: false,
							invitationStatus: "Cancelled",
							invitationCancelledAt: now,
							invitationCancellationReason: "grantor_account_archived",
							updatedAt: now,
						},
					})
				}
			}
		}

		try {
			const workflowResult = await adminReviewWorkflow({
				actorId: payload.actorId,
				actorType: "admin",
				updates: operations.map(({ table, id, data }) => ({ table, id, data })),
				notifications: studentNotifications,
			})
			const operationResults = Array.isArray(workflowResult.results) ? workflowResult.results : []
			operations.forEach((operation, index) => {
				const result = operationResults[index]
				if (!result?.ok) {
					grantorFailures.push(operationFailure(operation, result || { reason: "missing_operation_result" }))
				} else if (operation.step === "announcement_archive") {
					announcementCount += 1
					archivedAnnouncements += 1
				} else if (operation.step === "invitation_cancel") {
					invitationCount += operation.cancelledCount || 0
					cancelledInvitations += operation.cancelledCount || 0
				}
			})
			;(workflowResult.notifications || []).forEach((result) => {
				if (result?.ok) {
					notificationCount += 1
					sentNotifications += 1
				} else {
					grantorFailures.push({ step: "invitation_cancel_notification", detail: result })
				}
			})
		} catch (error) {
			const operationResults = Array.isArray(error?.data?.results) ? error.data.results : []
			if (operationResults.length > 0) {
				operations.forEach((operation, index) => {
					const result = operationResults[index]
					if (!result?.ok) {
						grantorFailures.push(operationFailure(operation, result || { reason: "missing_operation_result" }))
					} else if (operation.step === "announcement_archive") {
						announcementCount += 1
						archivedAnnouncements += 1
					} else if (operation.step === "invitation_cancel") {
						invitationCount += operation.cancelledCount || 0
						cancelledInvitations += operation.cancelledCount || 0
					}
				})
				;(error?.data?.notifications || []).forEach((result) => {
					if (result?.ok) {
						notificationCount += 1
						sentNotifications += 1
					} else {
						grantorFailures.push({ step: "invitation_cancel_notification", detail: result })
					}
				})
			} else {
				grantorFailures.push({
					step: "compatibility_workflow",
					detail: error?.data || error?.message || String(error),
				})
			}
		}

		results.push({
			grantorId,
			archived,
			announcementCount: archivedAnnouncements,
			invitationCount: cancelledInvitations,
			notificationCount: sentNotifications,
			ok: grantorFailures.length === 0,
			failures: grantorFailures,
		})
		failures.push(...grantorFailures.map((failure) => ({ grantorId, ...failure })))
	}

	return {
		ok: failures.length === 0,
		partial: failures.length > 0,
		grantorCount: grantorIds.length,
		announcementCount,
		invitationCount,
		notificationCount,
		results,
		failures,
		compatibilityFallback: true,
	}
}

export async function updateGrantorArchiveStateWithFallback(payload = {}) {
	try {
		return await updateGrantorArchiveStateWorkflow(payload)
	} catch (error) {
		if (![404, 405].includes(Number(error?.status))) throw error
		return runCompatibilityArchiveState(payload)
	}
}
