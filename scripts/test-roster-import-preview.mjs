import assert from "node:assert/strict"
import { getRosterImportMappingIssues } from "../src/utils/rosterImportPreview.js"
assert.match(getRosterImportMappingIssues(["fullName", "course"], "").join(" "), /Year Level/)
assert.deepEqual(getRosterImportMappingIssues(["fullName", "course", "yearLevel"], "Future Leaders"), [])
assert.match(getRosterImportMappingIssues(["studentId", "fullName"], "").join(" "), /scholarship/)
assert.deepEqual(getRosterImportMappingIssues(["studentId", "fullName"], "Future Leaders"), [])
assert.deepEqual(getRosterImportMappingIssues(["studentId", "fname", "lname", "scholarshipTitle"]), [])
assert.match(getRosterImportMappingIssues(["studentId", "fname", "scholarshipTitle"]).join(" "), /Last Name/)
console.log("Roster import preview regression checks passed.")
