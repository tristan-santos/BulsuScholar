import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
	doc,
	onSnapshot,
	serverTimestamp,
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
import "../css/StudentDashboard.css"

function formatDisplayText(value, fallback = "") {
	const text = String(value ?? "").trim()
	if (!text) return fallback
	if (text.includes("@")) return text.toLowerCase()
	if (/^[\d\s+()./-]+$/.test(text)) return text
	return text
		.toLowerCase()
		.replace(/\b([a-z])([a-z]*)/g, (_, first, rest) => `${first.toUpperCase()}${rest}`)
}

export default function StudentRecommendedScholarshipsPage() {
	const navigate = useNavigate()
	const { theme, setTheme } = useThemeMode()
	const [userId] = useState(() => sessionStorage.getItem("bulsuscholar_userId") || "")
	const [user, setUser] = useState(null)
	const [userLoaded, setUserLoaded] = useState(false)
	const [recommendations, setRecommendations] = useState([])
	const [algorithm, setAlgorithm] = useState("")
	const [loading, setLoading] = useState(true)
	const [applyingId, setApplyingId] = useState("")

	const scholarships = useMemo(
		() => normalizeScholarshipList(user?.scholarships || []),
		[user?.scholarships],
	)
	const studentAccessState = useMemo(() => getStudentAccessState(user || {}), [user])

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
		if (!userLoaded || !user) return
		if (scholarships.length > 0) {
			setRecommendations([])
			setAlgorithm("")
			setLoading(false)
			return
		}

		let cancelled = false
		setLoading(true)
		loadRecommendedScholarships({
			...user,
			id: userId,
			studentId: user.studentId || user.studentnumber || userId,
		})
			.then((result) => {
				if (cancelled) return
				setRecommendations(result.recommendations || [])
				setAlgorithm(result.algorithm || "")
			})
			.catch((error) => {
				if (cancelled) return
				console.error("StudentRecommendedScholarshipsPage: loading failed:", error)
				setRecommendations([])
				setAlgorithm("")
				toast.error("Failed to load recommended scholarships.")
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})

		return () => {
			cancelled = true
		}
	}, [scholarships.length, user, userId, userLoaded])

	const applyRecommendation = useCallback(
		async (recommendation) => {
			if (!user || !userId || applyingId) return
			if (studentAccessState.isScholarshipActionBlocked) {
				toast.error(getStudentBlockedBannerMessage(user || {}))
				return
			}
			if (scholarships.length > 0) {
				toast.info("You already have an existing scholarship application.")
				return
			}

			const nextId = recommendation.grantorId || recommendation.id
			setApplyingId(nextId)
			try {
				const { workflowPayload } = buildRecommendationApplyPayload(user, userId, recommendation)
				await applyScholarshipWorkflow(workflowPayload)
				setUser((prev) => ({
					...(prev || {}),
					scholarships: workflowPayload.studentUpdate.scholarships,
					updatedAt: serverTimestamp(),
				}))
				toast.success(`Application sent to ${recommendation.grantorName || "the grantor"}.`)
				navigate("/student-dashboard/scholarships")
			} catch (error) {
				console.error("StudentRecommendedScholarshipsPage: apply failed:", error)
				toast.error("Failed to apply for this recommendation.")
			} finally {
				setApplyingId("")
			}
		},
		[applyingId, navigate, scholarships.length, studentAccessState.isScholarshipActionBlocked, user, userId],
	)

	if (!userLoaded) {
		return (
			<div className={`student-portal student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
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
		<div className={`student-portal student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
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
								<span>{algorithm || "Weighted Recommendation Scoring"}</span>
							</div>
						</div>
					</section>

					{scholarships.length > 0 ? (
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
					) : recommendations.length === 0 ? (
						<div className="student-modern-recommended-empty">
							<HiOutlineExclamation />
							<strong>No open scholarship matches.</strong>
							<p>No open grantor currently matches your GWA and profile.</p>
						</div>
					) : (
						<section className="student-recommendation-page-grid">
							{recommendations.map((recommendation, index) => {
								const itemId = recommendation.grantorId || recommendation.id
								const initials = String(recommendation.grantorName || "GR").trim().slice(0, 2).toUpperCase()
								return (
									<article key={itemId} className="student-recommendation-page-card">
										<div className="student-recommendation-rank">#{index + 1}</div>
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
											{applyingId === itemId ? "Applying..." : "Apply"}
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
