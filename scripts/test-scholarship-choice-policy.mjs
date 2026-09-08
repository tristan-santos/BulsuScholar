import assert from "node:assert/strict"
import { getGrantorApplicationBlock, hasScholarshipCommitment, sameApplicationGrantor, matchesScholarshipApplication } from "../src/services/scholarshipChoiceService.js"

const pending = { applicationNumber: "a1", grantorId: "one", status: "Applied" }
assert.equal(matchesScholarshipApplication({ id: "a1", grantorId: "one", lifecycleVersion: 2 }, { applicationId: "a1", grantorId: "one" }), true)
assert.equal(matchesScholarshipApplication({ id: "a2", applicationNumber: "two", grantorId: "one", providerType: "other" }, { applicationId: "a1", applicationNumber: "one", grantorId: "one", providerType: "other" }), false)
assert.equal(matchesScholarshipApplication({ applicationNumber: "same", grantorId: "one" }, { applicationNumber: "same", grantorId: "two" }), false)
assert.equal(matchesScholarshipApplication({ providerType: "other" }, { providerType: "other" }), false)
const student = { scholarships: [pending] }
assert.equal(hasScholarshipCommitment(student), false)
assert.equal(getGrantorApplicationBlock(student, { grantorId: "two" }), "")
assert.match(getGrantorApplicationBlock(student, { grantorId: " ONE " }), /already have an active application/)
assert.equal(sameApplicationGrantor({ grantorId: "one", grantorName: "Same Name" }, { grantorId: "two", grantorName: "Same Name" }), false)
assert.equal(sameApplicationGrantor({ grantorName: "Legacy Name" }, { grantorName: " legacy name " }), true)
assert.equal(hasScholarshipCommitment({ scholarships: [{ ...pending, isLocked: true }] }), true)
assert.equal(hasScholarshipCommitment({ scholarshipCommitment: { applicationId: "a1" }, scholarships: [] }), true)
const withdrawn = { scholarships: [], scholarshipApplicationHistory: [{ ...pending, status: "Archived", closureReason: "student_withdrawal", cooldownUntil: new Date(Date.now() + 86400000).toISOString() }] }
assert.match(getGrantorApplicationBlock(withdrawn, { grantorId: "one" }), /24 hours/)
assert.equal(getGrantorApplicationBlock(withdrawn, { grantorId: "two" }), "")
assert.equal(getGrantorApplicationBlock({ scholarships: [], scholarshipApplicationHistory: [{ ...pending, status: "Archived", closureReason: "selected_another_scholarship" }] }, { grantorId: "one" }), "")
console.log("PASS: commitment, one application per grantor, stable owner identity, withdrawal cooldown, automatic closure")
