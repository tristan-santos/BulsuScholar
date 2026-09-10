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
	isAnnouncementExplicitlyArchived,
	normalizeGrantorAnnouncement,
	toGrantorDisplayName,
} from "./grantorService"
import { recommendScholarshipsWorkflow } from "./workflowService"
import { getCachedReferenceData } from "./referenceDataCache"

function normalizeText(value = "") {
	return String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

function getLocationScore(student = {}, grantor = {}) {
	const studentProvince = normalizeText(student.province)
	const studentCity = normalizeText(student.city)
	const studentBarangay = normalizeText(student.barangay)
	const grantorProvince = normalizeText(grantor.province)
	const grantorCity = normalizeText(grantor.city)
	const grantorBarangay = normalizeText(grantor.barangay)

	if (![studentProvince, studentCity, studentBarangay, grantorProvince, grantorCity, grantorBarangay].some(Boolean)) {
		return 8
	}

	let score = 0
	if (studentProvince && grantorProvince && studentProvince === grantorProvince) score += 10
	else if (studentProvince === "pampanga" && grantorProvince === "bulacan") score += 4
	else if (grantorProvince) score += 2
	if (studentCity && grantorCity && studentCity === grantorCity) score += 10
	if (studentBarangay && grantorBarangay && studentBarangay === grantorBarangay) score += 5
	return Math.min(score, 25)
}

function getRecommendationLabel(score, reasons = []) {
	if (score >= 78) return "Best Scholarship Match For You"
	if (reasons.some((reason) => reason.includes("Nearest"))) return "Recommended Near Your Location"
	if (reasons.some((reason) => reason.includes("roster"))) return "Popular Grantor Match"
	if (reasons.some((reason) => reason.includes("Strong GWA"))) return "Strong GWA Match"
	return "Available Scholarship Match"
}

function rankRecommendationsLocally(student = {}, candidates = []) {
	const studentGwa = toNumber(student.gwa ?? student.currentGwa ?? student.generalWeightedAverage)
	const maxRoster = Math.max(0, ...candidates.map((item) => Number.parseInt(item.rosterCount, 10) || 0))
	const popularityWeight = studentGwa != null && studentGwa <= 1.75 ? 30 : 22
	const recommendations = []

	for (const item of candidates) {
		if (item.applicationsBlocked === true) continue
		if (item.applicationEnabled === false && item.applyOpen !== true) continue
		const minimumGwa = toNumber(item.minimumGwa ?? item.minGwa ?? item.minimumGrade, 2.25)
		if (studentGwa == null || studentGwa > minimumGwa) continue

		const reasons = []
		const gradeMargin = Math.max(0, minimumGwa - studentGwa)
		const gradeScore = Math.min(40, 24 + (gradeMargin * 12))
		reasons.push(gradeMargin >= 0.5 ? "Strong GWA match" : "Meets minimum GWA")

		const rosterCount = Number.parseInt(item.rosterCount, 10) || 0
		const popularityScore = maxRoster > 0 ? (rosterCount / maxRoster) * popularityWeight : 0
		if (rosterCount > 0) reasons.push(`${rosterCount} scholar roster`)

		const locationScore = getLocationScore(student, item)
		if (locationScore >= 22) reasons.push("Nearest location match")
		else if (locationScore >= 12) reasons.push("Same province area")
		else if (normalizeText(student.province) === "pampanga" && normalizeText(item.province) === "bulacan") {
			reasons.push("Bulacan grantor, lower location priority")
		}

		const completenessScore = 8 + (item.profileImageUrl || item.authorImageUrl || item.imageUrl ? 2 : 0)
		const score = gradeScore + popularityScore + locationScore + completenessScore
		recommendations.push({
			item,
			score: Number(score.toFixed(4)),
			label: getRecommendationLabel(score, reasons),
			reasons: reasons.slice(0, 4),
			criteria: {
				gwa: studentGwa,
				minimumGwa,
				rosterCount,
				gradeScore: Number(gradeScore.toFixed(2)),
				popularityScore: Number(popularityScore.toFixed(2)),
				locationScore: Number(locationScore.toFixed(2)),
			},
		})
	}

	recommendations.sort((left, right) => right.score - left.score)
	return {
		ok: true,
		degraded: true,
		algorithm: "Weighted Recommendation Scoring (local fallback)",
		recommendations,
	}
}

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
			!isAnnouncementExplicitlyArchived(item) &&
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
					!isAnnouncementExplicitlyArchived(item) &&
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
					slotsConfigured: announcement?.slotsConfigured === true,
					totalSlots: announcement?.totalSlots ?? null,
					remainingSlots: announcement?.remainingSlots ?? null,
					rosterCount: rosterCounts[grantor.grantorId] || 0,
				}
			})
		})
		.filter((item) => item.grantorId && item.applicationEnabled && item.applicationsBlocked !== true)

	let ranked
	try {
		ranked = await recommendScholarshipsWorkflow({
			student,
			grantors: candidates,
		})
	} catch (error) {
		if (!["backend_unavailable", "request_timeout"].includes(error?.reason)) throw error
		ranked = rankRecommendationsLocally(student, candidates)
	}

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
		grantorName: recommendation.grantorName || "",
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
				grantorName: recommendation.grantorName || "",
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
