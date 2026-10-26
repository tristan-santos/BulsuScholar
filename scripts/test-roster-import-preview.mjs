import assert from "node:assert/strict"
import { getRosterImportMappingIssues, summarizeRosterImportPreview } from "../src/utils/rosterImportPreview.js"

const missingIds = Array.from({ length: 43 }, () => ({
	disposition: "invalid_data", blocking: true,
	reason: "Missing required fields: Student ID, scholarship title.",
}))
assert.equal(summarizeRosterImportPreview(missingIds), "0 ready, 0 already imported, 43 blocked. Review the validation result beside each row.")
assert.doesNotMatch(summarizeRosterImportPreview(missingIds), /duplicate|cross-grantor/)
assert.match(getRosterImportMappingIssues(["fullName", "course"], "").join(" "), /Year Level/)
assert.deepEqual(getRosterImportMappingIssues(["fullName", "course", "yearLevel"], "Future Leaders"), [])
assert.match(getRosterImportMappingIssues(["studentId", "fullName"], "").join(" "), /scholarship/)
assert.deepEqual(getRosterImportMappingIssues(["studentId", "fullName"], "Future Leaders"), [])
assert.deepEqual(getRosterImportMappingIssues(["studentId", "fname", "lname", "scholarshipTitle"]), [])
assert.match(getRosterImportMappingIssues(["studentId", "fname", "scholarshipTitle"]).join(" "), /Last Name/)
assert.equal(summarizeRosterImportPreview([
	{ disposition: "new_assignment", blocking: false },
	{ disposition: "ready_for_future_account", blocking: false },
	{ disposition: "convert_existing", blocking: false },
	{ disposition: "already_imported", blocking: false },
	{ disposition: "duplicate_import_row", blocking: true },
	{ disposition: "existing_commitment_conflict", blocking: true },
]), "3 ready, 1 already imported, 2 blocked. Review the validation result beside each row.")
console.log("Roster import preview regression checks passed.")
