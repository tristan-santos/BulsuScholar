import {
	collection,
	collectionGroup,
	getDocs,
	serverTimestamp,
} from "./supabaseDataService"
import { db } from "./supabaseDataService"
import {
	buildScholarshipRecord,
	getCurrentAcademicYear,
	getCurrentSemesterTag,
	getDocumentUrlsForStudent,
	toScholarshipProviderType,
} from "./scholarshipService"
import {
	GRANTOR_PORTAL_COLLECTION,
	GRANTOR_SUBCOLLECTIONS,
	isAnnouncementArchived,
	normalizeGrantorAnnouncement,
	toGrantorDisplayName,
} from "./grantorService"
import { recommendScholarshipsWorkflow } from "./workflowService"
import { getCachedReferenceData } from "./referenceDataCache"

function toNumber(value, fallback = null) {
	const parsed = Number.parseFloat(value)
	return Number.isNaN(parsed) ? fallback : parsed
}

function getGrantorIdFromRow(row = {}) {
	return row.id || row.grantorId || row.providerId || ""
}

function normalizeOpenFlag(raw = {}) {
	if (raw.applicationsBlocked === true) return false
	if (raw.applyOpen === true || raw.applicationOpen === true || raw.applicationsOpen === true) return true
	if (raw.applyOpen === false || raw.applicationOpen === false || raw.applicationsOpen === false) return false
	return true
}

function normalizeGrantorCandidate(raw = {}, id = "") {
	const grantorId = getGrantorIdFromRow({ ...raw, id })
	const minimumGwa = toNumber(raw.minimumGwa ?? raw.minGwa ?? raw.minimumGrade, 2.25)
	const grantorName = toGrantorDisplayName(raw, grantorId)
	return {
		id: grantorId,
		grantorId,
		grantorName,
		providerLabel: raw.providerLabel || raw.providerName || grantorName,
		providerType: raw.providerType || toScholarshipProviderType(grantorName),
		organization: raw.organization || "",
		minimumGwa,
		minGwa: minimumGwa,
		applicationsBlocked: raw.applicationsBlocked === true,
		archived:
			raw.archived === true ||
			["archived", "inactive", "disabled"].includes(String(raw.status || raw.accountStatus || "").toLowerCase()),
		applicationEnabled: normalizeOpenFlag(raw),
		applyOpen: normalizeOpenFlag(raw),
		profileImageUrl: raw.profileImageUrl || raw.imageUrl || raw.authorImageUrl || "",
		authorImageUrl: raw.authorImageUrl || raw.profileImageUrl || raw.imageUrl || "",
		customApplicationForm: raw.customApplicationForm || null,
		province: raw.province || "",
		city: raw.city || "",
		barangay: raw.barangay || "",
		street: raw.street || "",
		postalCode: raw.postalCode || "",
		createdAt: raw.createdAt || null,
		updatedAt: raw.updatedAt || null,
	}
}

function pickLatestOpenAnnouncement(list = []) {
	return [...list]
		.filter((item) =>
			item.applicationEnabled === true &&
			item.grantorAccountArchived !== true &&
			item.hiddenFromStudents !== true &&
			!isAnnouncementArchived(item),
		)
		.sort((left, right) => {
			const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime() || 0
			const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime() || 0
			return rightTime - leftTime
		})[0] || null
}

export async function loadRecommendedScholarships(student = {}) {
	const [portalSnapshot, scholarSnapshot, announcementSnapshot] = await getCachedReferenceData(
		"recommendations:grantor-reference-data",
		() => Promise.all([
			getDocs(collection(db, GRANTOR_PORTAL_COLLECTION)),
			getDocs(collectionGroup(db, GRANTOR_SUBCOLLECTIONS.scholars)),
			getDocs(collectionGroup(db, GRANTOR_SUBCOLLECTIONS.announcements)),
		]),
		20_000,
	)

	const rosterCounts = scholarSnapshot.docs.reduce((lookup, row) => {
		const data = row.data() || {}
		const grantorId = data.grantorId || row.ref?.parent?.parent?.id || ""
		if (!grantorId || data.archived === true) return lookup
		lookup[grantorId] = (lookup[grantorId] || 0) + 1
		return lookup
	}, {})

	const announcementsByGrantor = announcementSnapshot.docs.reduce((lookup, row) => {
		const raw = row.data() || {}
		const normalized = normalizeGrantorAnnouncement(raw, row.id)
		const grantorId = normalized.grantorId || raw.grantorId || row.ref?.parent?.parent?.id || ""
		if (!grantorId) return lookup
		lookup[grantorId] = [...(lookup[grantorId] || []), { ...normalized, grantorId }]
		return lookup
	}, {})

	const candidates = portalSnapshot.docs
		.flatMap((row) => {
			const raw = row.data() || {}
			const grantor = normalizeGrantorCandidate(raw, row.id)
			if (grantor.archived) return []
			const openAnnouncements = (announcementsByGrantor[grantor.grantorId] || [])
				.filter((item) =>
					item.applicationEnabled === true &&
					item.grantorAccountArchived !== true &&
					item.hiddenFromStudents !== true &&
					!isAnnouncementArchived(item),
				)
				.sort((left, right) => {
					const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime() || 0
					const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime() || 0
					return rightTime - leftTime
				})
			const sourceAnnouncements = openAnnouncements.length > 0 ? openAnnouncements : [pickLatestOpenAnnouncement(announcementsByGrantor[grantor.grantorId] || [])].filter(Boolean)
			if (sourceAnnouncements.length === 0) {
				// Students choose an actual scholarship, not a generic grantor record.
				return []
			}
			return sourceAnnouncements.map((announcement) => {
				const minimumGwa = toNumber(
					announcement?.minimumGrade ?? announcement?.minGwa ?? grantor.minimumGwa,
					grantor.minimumGwa,
				)
				return {
					...grantor,
					minimumGwa,
					minGwa: minimumGwa,
					announcementId: announcement?.id || "",
					announcementTitle: announcement?.scholarshipTitle || announcement?.title || "",
					scholarshipTitle: announcement?.scholarshipTitle || announcement?.title || "",
					scholarshipKey: announcement?.scholarshipKey || "",
					announcementSubtitle: announcement?.subtitle || announcement?.previewText || "",
					applicationWindow: announcement?.applicationWindow || "",
					requiredDocuments: announcement?.requiredDocuments || {},
					otherRequirements: announcement?.otherRequirements || [],
					customApplicationProfile: announcement?.customApplicationProfile || null,
					customApplicationForm: announcement?.customApplicationForm || grantor.customApplicationForm || null,
					applicationEnabled: grantor.applicationEnabled && announcement?.applicationEnabled === true,
					rosterCount: rosterCounts[grantor.grantorId] || 0,
				}
			})
		})
		.filter((item) => item.grantorId && item.applicationEnabled && item.applicationsBlocked !== true)

	const ranked = await recommendScholarshipsWorkflow({
		student,
		grantors: candidates,
	})

	return {
		...ranked,
		recommendations: (ranked.recommendations || []).map((entry) => ({
			...entry.item,
			score: entry.score,
			label: entry.label,
			reasons: entry.reasons || [],
			criteria: entry.criteria || {},
		})),
	}
}

export function buildRecommendationApplyPayload(student = {}, studentId = "", recommendation = {}) {
	const scholarshipName =
		recommendation.announcementTitle ||
		recommendation.providerLabel ||
		recommendation.grantorName ||
		"Scholarship"
	const nextRecord = {
		...buildScholarshipRecord({
			name: scholarshipName,
			provider: recommendation.grantorName || scholarshipName,
			studentId,
			type: "Scholarship",
			mode: "applied",
			documentUrls: getDocumentUrlsForStudent(student),
			semesterTag: getCurrentSemesterTag(),
			appliedViaAnnouncement: Boolean(recommendation.announcementId),
		}),
		grantorId: recommendation.grantorId || "",
		providerType: recommendation.providerType || toScholarshipProviderType(recommendation.grantorName || scholarshipName),
		minGwa: recommendation.minimumGwa,
		minimumGrade: recommendation.minimumGwa,
		announcementId: recommendation.announcementId || "",
		announcementSource: recommendation.announcementId ? "grantor" : "",
		requiredDocuments: recommendation.requiredDocuments || {},
		otherRequirements: recommendation.otherRequirements || [],
		customApplicationProfile: recommendation.customApplicationProfile || null,
		customApplicationForm: recommendation.customApplicationForm || null,
	}
	const fullName =
		[student?.fname, student?.mname, student?.lname].filter(Boolean).join(" ").trim() ||
		student?.fullName ||
		"Applicant"

	return {
		record: nextRecord,
		workflowPayload: {
			studentId,
			studentUpdate: {
				scholarships: [...(Array.isArray(student?.scholarships) ? student.scholarships : []), nextRecord],
				updatedAt: serverTimestamp(),
			},
			application: {
				studentId,
				fname: student?.fname || "",
				mname: student?.mname || "",
				lname: student?.lname || "",
				fullName,
				email: student?.email || "",
				cpNumber: student?.cpNumber || "",
				scholarshipId: nextRecord.id,
				applicationNumber: nextRecord.applicationNumber || nextRecord.requestNumber || nextRecord.id,
				scholarshipName: nextRecord.name,
				providerType: nextRecord.providerType,
				providerLabel: nextRecord.provider || nextRecord.name,
				grantorId: recommendation.grantorId || "",
				announcementId: recommendation.announcementId || "",
				announcementSource: recommendation.announcementId ? "grantor" : "",
				minimumGrade: recommendation.minimumGwa,
				requiredDocuments: recommendation.requiredDocuments || {},
				otherRequirements: recommendation.otherRequirements || [],
				customApplicationProfile: recommendation.customApplicationProfile || null,
				customApplicationForm: recommendation.customApplicationForm || null,
				status: nextRecord.status,
				tracking: nextRecord.tracking,
				applicationDate: serverTimestamp(),
				appliedAt: serverTimestamp(),
				createdAt: serverTimestamp(),
				semesterTag: nextRecord.semesterTag,
				documentUrls: nextRecord.documentUrls,
				academicYear: getCurrentAcademicYear(),
			},
			notifications: {
				grantor: recommendation.grantorId ? {
					grantorId: recommendation.grantorId,
					type: "application_submitted",
					title: "New Student Application",
					message: `${fullName} applied for ${nextRecord.name}.`,
					studentId,
					studentName: fullName,
					announcementId: recommendation.announcementId || "",
					applicationNumber: nextRecord.applicationNumber || nextRecord.requestNumber || nextRecord.id,
					authorName: fullName,
					authorImageUrl: student?.profileImageUrl || student?.imageUrl || "",
					read: false,
					createdAt: serverTimestamp(),
				} : null,
				student: {
					studentId,
					source: "personal",
					type: "scholarship_application",
					title: "Application Submitted",
					message: `Your application for ${nextRecord.name} was submitted successfully.`,
					grantorId: recommendation.grantorId || "",
					announcementId: recommendation.announcementId || "",
					applicationNumber: nextRecord.applicationNumber || nextRecord.requestNumber || nextRecord.id,
					authorName: recommendation.grantorName || "Grantor",
					authorImageUrl: recommendation.profileImageUrl || recommendation.authorImageUrl || "",
					read: false,
					createdAt: serverTimestamp(),
				},
			},
		},
	}
}
