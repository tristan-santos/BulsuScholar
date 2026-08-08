import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
	HiOutlineAcademicCap,
	HiOutlineBell,
	HiOutlineHome,
	HiOutlineInbox,
	HiOutlineLogout,
	HiOutlineMenu,
	HiOutlineMoon,
	HiOutlineSun,
	HiOutlineUser,
} from "react-icons/hi"
import {
	collection,
	collectionGroup,
	query,
	where,
	onSnapshot,
} from "../services/supabaseDataService"
import { db } from "../services/supabaseDataService"
import {
	isPreviousStudentAnnouncement,
	normalizeStudentAnnouncement,
	sortStudentAnnouncements,
} from "../services/announcementService"
import { GRANTOR_SUBCOLLECTIONS } from "../services/grantorService"
import logo2 from "../assets/logo2.png"

function getReadAnnouncementStorageKey(studentId = "") {
	return `bulsuscholar_student_read_announcements_${studentId || "guest"}`
}

function loadReadAnnouncementIds(studentId = "") {
	try {
		const raw = localStorage.getItem(getReadAnnouncementStorageKey(studentId))
		const parsed = JSON.parse(raw || "[]")
		return Array.isArray(parsed) ? parsed.map(String) : []
	} catch {
		return []
	}
}

function getStudentName(user = {}) {
	return [user?.fname, user?.mname, user?.lname].filter(Boolean).join(" ").trim() || "Student"
}

function getStudentInitials(user = {}) {
	const name = getStudentName(user)
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("")
	return initials || "ST"
}

export default function StudentTopbar({ user, theme, setTheme }) {
	const navigate = useNavigate()
	const location = useLocation()
	const currentPath = location.pathname.replace(/\/+$/, "") || "/"
	const isActiveRoute = useCallback(
		(path, exact = false) => {
			const normalizedPath = path.replace(/\/+$/, "") || "/"
			return exact
				? currentPath === normalizedPath
				: currentPath === normalizedPath || currentPath.startsWith(`${normalizedPath}/`)
		},
		[currentPath],
	)
	const studentId = sessionStorage.getItem("bulsuscholar_userId") || ""
	const [profileMenuOpen, setProfileMenuOpen] = useState(false)
	const [studentNotifications, setStudentNotifications] = useState([])
	const [announcements, setAnnouncements] = useState([])
	const [readAnnouncementIds, setReadAnnouncementIds] = useState(() => loadReadAnnouncementIds(studentId))
	const profileMenuRef = useRef(null)

	useEffect(() => {
		const handleClickOutside = (event) => {
			if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
				setProfileMenuOpen(false)
			}
		}
		document.addEventListener("mousedown", handleClickOutside)
		return () => document.removeEventListener("mousedown", handleClickOutside)
	}, [])

	useEffect(() => {
		if (!studentId) return undefined
		const syncReadIds = window.setTimeout(() => {
			setReadAnnouncementIds(loadReadAnnouncementIds(studentId))
		}, 0)
		let notificationRows = []
		let warningRows = []
		const updateStudentNotificationRows = () => {
			setStudentNotifications(
				[...notificationRows, ...warningRows].sort(
					(a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0),
				),
			)
		}
		const unsubscribeNotifications = onSnapshot(
			query(collection(db, "studentNotifications"), where("studentId", "==", studentId)),
			(snap) => {
				notificationRows = snap.docs.map((item) => ({ id: item.id, sourceTable: "studentNotifications", ...(item.data() || {}) }))
				updateStudentNotificationRows()
			},
			() => {
				notificationRows = []
				updateStudentNotificationRows()
			},
		)
		const unsubscribeWarnings = onSnapshot(
			query(collection(db, "studentWarning"), where("studentId", "==", studentId)),
			(snap) => {
				warningRows = snap.docs
					.map((item) => ({ id: item.id, sourceTable: "studentWarning", ...(item.data() || {}) }))
					.filter((item) => item.source === "personal" || item.notificationFallbackTable === "student_warnings")
				updateStudentNotificationRows()
			},
			() => {
				warningRows = []
				updateStudentNotificationRows()
			},
		)
		return () => {
			window.clearTimeout(syncReadIds)
			unsubscribeNotifications()
			unsubscribeWarnings()
		}
	}, [studentId])

	useEffect(() => {
		let adminRows = []
		let grantorRows = []

		const updateAnnouncements = () => {
			setAnnouncements(
				sortStudentAnnouncements([...adminRows, ...grantorRows]).filter(
					(item) => !isPreviousStudentAnnouncement(item),
				),
			)
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
		const handleStorage = (event) => {
			if (event.key === getReadAnnouncementStorageKey(studentId)) {
				setReadAnnouncementIds(loadReadAnnouncementIds(studentId))
			}
		}
		window.addEventListener("storage", handleStorage)
		return () => window.removeEventListener("storage", handleStorage)
	}, [studentId])

	const unreadStudentNotifications = useMemo(
		() => studentNotifications.filter((item) => item.read !== true),
		[studentNotifications],
	)
	const unreadAnnouncementCount = useMemo(
		() => announcements.filter((item) => !readAnnouncementIds.includes(String(item.id || ""))).length,
		[announcements, readAnnouncementIds],
	)
	const inboxBadgeCount = studentNotifications.length > 0 ? unreadStudentNotifications.length : unreadAnnouncementCount
	const avatarUrl = user?.profileImageUrl || ""
	const userInitials = getStudentInitials(user || {})
	const fullName = getStudentName(user || {})
	const studentEmail = user?.email ? String(user.email).trim().toLowerCase() : "Student account"

	const handleLogout = useCallback(() => {
		sessionStorage.removeItem("bulsuscholar_userId")
		sessionStorage.removeItem("bulsuscholar_userType")
		setProfileMenuOpen(false)
		navigate("/", { replace: true })
	}, [navigate])

	const goTo = useCallback(
		(path) => {
			setProfileMenuOpen(false)
			navigate(path)
		},
		[navigate],
	)

	return (
		<header className="student-header">
			<div className="student-header-top-stripe"></div>
			<div className="student-header-content">
				<div className="student-header-left">
					<Link to="/student-dashboard" className="student-header-home-link" aria-label="Go to dashboard">
						<img src={logo2} alt="BulsuScholar" className="student-header-logo" />
						<h1 className="student-header-brand">BulsuScholar</h1>
					</Link>
				</div>
				<div className="student-header-right">
					<button
						type="button"
						className={`student-header-notification-btn ${isActiveRoute("/student-dashboard/inbox") ? "active" : ""}`}
						aria-label="Open inbox"
						aria-current={isActiveRoute("/student-dashboard/inbox") ? "page" : undefined}
						onClick={() => navigate("/student-dashboard/inbox")}
					>
						<HiOutlineInbox className="student-header-notification-icon" aria-hidden />
						{inboxBadgeCount > 0 ? (
							<span className="student-header-badge">{inboxBadgeCount > 99 ? "99+" : inboxBadgeCount}</span>
						) : null}
					</button>
					<div className="student-header-user-wrap" ref={profileMenuRef}>
						<button
							type="button"
							className="student-header-user-btn"
							onClick={() => setProfileMenuOpen((open) => !open)}
							aria-label="Open student menu"
							aria-expanded={profileMenuOpen}
						>
							<span className="student-header-avatar">
								{avatarUrl ? <img src={avatarUrl} alt="" className="student-header-avatar-image-mini" /> : userInitials}
							</span>
							<HiOutlineMenu className="student-header-menu-icon" aria-hidden />
						</button>
						{profileMenuOpen ? (
							<div className="student-verified-dropdown student-header-profile-menu" role="menu">
								<div className="student-verified-dropdown-user">
									<span className="student-verified-dropdown-avatar">
										{avatarUrl ? <img src={avatarUrl} alt="" className="student-header-avatar-image-mini" /> : userInitials}
									</span>
									<div className="student-verified-dropdown-user-info">
										<p className="student-verified-dropdown-name">{fullName}</p>
										<p className="student-verified-dropdown-email">{studentEmail}</p>
									</div>
								</div>
								<nav className="student-verified-dropdown-nav">
									<button type="button" className={`student-verified-dropdown-item ${isActiveRoute("/student-dashboard", true) ? "active" : ""}`} aria-current={isActiveRoute("/student-dashboard", true) ? "page" : undefined} onClick={() => goTo("/student-dashboard")}>
										<HiOutlineHome className="student-verified-dropdown-item-icon" />
										Dashboard
									</button>
									<button type="button" className={`student-verified-dropdown-item ${isActiveRoute("/student-dashboard/profile") ? "active" : ""}`} aria-current={isActiveRoute("/student-dashboard/profile") ? "page" : undefined} onClick={() => goTo("/student-dashboard/profile")}>
										<HiOutlineUser className="student-verified-dropdown-item-icon" />
										My Profile
									</button>
									<button type="button" className={`student-verified-dropdown-item ${isActiveRoute("/student-dashboard/announcements") ? "active" : ""}`} aria-current={isActiveRoute("/student-dashboard/announcements") ? "page" : undefined} onClick={() => goTo("/student-dashboard/announcements")}>
										<HiOutlineBell className="student-verified-dropdown-item-icon" />
										Announcements
									</button>
									<button type="button" className={`student-verified-dropdown-item ${isActiveRoute("/student-dashboard/scholarships") ? "active" : ""}`} aria-current={isActiveRoute("/student-dashboard/scholarships") ? "page" : undefined} onClick={() => goTo("/student-dashboard/scholarships")}>
										<HiOutlineAcademicCap className="student-verified-dropdown-item-icon" />
										Scholarships
									</button>
								</nav>
								<div className="student-verified-dropdown-theme">
									<span className="student-verified-dropdown-theme-label">Theme</span>
									<div className="student-verified-dropdown-theme-btns">
										<button
											type="button"
											className={`student-verified-dropdown-theme-btn ${theme === "light" ? "active" : ""}`}
											onClick={() => setTheme("light")}
										>
											<HiOutlineSun />
											Light
										</button>
										<button
											type="button"
											className={`student-verified-dropdown-theme-btn ${theme === "dark" ? "active" : ""}`}
											onClick={() => setTheme("dark")}
										>
											<HiOutlineMoon />
											Dark
										</button>
									</div>
								</div>
								<button type="button" className="student-verified-dropdown-logout" onClick={handleLogout}>
									<HiOutlineLogout className="student-verified-dropdown-logout-icon" />
									Logout
								</button>
							</div>
						) : null}
					</div>
				</div>
			</div>
		</header>
	)
}
