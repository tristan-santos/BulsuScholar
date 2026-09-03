import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
	collection,
	doc,
	onSnapshot,
	query,
	serverTimestamp,
	where,
} from "../services/supabaseDataService"
import { db } from "../services/supabaseDataService"
import { toast } from "react-toastify"
import {
	HiOutlineAcademicCap,
	HiOutlineArrowLeft,
	HiOutlineCheckCircle,
	HiOutlineExclamation,
	HiOutlineLocationMarker,
} from "react-icons/hi"
import StudentTopbar from "../components/StudentTopbar"
import useThemeMode from "../hooks/useThemeMode"
import useArchivedGrantorIds from "../hooks/useArchivedGrantorIds"
import {
	normalizeScholarshipList,
} from "../services/scholarshipService"
import {
	buildRecommendationApplyPayload,
	loadRecommendedScholarships,
} from "../services/recommendedScholarshipService"
import { applyScholarshipWorkflow } from "../services/workflowService"
import {
	getStudentAccessState,
	getStudentBlockedBannerMessage,
} from "../services/studentAccessService"
import { getArchivedGrantorApplyBlock, isScholarshipActiveOrPending } from "../services/announcementApplyEligibilityService"
import { formatCooldownDuration, getLatestRejectedScholarship, getRejectionCooldown } from "../services/rejectionCooldownService"
import "../css/StudentDashboard.css"
import "../css/StudentPortalRefresh.css"

function formatDisplayText(value, fallback = "") {
	const text = String(value ?? "").trim()
	if (!text) return fallback
	if (text.includes("@")) return text.toLowerCase()
	if (/^[\d\s+()./-]+$/.test(text)) return text
	return text
		.toLowerCase()
		.replace(/\b([a-z])([a-z]*)/g, (_, first, rest) => `${first.toUpperCase()}${rest}`)
}

function normalizeNotice(row = {}, id = "") {
	return {
		id,
		...row,
		type: row.type || row.notificationType || "",
		studentId: row.studentId || row.studentID || row.studentNumber || "",
		grantorId: row.grantorId || row.providerId || "",
		grantorName: row.grantorName || row.providerLabel || row.authorName || "",
		scholarshipName: row.scholarshipName || row.announcementTitle || row.providerLabel || "",
		announcementId: row.announcementId || "",
	}
}

function isMultipleScholarshipWarning(row = {}) {
	const type = String(row.warningType || row.type || row.notificationType || "").toLowerCase()
	const reason = String(row.scholarshipRestrictionReason || row.reason || row.source || "").toLowerCase()
	return type.includes("multiple_scholarship") || type.includes("duplicate_scholarship") ||
		reason.includes("multiple_scholarship") || reason.includes("duplicate_scholarship")
}

function recommendationKey(item = {}) {
	return [
		item.announcementId || "",
		item.grantorId || item.providerId || item.id || "",
		item.scholarshipName || item.announcementTitle || item.providerLabel || item.grantorName || "",
	]
		.filter(Boolean)
		.map((value) => String(value).trim().toLowerCase())
		.join("::")
}

function matchesScholarship(left = {}, right = {}) {
	if (left.announcementId && right.announcementId) return left.announcementId === right.announcementId
	const leftGrantor = String(left.grantorId || left.providerId || "").trim().toLowerCase()
	const rightGrantor = String(right.grantorId || right.providerId || "").trim().toLowerCase()
	if (!leftGrantor || leftGrantor !== rightGrantor) return false
	const leftName = String(left.scholarshipName || left.announcementTitle || left.providerLabel || "").trim().toLowerCase()
	const rightName = String(right.scholarshipName || right.announcementTitle || right.providerLabel || "").trim().toLowerCase()
	return !leftName || !rightName || leftName === rightName
}

export default function StudentRecommendedScholarshipsPage() {
	const archivedGrantorIds = useArchivedGrantorIds()
	const navigate = useNavigate()
	const { theme, setTheme } = useThemeMode()
	const [userId] = useState(() => sessionStorage.getItem("bulsuscholar_userId") || "")
	const [user, setUser] = useState(null)
	const [userLoaded, setUserLoaded] = useState(false)
	const [recommendations, setRecommendations] = useState([])
	const [studentNotices, setStudentNotices] = useState([])
	const [studentWarnings, setStudentWarnings] = useState([])
	const [_algorithm, setAlgorithm] = useState("")
	const [loading, setLoading] = useState(true)
	const [applyingId, setApplyingId] = useState("")
	const recommendationRequestKeyRef = useRef("")

	const scholarships = useMemo(
		() => normalizeScholarshipList(user?.scholarships || []),
		[user?.scholarships],
	)
	const activeOrPendingScholarships = useMemo(
		() => scholarships.filter((item) => !item.isLocked && isScholarshipActiveOrPending(item.status)),
		[scholarships],
	)
	const latestRejectedScholarship = useMemo(() => getLatestRejectedScholarship(scholarships), [scholarships])
	const latestRejectedCooldown = useMemo(
		() => latestRejectedScholarship ? getRejectionCooldown(latestRejectedScholarship) : null,
		[latestRejectedScholarship],
	)
	const studentAccessState = useMemo(() => getStudentAccessState(user || {}), [user])
	const pendingInvitations = useMemo(
		() => (Array.isArray(user?.scholarshipInvitations) ? user.scholarshipInvitations : [])
			.filter((item) => item?.type === "grantor_unarchive_invitation" &&
				String(item.status || "").toLowerCase() === "pending" &&
				!archivedGrantorIds.has(String(item.grantorId || item.providerId || ""))),
		[archivedGrantorIds, user?.scholarshipInvitations],
	)
	const adminRecommendations = useMemo(
		() => studentNotices.filter((item) => String(item.type || "").toLowerCase() === "admin_scholarship_recommendation"),
		[studentNotices],
	)
	const hasMultipleScholarshipConflict = useMemo(
		() => user?.scholarshipConflictWarning === true ||
			user?.scholarshipRestrictionReason === "multiple_scholarships" ||
			studentWarnings.some(isMultipleScholarshipWarning),
		[studentWarnings, user?.scholarshipConflictWarning, user?.scholarshipRestrictionReason],
	)
	const matchedGrantorScope = useMemo(
		() => (Array.isArray(user?.grantorMatches) ? user.grantorMatches : [])
			.map((item) => String(item.grantorId || item.id || "").trim().toLowerCase())
			.filter(Boolean),
		[user?.grantorMatches],
	)
	const displayRecommendations = useMemo(() => {
		if (hasMultipleScholarshipConflict) return []
		const adminGrantors = new Set(adminRecommendations.map((item) => String(item.grantorId || "").trim().toLowerCase()).filter(Boolean))
		const allowedGrantors = adminGrantors.size > 0 ? adminGrantors : new Set(matchedGrantorScope)
		const byScholarship = new Map()
		const add = (item, bypassScope = false) => {
			if (!item) return
			const grantorId = String(item.grantorId || item.providerId || item.id || "").trim().toLowerCase()
			if (archivedGrantorIds.has(String(item.grantorId || item.providerId || ""))) return
			if (!bypassScope && allowedGrantors.size > 0 && !allowedGrantors.has(grantorId)) return
			const key = recommendationKey(item)
			if (key && !byScholarship.has(key)) byScholarship.set(key, item)
		}

		pendingInvitations.forEach((invitation) => add({
			...invitation,
			recommendationSource: "grantor_invitation",
			recommendationPriority: 1,
			label: "Apply again",
			announcementTitle: invitation.scholarshipName || invitation.announcementTitle || "Scholarship Invitation",
			providerLabel: invitation.scholarshipName || invitation.grantorName || "Scholarship",
			reasons: [
				`You are being invited to apply again in ${invitation.scholarshipName || "your previous scholarship"}.`,
				`Sent by ${invitation.grantorName || "the grantor"}.`,
			],
		}, true))

		if (latestRejectedScholarship && !latestRejectedCooldown?.active) {
			const match = recommendations.find((item) => matchesScholarship(latestRejectedScholarship, item))
			if (match) add({
				...match,
				recommendationSource: "reapply_after_rejection",
				recommendationPriority: 1,
				label: "Try to apply again in this scholarship",
				reasons: ["Your 24-hour re-application cooldown is complete."],
			}, true)
		}

		adminRecommendations.forEach((notice) => {
			const match = recommendations.find((item) => matchesScholarship(notice, item))
			add({
				...(match || {}),
				grantorId: notice.grantorId || match?.grantorId || "",
				grantorName: notice.grantorName || match?.grantorName || "Grantor",
				announcementId: notice.announcementId || match?.announcementId || "",
				announcementTitle: notice.scholarshipName || match?.announcementTitle || "Recommended Scholarship",
				providerLabel: notice.scholarshipName || match?.providerLabel || "Scholarship",
				recommendationSource: "admin_recommendation",
				recommendationPriority: 2,
				label: "Recommended by the Admin",
				reasons: [notice.message || "The Office of the Scholarship recommended this option based on your profile."],
			}, true)
		})

		recommendations.forEach((item) => add({
			...item,
			recommendationSource: matchedGrantorScope.length > 0 ? "roster_scoped_recommendation" : "algorithm_recommendation",
			recommendationPriority: matchedGrantorScope.length > 0 ? 2 : 3,
			label: matchedGrantorScope.length > 0 ? "Scholarship option from your assigned grantor" : item.label,
		}))

		return [...byScholarship.values()].sort((left, right) =>
			(left.recommendationPriority || 9) - (right.recommendationPriority || 9) || Number(right.score || 0) - Number(left.score || 0),
		)
	}, [adminRecommendations, archivedGrantorIds, hasMultipleScholarshipConflict, latestRejectedCooldown?.active, latestRejectedScholarship, matchedGrantorScope, pendingInvitations, recommendations])

	useEffect(() => {
		const storedType = sessionStorage.getItem("bulsuscholar_userType")
		if (!userId || storedType !== "student") {
			setUserLoaded(true)
			navigate("/", { replace: true })
			return undefined
		}

		return onSnapshot(
			doc(db, "students", userId),
			(snap) => {
				setUser(snap.exists() ? snap.data() || {} : null)
				setUserLoaded(true)
			},
			() => setUserLoaded(true),
		)
	}, [navigate, userId])

	useEffect(() => {
		if (!userId) return undefined
		const unsubscribeNotices = onSnapshot(
			query(collection(db, "studentNotifications"), where("studentId", "==", userId)),
			(snapshot) => setStudentNotices(snapshot.docs.map((row) => normalizeNotice(row.data() || {}, row.id))),
			() => setStudentNotices([]),
		)
		const unsubscribeWarnings = onSnapshot(
			query(collection(db, "studentWarning"), where("studentId", "==", userId)),
			(snapshot) => setStudentWarnings(snapshot.docs.map((row) => normalizeNotice(row.data() || {}, row.id))),
			() => setStudentWarnings([]),
		)
		return () => {
			unsubscribeNotices?.()
			unsubscribeWarnings?.()
		}
	}, [userId])

	useEffect(() => {
		if (!userLoaded || !user) return
		if (activeOrPendingScholarships.length > 0 || latestRejectedCooldown?.active) {
			recommendationRequestKeyRef.current = ""
			setRecommendations([])
			setAlgorithm("")
			setLoading(false)
			return
		}
		const recommendationRequestKey = JSON.stringify([
			userId,
			user.gwa || user.currentGwa || user.generalWeightedAverage || "",
			user.course || "",
			user.year || user.yearLevel || "",
			user.province || "",
			user.city || user.municipality || "",
			user.barangay || "",
			[...archivedGrantorIds].sort(),
		])
		if (recommendationRequestKeyRef.current === recommendationRequestKey) return
		recommendationRequestKeyRef.current = recommendationRequestKey

		setLoading(true)
		loadRecommendedScholarships({
			...user,
			id: userId,
			studentId: user.studentId || user.studentnumber || userId,
		})
			.then((result) => {
				if (recommendationRequestKeyRef.current !== recommendationRequestKey) return
				setRecommendations(
					(result.recommendations || []).filter(
						(item) => !archivedGrantorIds.has(String(item.grantorId || item.providerId || "")),
					),
				)
				setAlgorithm(result.algorithm || "")
			})
			.catch((error) => {
				if (recommendationRequestKeyRef.current !== recommendationRequestKey) return
				console.error("StudentRecommendedScholarshipsPage: loading failed:", error)
				setRecommendations([])
				setAlgorithm("")
				toast.error("Failed to load recommended scholarships.")
			})
			.finally(() => {
				if (recommendationRequestKeyRef.current === recommendationRequestKey) setLoading(false)
			})
	}, [activeOrPendingScholarships.length, archivedGrantorIds, latestRejectedCooldown, user, userId, userLoaded])

	const applyRecommendation = useCallback(
		async (recommendation) => {
			if (!user || !userId || applyingId) return
			if (archivedGrantorIds.has(String(recommendation.grantorId || recommendation.providerId || ""))) {
				toast.error("This grantor is archived and is not accepting scholarship applications.")
				return
			}
			if (studentAccessState.isScholarshipActionBlocked) {
				toast.error(getStudentBlockedBannerMessage(user || {}))
				return
			}
			if (latestRejectedCooldown?.active) {
				toast.info(`You can apply again after ${formatCooldownDuration(latestRejectedCooldown.remainingMs)}.`)
				return
			}
			if (activeOrPendingScholarships.length > 0) {
				toast.info("You already have an existing scholarship application.")
				return
			}

			const nextId = recommendationKey(recommendation) || recommendation.grantorId || recommendation.id
			setApplyingId(nextId)
			try {
				const { workflowPayload } = buildRecommendationApplyPayload(user, userId, recommendation)
				const isInvitation = recommendation.recommendationSource === "grantor_invitation"
				const archivedGrantorBlock = !isInvitation
					? getArchivedGrantorApplyBlock(user, {
							grantorId: recommendation.grantorId || recommendation.providerId || "",
							providerId: recommendation.providerId || recommendation.grantorId || "",
							providerType: recommendation.providerType || "",
							providerLabel: recommendation.providerLabel || recommendation.scholarshipName || recommendation.announcementTitle || "",
							sourceLabel: recommendation.grantorName || recommendation.providerLabel || "",
							grantorName: recommendation.grantorName || "",
							title: recommendation.announcementTitle || recommendation.scholarshipName || recommendation.providerLabel || "",
						})
					: null
				if (archivedGrantorBlock) {
					toast.info(`You cannot apply to ${recommendation.grantorName || "this grantor"} again unless they invite you back.`)
					return
				}
				const nextInvitations = isInvitation
					? (Array.isArray(user?.scholarshipInvitations) ? user.scholarshipInvitations : []).map((item) =>
						item.id === recommendation.id
							? { ...item, status: "Accepted", acceptedAt: serverTimestamp(), updatedAt: serverTimestamp() }
							: item,
					)
					: user?.scholarshipInvitations
				const nextPayload = isInvitation
					? {
						...workflowPayload,
						allowArchivedGrantorReapply: true,
						studentUpdate: { ...workflowPayload.studentUpdate, scholarshipInvitations: nextInvitations },
					}
					: workflowPayload
				await applyScholarshipWorkflow(nextPayload)
				setUser((prev) => ({
					...(prev || {}),
					scholarships: nextPayload.studentUpdate.scholarships,
					scholarshipInvitations: nextInvitations,
					updatedAt: serverTimestamp(),
				}))
				toast.success(isInvitation ? "Scholarship invitation accepted." : `Application sent to ${recommendation.grantorName || "the grantor"}.`)
				navigate("/student-dashboard/scholarships")
			} catch (error) {
				console.error("StudentRecommendedScholarshipsPage: apply failed:", error)
				toast.error(
					String(error?.message || "").toLowerCase().includes("grantor is archived") ||
						String(error?.message || "").toLowerCase().includes("student was archived")
						? error.message
						: "Failed to apply for this recommendation.",
				)
			} finally {
				setApplyingId("")
			}
		},
		[activeOrPendingScholarships.length, applyingId, archivedGrantorIds, latestRejectedCooldown, navigate, studentAccessState.isScholarshipActionBlocked, user, userId],
	)

	if (!userLoaded) {
		return (
			<div className={`student-portal student-dashboard student-portal-view student-portal-view--recommendations ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
				<StudentTopbar user={user} theme={theme} setTheme={setTheme} />
				<main className="student-shell">
					<div className="student-shell-content student-dashboard-surface">
						<div className="student-loading-panel">Loading recommendations...</div>
					</div>
				</main>
			</div>
		)
	}

	return (
		<div className={`student-portal student-dashboard student-portal-view student-portal-view--recommendations ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
			<StudentTopbar user={user} theme={theme} setTheme={setTheme} />
			<main className="student-shell">
				<div className="student-shell-content student-dashboard-surface">
					<section className="student-recommendation-page-hero">
						<div className="student-recommendation-nav-row">
							<button
								type="button"
								className="student-recommendation-back-btn"
								onClick={() => navigate("/student-dashboard")}
							>
								<HiOutlineArrowLeft aria-hidden />
								Back to Dashboard
							</button>
						</div>
						<div className="student-recommendation-hero-card">
							<div className="student-recommendation-hero-icon">
								<HiOutlineAcademicCap aria-hidden />
							</div>
							<div className="student-page-title">
								<p className="student-bento-eyebrow">Recommendation Center</p>
								<h2 className="student-page-heading">Recommended Scholarships</h2>
								<p className="student-page-sub">
									Open grantors ranked by your GWA, roster strength, and location profile.
								</p>
							</div>
							<div className="student-recommendation-algorithm">
								<HiOutlineCheckCircle />
								<span>Current GWA: {user?.gwa || user?.currentGwa || user?.generalWeightedAverage || "Not set"}</span>
							</div>
						</div>
					</section>

					{hasMultipleScholarshipConflict ? (
						<div className="student-modern-recommended-empty student-modern-recommended-empty--warning">
							<HiOutlineExclamation />
							<strong>Multiple scholarship records need verification.</strong>
							<p>
								Recommendations are temporarily unavailable. Visit the Office of the Scholarship or submit a Help Center ticket so your scholarship records can be reviewed.
							</p>
						</div>
					) : latestRejectedCooldown?.active ? (
						<div className="student-modern-recommended-empty">
							<HiOutlineExclamation />
							<strong>Re-application cooldown active.</strong>
							<p>
								You can apply again after {formatCooldownDuration(latestRejectedCooldown.remainingMs)}.
								Your previous application was rejected and is still under the 24-hour cooldown.
							</p>
						</div>
					) : activeOrPendingScholarships.length > 0 ? (
						<div className="student-modern-recommended-empty">
							<HiOutlineAcademicCap />
							<strong>You already have a scholarship application.</strong>
							<p>Recommended scholarships are hidden until your current application is resolved.</p>
						</div>
					) : loading ? (
						<div className="student-modern-recommended-empty">
							<HiOutlineAcademicCap />
							<strong>Ranking open scholarships...</strong>
							<p>Checking open applications, GWA eligibility, roster count, and location match.</p>
						</div>
					) : displayRecommendations.length === 0 ? (
						<div className="student-modern-recommended-empty">
							<HiOutlineExclamation />
							<strong>No open scholarship matches.</strong>
							<p>No open grantor currently matches your GWA and profile.</p>
						</div>
					) : (
						<section className="student-recommendation-page-grid">
							{displayRecommendations.map((recommendation, index) => {
								const itemId = recommendationKey(recommendation) || recommendation.grantorId || recommendation.id
								const isInvitation = recommendation.recommendationSource === "grantor_invitation"
								const initials = String(recommendation.grantorName || "GR").trim().slice(0, 2).toUpperCase()
								return (
									<article key={itemId} className="student-recommendation-page-card">
										<div className="student-recommendation-rank">#{index + 1}</div>
										<div className="student-modern-recommendation-media">
											{recommendation.profileImageUrl || recommendation.authorImageUrl ? (
												<img src={recommendation.profileImageUrl || recommendation.authorImageUrl} alt={`${recommendation.grantorName || "Grantor"} profile`} />
											) : <span>{initials}</span>}
										</div>
										<div className="student-modern-recommendation-top">
											<span className="student-modern-recommendation-avatar">
												{recommendation.profileImageUrl || recommendation.authorImageUrl ? (
													<img src={recommendation.profileImageUrl || recommendation.authorImageUrl} alt="" />
												) : initials}
											</span>
											<div>
												<strong>{formatDisplayText(recommendation.grantorName, "Grantor")}</strong>
												<small>{formatDisplayText(recommendation.organization, "Open Scholarship Provider")}</small>
											</div>
										</div>
										<h3>{formatDisplayText(recommendation.announcementTitle || recommendation.providerLabel || recommendation.grantorName, "Scholarship")}</h3>
										<p>{recommendation.label || "This scholarship is best for you."}</p>
										<div className="student-recommendation-meta-grid">
											<span><HiOutlineAcademicCap /> Minimum GWA {recommendation.minimumGwa || recommendation.minGwa || "Not set"}</span>
											<span><HiOutlineCheckCircle /> {recommendation.rosterCount || 0} roster scholars</span>
											<span><HiOutlineLocationMarker /> {formatDisplayText([recommendation.city, recommendation.province].filter(Boolean).join(", "), "Location not set")}</span>
										</div>
										<div className="student-recommendation-reasons">
											{(recommendation.reasons || []).slice(0, 4).map((reason) => <span key={reason}>{reason}</span>)}
										</div>
										<button
											type="button"
											className="student-mini-btn student-mini-btn--primary"
											onClick={() => applyRecommendation(recommendation)}
											disabled={Boolean(applyingId)}
										>
											<HiOutlineAcademicCap />
											{applyingId === itemId ? "Applying..." : isInvitation ? "Accept Invitation" : "Apply"}
										</button>
									</article>
								)
							})}
						</section>
					)}
				</div>
			</main>
		</div>
	)
}
