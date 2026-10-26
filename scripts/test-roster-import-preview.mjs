import assert from "node:assert/strict"
import { getManualScholarIssues, getRosterImportMappingIssues } from "../src/utils/rosterImportPreview.js"

const manual = { fname: "Dan Nicole", mname: "S.", lname: "Besinal", course: "Bachelor in Industrial Technology", yearLevel: "4", scholarshipTitle: "Future Leaders" }
assert.deepEqual(getManualScholarIssues(manual), [])
assert.deepEqual(getManualScholarIssues({ ...manual, studentId: "", cpNumber: "" }), [])
assert.deepEqual(getManualScholarIssues({ ...manual, cpNumber: "09171234567" }), [])
assert.match(getManualScholarIssues({ ...manual, cpNumber: "123" }).join(" "), /Contact number/)
assert.match(getManualScholarIssues({ ...manual, lname: "" }).join(" "), /last name/)
assert.match(getManualScholarIssues({ ...manual, yearLevel: "" }).join(" "), /year level/)
assert.match(getManualScholarIssues({ ...manual, scholarshipTitle: "" }).join(" "), /scholarship title/)
assert.match(getRosterImportMappingIssues(["fullName", "course"], "").join(" "), /Year Level/)
assert.deepEqual(getRosterImportMappingIssues(["fullName", "course", "yearLevel"], "Future Leaders"), [])
assert.match(getRosterImportMappingIssues(["studentId", "fullName"], "").join(" "), /scholarship/)
assert.deepEqual(getRosterImportMappingIssues(["studentId", "fullName"], "Future Leaders"), [])
assert.deepEqual(getRosterImportMappingIssues(["studentId", "fname", "lname", "scholarshipTitle"]), [])
assert.match(getRosterImportMappingIssues(["studentId", "fname", "scholarshipTitle"]).join(" "), /Last Name/)
console.log("Roster import preview regression checks passed.")
