import assert from "node:assert/strict"
import {
	findMatchingPendingInvitation,
	getGrantorRejectionCooldown,
	isManualArchiveForGrantor,
} from "../src/services/grantorReapplicationService.js"

const manualArchive = { archived: true, grantorId: "grantor-a", providerType: "private" }
assert.equal(isManualArchiveForGrantor(manualArchive, { grantorId: "grantor-a", providerType: "private" }), true)
assert.equal(isManualArchiveForGrantor(manualArchive, { grantorId: "grantor-b", providerType: "private" }), false)
assert.equal(isManualArchiveForGrantor({ ...manualArchive, closureReason: "selected_another_scholarship" }, manualArchive), false)
assert.equal(isManualArchiveForGrantor({ ...manualArchive, status: "Withdrawn" }, manualArchive), false)

const student = {
	scholarshipInvitations: [
		{ id: "exact", status: "Pending", grantorId: "grantor-a", announcementId: "offering-a", scholarshipName: "Alpha" },
		{ id: "legacy", status: "Invited", grantorId: "grantor-a", scholarshipName: "Beta" },
	],
}
assert.equal(findMatchingPendingInvitation(student, { grantorId: "grantor-a", announcementId: "offering-a", scholarshipName: "Alpha" })?.id, "exact")
assert.equal(findMatchingPendingInvitation(student, { grantorId: "grantor-a", announcementId: "other", scholarshipName: "Alpha" }), null)
assert.equal(findMatchingPendingInvitation(student, { grantorId: "grantor-a", announcementId: "offering-b", scholarshipName: " beta " })?.id, "legacy")
assert.equal(findMatchingPendingInvitation(student, { grantorId: "grantor-b", announcementId: "offering-a", scholarshipName: "Alpha" }), null)

const rejectedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
const cooldownStudent = { scholarships: [{ status: "Rejected", rejectedAt, grantorId: "grantor-a" }] }
assert.equal(Boolean(getGrantorRejectionCooldown(cooldownStudent, { grantorId: "grantor-a" })?.active), true)
assert.equal(getGrantorRejectionCooldown(cooldownStudent, { grantorId: "grantor-b" }), null)

console.log("grantor reapplication policy tests passed")
