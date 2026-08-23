import { db, serverTimestamp, upsertStudent } from "./supabaseDataService"
import { findMatchingGrantorScholars } from "./grantorService"
import {
	buildScholarshipRecord,
	getCurrentSemesterTag,
	getDocumentUrlsForStudent,
	normalizeScholarshipList,
} from "./scholarshipService"
import { materialRequestWorkflow } from "./workflowService"

export function buildMatchedGrantorScholarships(matches = [], student = {}, studentId = "") {
	const semesterTag = getCurrentSemesterTag()
	const hasMultipleMatches = matches.length >= 2
	return matches.map((match) => {
		const nextRecord = buildScholarshipRecord({
			name: match.scholarshipName || match.scholarshipTitle || match.grantorName || "Scholarship",
			provider: match.grantorName || match.scholarshipName || match.scholarshipTitle || "Grantor",
			studentId,
			type: "Scholarship",
			mode: "applied",
			documentUrls: getDocumentUrlsForStudent(student),
			semesterTag,
		})

		return {
			...nextRecord,
			name: match.scholarshipName || match.scholarshipTitle || match.grantorName || nextRecord.name,
			provider: match.grantorName || match.scholarshipName || match.scholarshipTitle || nextRecord.provider,
			providerType: match.providerType || nextRecord.providerType,
			status: hasMultipleMatches ? "Pending Selection" : "Matched",
			adminBlocked: hasMultipleMatches,
			adminBlockedAt: hasMultipleMatches ? new Date().toISOString() : null,
			matchSource: "grantor_roster",
			matchReason: match.matchReason || "",
			matchedGrantorId: match.grantorId || "",
			matchedGrantorName: match.grantorName || "",
			matchedScholarId: match.id || "",
			documentRequirementLabel: "Requires COR and ROG",
		}
	})
}

export function buildGrantorMatchMetadata(matches = []) {
	return matches.map((match) => ({
		id: match.id || "",
		grantorId: match.grantorId || "",
		grantorName: match.grantorName || "",
		providerType: match.providerType || "",
		scholarshipName: match.scholarshipName || match.scholarshipTitle || match.grantorName || "Scholarship",
		matchReason: match.matchReason || "",
		documentRequirementLabel: "Requires COR and ROG",
	}))
}

export async function syncStudentGrantorRosterMatches(student = {}, studentId = "") {
	const normalizedExisting = normalizeScholarshipList(student?.scholarships || [])
	if (!studentId || normalizedExisting.length > 0) {
		return { synced: false, matches: [], scholarships: normalizedExisting }
	}

	const matches = await findMatchingGrantorScholars(db, {
		...student,
		id: studentId,
		studentId,
		studentnumber: student.studentnumber || studentId,
	})
	if (matches.length === 0) {
		return { synced: false, matches, scholarships: normalizedExisting }
	}

	const hasMultipleMatches = matches.length >= 2
	const matchedScholarships = hasMultipleMatches ? buildMatchedGrantorScholarships(matches, student, studentId) : []
	const studentUpdate = {
		scholarships: matchedScholarships,
		grantorMatches: buildGrantorMatchMetadata(matches),
		scholarshipConflictWarning: hasMultipleMatches,
		scholarshipConflictMessage: hasMultipleMatches
			? "Multiple grantor matches were found based on your grantor roster records. Choose one matched grantor first before requesting scholarship materials."
			: "",
		scholarshipRestrictionReason: hasMultipleMatches ? "multiple_scholarships" : null,
		...(hasMultipleMatches
			? {
					restrictions: {
						accountAccess: false,
						scholarshipEligibility: true,
						complianceHold: false,
					},
				}
			: {}),
		updatedAt: serverTimestamp(),
	}

	try {
		await materialRequestWorkflow({
			updates: [
				{
					table: "students",
					id: studentId,
					data: studentUpdate,
				},
			],
		})
	} catch (error) {
		console.warn("Python roster-match sync failed. Falling back to client student update.", error)
		await upsertStudent(studentId, studentUpdate, { merge: true })
	}

	return { synced: true, matches, scholarships: matchedScholarships }
}
