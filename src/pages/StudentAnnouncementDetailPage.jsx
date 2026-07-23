import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
	HiOutlineAcademicCap,
	HiOutlineArrowLeft,
	HiOutlineCalendar,
	HiOutlineClock,
	HiOutlineDocumentText,
	HiOutlineExclamation,
	HiOutlineInbox,
	HiChevronLeft,
	HiChevronRight,
} from "react-icons/hi"
import { toast } from "react-toastify"
import {
	collection,
	collectionGroup,
	doc,
	onSnapshot,
	serverTimestamp,
} from "../services/supabaseDataService"
import { db } from "../services/supabaseDataService"
import "../css/StudentDashboard.css"
import useThemeMode from "../hooks/useThemeMode"
import StudentTopbar from "../components/StudentTopbar"
import {
	isPreviousStudentAnnouncement,
	normalizeStudentAnnouncement,
	sortStudentAnnouncements,
} from "../services/announcementService"
import { GRANTOR_SUBCOLLECTIONS, toJsDate } from "../services/grantorService"
import {
	buildScholarshipRecord,
	getCurrentAcademicYear,
	getCurrentSemesterTag,
	getDocumentUrlsForStudent,
	normalizeScholarshipList,
	toScholarshipProviderType,
} from "../services/scholarshipService"
import {
	getPortalAccessBlockMessage,
	getScholarshipActionBlockMessage,
	getStudentAccessState,
	getStudentBlockedBannerMessage,
} from "../services/studentAccessService"
import { applyScholarshipWorkflow } from "../services/workflowService"

function buildAnnouncementImageList(item = {}) {
	const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls : []
	const imageObjects = Array.isArray(item.images) ? item.images.map((image) => image?.url).filter(Boolean) : []
	return [...new Set([item.imageUrl, ...imageUrls, ...imageObjects].filter(Boolean))]
}

function formatRelativeDate(value) {
	const date = toJsDate(value)
	if (!date) return "Date unavailable"
	const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
	const intervals = [
		{ seconds: 31536000, label: "year" },
		{ seconds: 2592000, label: "month" },
		{ seconds: 86400, label: "day" },
		{ seconds: 3600, label: "hour" },
		{ seconds: 60, label: "minute" },
	]
	for (const interval of intervals) {
		if (elapsedSeconds >= interval.seconds) {
			const amount = Math.floor(elapsedSeconds / interval.seconds)
			return `${amount} ${interval.label}${amount === 1 ? "" : "s"} ago`
		}
	}
	return "Just now"
}

function formatAnnouncementDateRange(announcement = {}) {
	if (announcement.applicationWindow) return announcement.applicationWindow
	const startDate = toJsDate(announcement.startDate)
	const endDate = toJsDate(announcement.endDate || announcement.scheduleEnd)
	const formatter = new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		year: "numeric",
	})
	if (startDate && endDate) return `${formatter.format(startDate)} - ${formatter.format(endDate)}`
	if (startDate) return `Starts ${formatter.format(startDate)}`
	if (endDate) return `Until ${formatter.format(endDate)}`
	return "Application window not set"
}

function isScholarshipActiveOrPending(status = "") {
	const normalized = String(status).toLowerCase()
	if (!normalized) return true
	return ![
		"finalized",
		"rejected",
		"denied",
		"cancelled",
		"canceled",
		"withdrawn",
		"resolved",
		"completed",
		"expired",
	].some((keyword) => normalized.includes(keyword))
}

function toNumericGrade(value) {
	const grade = Number(value)
	return Number.isFinite(grade) ? grade : null
}

function getGrantorDisplayName(profile = {}, announcement = {}) {
	return (
		profile.providerName ||
		profile.grantorName ||
		profile.name ||
		profile.fullName ||
		announcement.grantorName ||
		announcement.providerLabel ||
		announcement.sourceLabel ||
		"This Grantor"
	)
}

function getInitials(name = "", fallback = "G") {
	return String(name || "")
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("") || fallback
}

function getMissingAnnouncementDocuments(student = {}, announcement = {}) {
	const required = announcement?.requiredDocuments || {}
	const urls = getDocumentUrlsForStudent(student)
	return [
		required.cog === true && !urls.cog ? "COG" : "",
		required.cor === true && !urls.cor ? "COR" : "",
		required.applicationForm === true && !urls.applicationForm ? "Application Form" : "",
	].filter(Boolean)
}

export default function StudentAnnouncementDetailPage() {
	const navigate = useNavigate()
	const { source = "admin", announcementId = "" } = useParams()
	const [sessionState] = useState(() => {
		const storedUserId = sessionStorage.getItem("bulsuscholar_userId")
		const storedType = sessionStorage.getItem("bulsuscholar_userType")
		return {
			storedUserId,
			isStudent: Boolean(storedUserId) && storedType === "student",
		}
	})
	const [user, setUser] = useState(null)
	const [userLoaded, setUserLoaded] = useState(() => !sessionState.isStudent)
	const [announcements, setAnnouncements] = useState([])
	const [grantorProfiles, setGrantorProfiles] = useState({})
	const [activeImageIndex, setActiveImageIndex] = useState(0)
	const [isApplying, setIsApplying] = useState(false)
	const { theme, setTheme } = useThemeMode()
	const forcedLogoutRef = useRef(false)

	useEffect(() => {
		if (!sessionState.isStudent || !sessionState.storedUserId) return

		return onSnapshot(
			doc(db, "students", sessionState.storedUserId),
			(snap) => {
				if (!snap.exists()) {
					setUser(null)
					setUserLoaded(true)
					return
				}

				const nextUser = snap.data() || {}
				setUser(nextUser)
				setUserLoaded(true)

				const accessState = getStudentAccessState(nextUser)
				if (accessState.isPortalAccessBlocked && !forcedLogoutRef.current) {
					forcedLogoutRef.current = true
					sessionStorage.removeItem("bulsuscholar_userId")
					sessionStorage.removeItem("bulsuscholar_userType")
					toast.error(getPortalAccessBlockMessage(nextUser))
					navigate("/", { replace: true })
				}
			},
			() => setUserLoaded(true),
		)
	}, [navigate, sessionState.isStudent, sessionState.storedUserId])

	useEffect(() => {
		if (userLoaded && !user) {
			navigate("/", { replace: true })
		}
	}, [navigate, user, userLoaded])

	useEffect(() => {
		let adminRows = []
		let grantorRows = []

		const updateAnnouncements = () => {
			setAnnouncements((currentRows) => {
				const liveRows = sortStudentAnnouncements([...adminRows, ...grantorRows])
				if (liveRows.length > 0) return liveRows
				return currentRows
			})
		}

		const unsubscribeAdminAnnouncements = onSnapshot(
			collection(db, "announcements"),
			(snap) => {
				adminRows = snap.docs.map((item) =>
					normalizeStudentAnnouncement(item.data() || {}, item.id, "admin"),
				)
				updateAnnouncements()
			},
			() => {
				adminRows = []
				updateAnnouncements()
			},
		)

		const unsubscribeGrantorAnnouncements = onSnapshot(
			collectionGroup(db, GRANTOR_SUBCOLLECTIONS.announcements),
			(snap) => {
				grantorRows = snap.docs.map((item) =>
					normalizeStudentAnnouncement(item.data() || {}, item.id, "grantor"),
				)
				updateAnnouncements()
			},
			() => {
				grantorRows = []
				updateAnnouncements()
			},
		)

		return () => {
			unsubscribeAdminAnnouncements()
			unsubscribeGrantorAnnouncements()
		}
	}, [])

	useEffect(() => {
		return onSnapshot(
			collection(db, "grantorPortals"),
			(snap) => {
				const nextProfiles = {}
				snap.docs.forEach((item) => {
					nextProfiles[item.id] = item.data() || {}
				})
				setGrantorProfiles(nextProfiles)
			},
			() => setGrantorProfiles({}),
		)
	}, [])

	const announcement = useMemo(() => {
		const decodedId = decodeURIComponent(announcementId)
		return announcements.find(
			(item) => String(item.id) === decodedId && String(item.source || "admin") === String(source || "admin"),
		)
	}, [announcementId, announcements, source])
	const relatedAnnouncements = useMemo(() => {
		if (!announcement) return []

		return sortStudentAnnouncements(
			announcements.filter((item) => {
				if (String(item.id) === String(announcement.id) && item.source === announcement.source) return false
				if (isPreviousStudentAnnouncement(item)) return false
				if (announcement.source !== "grantor") return item.source === announcement.source
				return Boolean(announcement.grantorId) && item.source === "grantor" && item.grantorId === announcement.grantorId
			}),
		).slice(0, 3)
	}, [announcement, announcements])
	const studentAccessState = useMemo(() => getStudentAccessState(user || {}), [user])
	const hasBlockedScholarshipBanner =
		studentAccessState.scholarshipEligibilityBlocked || studentAccessState.soeComplianceBlocked
	const blockedScholarshipBannerCopy = getStudentBlockedBannerMessage(user || {})
	const imageUrls = buildAnnouncementImageList(announcement)
	const isPreviousAnnouncement = announcement ? isPreviousStudentAnnouncement(announcement) : false
	const isAnnouncementApplication = announcement?.applicationEnabled === true
	const grantorProfile =
		announcement?.source === "grantor" && announcement?.grantorId
			? grantorProfiles[announcement.grantorId] || {}
			: {}
	const grantorDisplayName =
		announcement?.source === "grantor"
			? getGrantorDisplayName(grantorProfile, announcement)
			: announcement?.sourceLabel || "Scholarship Office"
	const announcementMinimumGrade = toNumericGrade(
		announcement?.minimumGrade ??
		announcement?.minGwa ??
		grantorProfile.minimumGwa ??
		grantorProfile.minGwa,
	)
	const requiredDocumentLabels = [
		announcement?.requiredDocuments?.cog === true ? "COG" : "",
		announcement?.requiredDocuments?.cor === true ? "COR" : "",
		announcement?.requiredDocuments?.applicationForm === true ? "Application Form" : "",
		...(Array.isArray(announcement?.otherRequirements)
			? announcement.otherRequirements.map((item) => {
					const name = String(item?.name || "").trim()
					if (!name) return ""
					const type = String(item?.fileType || "pdf").toUpperCase()
					const count = Math.max(1, Number.parseInt(item?.uploadCount, 10) || 1)
					return `${name} (${type}${count > 1 ? `, ${count} files` : ""})`
				})
			: []),
	].filter(Boolean)
	const activeImageUrl = imageUrls[activeImageIndex] || imageUrls[0] || ""
	const authorImageUrl =
		announcement?.source === "grantor"
			? grantorProfile.profileImageUrl ||
				grantorProfile.imageUrl ||
				announcement.profileImageUrl ||
				announcement.authorImageUrl ||
				""
			: ""
	const authorInitials = getInitials(
		grantorDisplayName,
		announcement?.source === "grantor" ? "G" : "SO",
	)
	const announcementProviderType =
		announcement?.providerType ||
		toScholarshipProviderType(
			[
				announcement?.providerLabel,
				announcement?.sourceLabel,
				announcement?.grantorName,
				announcement?.title,
			]
				.filter(Boolean)
				.join(" "),
		)
	const posterProfile =
		announcement?.source === "grantor" && announcement?.grantorId
			? grantorProfiles[announcement.grantorId] || {}
			: {}
	const isPosterApplicationsClosed = posterProfile?.applicationsBlocked === true

	useEffect(() => {
		setActiveImageIndex(0)
	}, [announcement?.id, imageUrls.length])

	const moveCarousel = useCallback(
		(direction) => {
			if (imageUrls.length <= 1) return
			setActiveImageIndex((current) => {
				const nextIndex = current + direction
				if (nextIndex < 0) return imageUrls.length - 1
				if (nextIndex >= imageUrls.length) return 0
				return nextIndex
			})
		},
		[imageUrls.length],
	)

	const applyFromAnnouncement = useCallback(async () => {
		if (!announcement || !user || !sessionState.storedUserId || isApplying) return

		const studentId = sessionState.storedUserId
		const scholarships = normalizeScholarshipList(user?.scholarships || [])
		const hasLockedScholarship = scholarships.some((item) => item.isLocked)
		const hasActiveOrPendingScholarship = scholarships.some(
			(item) => !item.isLocked && isScholarshipActiveOrPending(item.status),
		)
		const hasSameActiveApplication = scholarships.some(
			(item) =>
				item.providerType === announcementProviderType &&
				isScholarshipActiveOrPending(item.status),
		)

		if (isPreviousAnnouncement) {
			toast.info("This announcement is no longer available for applications.")
			return
		}
		if (!isAnnouncementApplication) {
			toast.info("This announcement is for information only and is not open for applications.")
			return
		}
		if (announcementMinimumGrade !== null) {
			const studentGrade = toNumericGrade(user?.gwa || user?.currentGwa || user?.generalWeightedAverage)
			if (studentGrade === null) {
				toast.info("Your current GWA is not available. Update your profile before applying.")
				return
			}
			if (studentGrade > announcementMinimumGrade) {
				toast.info(`This scholarship requires a minimum GWA of ${announcementMinimumGrade}.`)
				return
			}
		}
		const missingRequiredDocuments = getMissingAnnouncementDocuments(user, announcement)
		if (missingRequiredDocuments.length > 0) {
			toast.info(`Upload the required document${missingRequiredDocuments.length === 1 ? "" : "s"} first: ${missingRequiredDocuments.join(", ")}.`)
			return
		}
		if (studentAccessState.isScholarshipActionBlocked) {
			toast.info(getScholarshipActionBlockMessage(user || {}))
			return
		}
		if (isPosterApplicationsClosed) {
			toast.info(`Applications for ${announcement.sourceLabel || "this grantor"} are currently closed.`)
			return
		}
		if (hasLockedScholarship) {
			toast.info("Your scholarship selection is already locked for this semester.")
			return
		}
		if (hasSameActiveApplication) {
			toast.info("You already have an active application for this scholarship.")
			navigate("/student-dashboard/scholarships")
			return
		}
		if (hasActiveOrPendingScholarship) {
			toast.info("You already have an existing scholarship application. You cannot apply for another until the current one is resolved.")
			return
		}

		setIsApplying(true)
		try {
			const scholarshipName =
				announcement.providerLabel ||
				announcement.sourceLabel ||
				announcement.grantorName ||
				announcement.title ||
				"Scholarship"
			const nextRecord = {
				...buildScholarshipRecord({
					name: scholarshipName,
					provider: scholarshipName,
					studentId,
					type: "Scholarship",
					mode: "applied",
					documentUrls: getDocumentUrlsForStudent(user),
					semesterTag: getCurrentSemesterTag(),
					appliedViaAnnouncement: true,
				}),
				providerType: announcementProviderType,
				appliedViaAnnouncement: true,
				announcementId: announcement.id,
				announcementSource: announcement.source || source || "admin",
				grantorId: announcement.grantorId || "",
				minimumGrade: announcementMinimumGrade,
				requiredDocuments: announcement.requiredDocuments || {},
			}
			const nextScholarships = [...scholarships, nextRecord]

			const applicationPayload = {
				studentId,
				fname: user?.fname || "",
				mname: user?.mname || "",
				lname: user?.lname || "",
				fullName:
					[user?.fname, user?.mname, user?.lname].filter(Boolean).join(" ").trim() ||
					user?.fullName ||
					"Applicant",
				email: user?.email || "",
				cpNumber: user?.cpNumber || "",
				scholarshipId: nextRecord.id,
				applicationNumber:
					nextRecord.applicationNumber || nextRecord.requestNumber || nextRecord.id,
				scholarshipName: nextRecord.name,
				providerType: nextRecord.providerType,
				providerLabel: nextRecord.provider || nextRecord.name,
				grantorId: announcement.grantorId || "",
				announcementId: announcement.id,
				announcementSource: announcement.source || source || "admin",
				minimumGrade: announcementMinimumGrade,
				requiredDocuments: announcement.requiredDocuments || {},
				status: nextRecord.status,
				tracking: nextRecord.tracking,
				applicationDate: serverTimestamp(),
				appliedAt: serverTimestamp(),
				createdAt: serverTimestamp(),
				semesterTag: nextRecord.semesterTag,
				documentUrls: nextRecord.documentUrls,
				academicYear: getCurrentAcademicYear(),
			}
			await applyScholarshipWorkflow({
				studentId,
				studentUpdate: {
					scholarships: nextScholarships,
					updatedAt: serverTimestamp(),
				},
				application: applicationPayload,
				notifications: {
					grantor: announcement.grantorId ? {
					grantorId: announcement.grantorId,
					type: "application_submitted",
					title: "New Student Application",
					message: `${[user?.fname, user?.mname, user?.lname].filter(Boolean).join(" ").trim() || user?.fullName || "A student"} applied for ${nextRecord.name}.`,
					studentId,
					studentName:
						[user?.fname, user?.mname, user?.lname].filter(Boolean).join(" ").trim() ||
						user?.fullName ||
						"Applicant",
					announcementId: announcement.id,
					applicationNumber: nextRecord.applicationNumber || nextRecord.requestNumber || nextRecord.id,
					authorName:
						[user?.fname, user?.mname, user?.lname].filter(Boolean).join(" ").trim() ||
						user?.fullName ||
						"Applicant",
					authorImageUrl: user?.profileImageUrl || user?.imageUrl || "",
					read: false,
					createdAt: serverTimestamp(),
					} : null,
					student: {
				studentId,
				source: "personal",
				type: "scholarship_application",
				title: "Application Submitted",
				message: `Your application for ${nextRecord.name} was submitted successfully.`,
				announcementId: announcement.id,
				applicationNumber: nextRecord.applicationNumber || nextRecord.requestNumber || nextRecord.id,
				authorName: announcement.sourceLabel || announcement.grantorName || "Grantor",
				authorImageUrl: announcement.profileImageUrl || announcement.authorImageUrl || "",
				read: false,
				createdAt: serverTimestamp(),
					},
				},
			})

			setUser((prev) => ({ ...(prev || {}), scholarships: nextScholarships }))
			toast.success(`${scholarshipName} application recorded. Upload the required documents next to continue.`)
			navigate("/student-dashboard/scholarships")
		} catch (error) {
			console.error("Failed to apply from announcement:", error)
			toast.error("Failed to apply scholarship. Please try again.")
		} finally {
			setIsApplying(false)
		}
	}, [
		announcement,
		announcementProviderType,
		announcementMinimumGrade,
		isApplying,
		isAnnouncementApplication,
		isPosterApplicationsClosed,
		isPreviousAnnouncement,
		navigate,
		sessionState.storedUserId,
		source,
		studentAccessState.isScholarshipActionBlocked,
		user,
	])

	if (!userLoaded) {
		return (
			<div className={`student-portal student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
				<main className="student-shell">
					<div className="student-shell-content student-dashboard-surface">
						<div className="student-loading-panel">
							<p className="dashboard-placeholder">Loading announcement...</p>
						</div>
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
					{hasBlockedScholarshipBanner ? (
						<div className="student-block-banner" role="alert">
							<HiOutlineExclamation className="student-block-icon" aria-hidden />
							<div className="student-block-copy">
								<p className="student-block-title">Scholarship actions are currently limited</p>
								<p className="student-block-desc">{blockedScholarshipBannerCopy}</p>
							</div>
						</div>
					) : null}

					<section className="student-announcement-detail-nav">
						<button
							type="button"
							className="student-mini-btn student-mini-btn--secondary"
							onClick={() => navigate("/student-dashboard/announcements")}
						>
							<HiOutlineArrowLeft aria-hidden />
							Back to Announcements
						</button>
						{announcement && isAnnouncementApplication ? (
							<button
								type="button"
								className="student-mini-btn student-mini-btn--primary"
								onClick={applyFromAnnouncement}
								disabled={isApplying || isPreviousAnnouncement}
							>
								<HiOutlineAcademicCap aria-hidden />
								{isApplying ? "Applying..." : "Apply Now"}
							</button>
						) : null}
					</section>

					{announcement ? (
						<article className="student-announcement-detail">
							<div className="student-announcement-detail-strip">
								<span>
									<HiOutlineDocumentText aria-hidden />
									Announcement Details
								</span>
								<span>{formatRelativeDate(announcement.createdAt || announcement.date)}</span>
							</div>
							<div className="student-announcement-detail-hero">
								<div className="student-announcement-detail-media student-announcement-detail-carousel">
									{activeImageUrl ? (
										<img src={activeImageUrl} alt={announcement.title || "Announcement"} />
									) : (
										<HiOutlineInbox />
									)}
									{imageUrls.length > 1 ? (
										<>
											<button
												type="button"
												className="student-announcement-carousel-btn student-announcement-carousel-btn--prev"
												onClick={() => moveCarousel(-1)}
												aria-label="Previous announcement image"
											>
												<HiChevronLeft aria-hidden />
											</button>
											<button
												type="button"
												className="student-announcement-carousel-btn student-announcement-carousel-btn--next"
												onClick={() => moveCarousel(1)}
												aria-label="Next announcement image"
											>
												<HiChevronRight aria-hidden />
											</button>
											<div className="student-announcement-carousel-count">
												{activeImageIndex + 1} / {imageUrls.length}
											</div>
											<div className="student-announcement-carousel-thumbs">
												{imageUrls.map((imageUrl, index) => (
													<button
														key={imageUrl}
														type="button"
														className={index === activeImageIndex ? "active" : ""}
														onClick={() => setActiveImageIndex(index)}
														aria-label={`Show announcement image ${index + 1}`}
													>
														<img src={imageUrl} alt="" />
													</button>
												))}
											</div>
										</>
									) : null}
								</div>
								<div className="student-announcement-detail-copy">
									<h2>{announcement.title || "Announcement"}</h2>
									<p>
										{announcement.subtitle ||
											announcement.previewText ||
											announcement.description ||
											"Scholarship announcement details are ready for review."}
									</p>
								</div>
							</div>

							<div className="student-announcement-detail-body">
								<div className="student-announcement-detail-summary-grid">
									<section className="student-announcement-detail-summary-card">
										<HiOutlineCalendar aria-hidden />
										<div>
											<span>Application Window</span>
											<strong>{formatAnnouncementDateRange(announcement)}</strong>
										</div>
									</section>
									{isAnnouncementApplication && announcementMinimumGrade !== null ? (
										<section className="student-announcement-detail-summary-card">
											<HiOutlineAcademicCap aria-hidden />
											<div>
												<span>Minimum GWA</span>
												<strong>{announcementMinimumGrade}</strong>
											</div>
										</section>
									) : null}
									{isAnnouncementApplication && requiredDocumentLabels.length > 0 ? (
										<section className="student-announcement-detail-summary-card student-announcement-detail-summary-card--wrapping">
											<HiOutlineDocumentText aria-hidden />
											<div>
												<span>Required Documents</span>
												<strong>{requiredDocumentLabels.join(", ")}</strong>
											</div>
										</section>
									) : null}
									<section className="student-announcement-detail-summary-card">
										<HiOutlineClock aria-hidden />
										<div>
											<span>Posted</span>
											<strong>{formatRelativeDate(announcement.createdAt || announcement.date)}</strong>
										</div>
									</section>
									<section className="student-announcement-detail-summary-card student-announcement-detail-summary-card--author">
										<span className="student-announcement-author-badge student-announcement-detail-author-avatar">
											{authorImageUrl ? <img src={authorImageUrl} alt="" /> : authorInitials}
										</span>
										<div>
											<span>Posted By</span>
											<strong>{grantorDisplayName}</strong>
										</div>
									</section>
								</div>

								<section className="student-announcement-detail-panel student-announcement-detail-panel--main">
									<div className="student-announcement-detail-content-head">
										<HiOutlineDocumentText aria-hidden />
										<div>
											<h3>Announcement Details</h3>
											<p>Read the full notice before viewing the related scholarship.</p>
										</div>
									</div>
									<p>
										{announcement.content ||
											announcement.description ||
											announcement.previewText ||
											"No additional announcement details were provided."}
									</p>
								</section>

								<section className="student-announcement-detail-panel student-announcement-detail-panel--related">
									<div className="student-announcement-detail-panel-head">
										<div>
											<h3>More From {grantorDisplayName}</h3>
										</div>
									</div>
									{relatedAnnouncements.length ? (
										<div className="student-announcement-related-grid">
											{relatedAnnouncements.map((item) => {
												const relatedImage = buildAnnouncementImageList(item)[0]
												const relatedProfile = item.grantorId ? grantorProfiles[item.grantorId] || {} : {}
												const relatedAuthorName =
													item.source === "grantor"
														? getGrantorDisplayName(relatedProfile, item)
														: item.sourceLabel || "Scholarship Office"
												const relatedAuthorImage =
													relatedProfile.profileImageUrl ||
													relatedProfile.imageUrl ||
													item.profileImageUrl ||
													item.authorImageUrl ||
													""
												return (
													<button
														key={`${item.source}-${item.id}`}
														type="button"
														className="student-announcement-card student-announcement-card--action student-announcement-page-card"
														onClick={() =>
															navigate(`/student-dashboard/announcements/${item.source || "grantor"}/${encodeURIComponent(item.id)}`)
														}
													>
														<div className="student-announcement-card-media">
															{relatedImage ? <img src={relatedImage} alt={item.title || "Announcement"} /> : <HiOutlineInbox aria-hidden />}
														</div>
														<div className="student-announcement-card-head">
															<span className="student-announcement-author-badge">
																{relatedAuthorImage ? <img src={relatedAuthorImage} alt="" /> : getInitials(relatedAuthorName)}
															</span>
															<div><strong>{relatedAuthorName}</strong></div>
															<i>{formatRelativeDate(item.createdAt || item.date)}</i>
														</div>
														<div className="student-announcement-content">
															<h4>{item.title || "Announcement"}</h4>
															<p>{item.previewText || item.subtitle || item.description || "No preview text provided."}</p>
														</div>
														<span className="student-announcement-card-action">View Announcement</span>
													</button>
												)
											})}
										</div>
									) : (
										<p className="student-announcement-related-empty">No other announcements from this grantor yet.</p>
									)}
								</section>

							</div>
						</article>
					) : (
						<div className="student-announcement-detail-empty">
							<HiOutlineInbox aria-hidden />
							<h2>Announcement not found</h2>
							<p>The selected announcement may have been removed or archived by the provider.</p>
							<button
								type="button"
								className="student-mini-btn student-mini-btn--primary"
								onClick={() => navigate("/student-dashboard/announcements")}
							>
								Back to Announcements
							</button>
						</div>
					)}
				</div>
			</main>
		</div>
	)
}
