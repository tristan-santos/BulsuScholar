import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
	collection,
	collectionGroup,
	doc,
	onSnapshot,
	query,
	serverTimestamp,
	where,
} from "../services/supabaseDataService"
import {
	HiCheck,
	HiOutlineBell,
	HiOutlineInbox,
	HiOutlineMail,
	HiOutlineTrash,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { db } from "../services/supabaseDataService"
import useThemeMode from "../hooks/useThemeMode"
import {
	isPreviousStudentAnnouncement,
	normalizeStudentAnnouncement,
	sortStudentAnnouncements,
} from "../services/announcementService"
import { GRANTOR_SUBCOLLECTIONS } from "../services/grantorService"
import {
	getPortalAccessBlockMessage,
	getStudentAccessState,
} from "../services/studentAccessService"
import {
	deleteStudentNotification,
	updateStudentNotification,
} from "../services/notificationService"
import StudentTopbar from "../components/StudentTopbar"
import "../css/StudentDashboard.css"

function formatRelativeDate(value) {
	const date = value?.toDate ? value.toDate() : new Date(value)
	if (!value || Number.isNaN(date.getTime())) return "Date unavailable"
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

function getStudentNotificationCategory(notification = {}) {
	const type = String(notification.type || notification.category || "").toLowerCase()
	if (type.includes("scholar")) return "Scholarships"
	if (type.includes("document") || type.includes("compliance")) return "Documents"
	if (type.includes("announcement")) return "Announcements"
	if (type.includes("account") || type.includes("security")) return "Account"
	return "Notifications"
}

function normalizeStudentNotification(row = {}, id = "") {
	return {
		id,
		source: row.source || "personal",
		type: row.type || row.category || "notification",
		title: row.title || "Student Update",
		message: row.message || row.description || "You have a new student inbox notification.",
		read: row.read === true,
		createdAt: row.createdAt || row.created_at || row.updatedAt || row.updated_at || null,
		authorName: row.authorName || row.senderName || row.sourceLabel || row.createdByName || "",
		authorImage: row.authorImage || row.authorImageUrl || row.profileImageUrl || row.senderImageUrl || "",
	}
}

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

function saveReadAnnouncementIds(studentId = "", ids = []) {
	const key = getReadAnnouncementStorageKey(studentId)
	localStorage.setItem(key, JSON.stringify([...new Set(ids.map(String))]))
	window.dispatchEvent(new StorageEvent("storage", { key }))
}

function announcementToInboxItem(announcement = {}, readAnnouncementIds = []) {
	const announcementId = String(announcement.id || "")
	return {
		id: `announcement-${announcementId}`,
		announcementId,
		source: "announcement",
		type: "announcement",
		title: announcement.title || "Announcement",
		message:
			announcement.previewText ||
			announcement.content ||
			announcement.description ||
			"New scholarship announcement is available.",
		read: readAnnouncementIds.includes(announcementId),
		createdAt: announcement.createdAt || announcement.date || null,
		providerType: announcement.providerType || "",
		authorName: announcement.sourceLabel || (announcement.source === "grantor" ? "Grantor" : "System"),
		authorImage: announcement.profileImageUrl || announcement.authorImageUrl || "",
		isSystem: announcement.source !== "grantor" && !announcement.profileImageUrl && !announcement.authorImageUrl,
	}
}

function getAuthorInitials(name = "") {
	const parts = String(name || "").trim().split(/\s+/).filter(Boolean)
	if (parts.length === 0) return "SO"
	return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")
}

function isSystemInboxItem(notification = {}) {
	const source = String(notification.source || "").toLowerCase()
	const type = String(notification.type || "").toLowerCase()
	return notification.isSystem === true || source === "system" || type.includes("system")
}

export default function StudentInboxPage() {
	const navigate = useNavigate()
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
	const [notifications, setNotifications] = useState([])
	const [announcements, setAnnouncements] = useState([])
	const [readAnnouncementIds, setReadAnnouncementIds] = useState(() =>
		loadReadAnnouncementIds(sessionStorage.getItem("bulsuscholar_userId")),
	)
	const [profileMenuOpen, setProfileMenuOpen] = useState(false)
	const { theme, setTheme } = useThemeMode()
	const forcedLogoutRef = useRef(false)
	const profileMenuRef = useRef(null)

	useEffect(() => {
		if (!sessionState.isStudent || !sessionState.storedUserId) return undefined

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
		if (userLoaded && !user) navigate("/", { replace: true })
	}, [navigate, user, userLoaded])

	useEffect(() => {
		if (!sessionState.storedUserId) return undefined
		setReadAnnouncementIds(loadReadAnnouncementIds(sessionState.storedUserId))
		return onSnapshot(
			query(collection(db, "studentNotifications"), where("studentId", "==", sessionState.storedUserId)),
			(snap) => {
				setNotifications(
					snap.docs
						.map((item) => normalizeStudentNotification(item.data() || {}, item.id))
						.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
				)
			},
			() => setNotifications([]),
		)
	}, [sessionState.storedUserId])

	useEffect(() => {
		let adminRows = []
		let grantorRows = []

		const updateAnnouncements = () => {
			setAnnouncements(
				sortStudentAnnouncements([...adminRows, ...grantorRows])
					.filter((item) => !isPreviousStudentAnnouncement(item))
					.slice(0, 8),
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
		if (!profileMenuOpen) return undefined
		const handlePointerDown = (event) => {
			if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false)
		}
		document.addEventListener("mousedown", handlePointerDown)
		return () => document.removeEventListener("mousedown", handlePointerDown)
	}, [profileMenuOpen])

	const inboxItems = useMemo(
		() => notifications.length > 0
			? notifications
			: announcements.map((announcement) => announcementToInboxItem(announcement, readAnnouncementIds)),
		[announcements, notifications, readAnnouncementIds],
	)
	const unreadItems = useMemo(() => inboxItems.filter((item) => item.read !== true), [inboxItems])
	const groupedInboxItems = useMemo(() => {
		const groups = new Map()
		inboxItems.forEach((item) => {
			const category = getStudentNotificationCategory(item)
			if (!groups.has(category)) groups.set(category, [])
			groups.get(category).push(item)
		})
		return [...groups.entries()].map(([category, items]) => ({ category, items }))
	}, [inboxItems])
	const avatarUrl = user?.profileImageUrl || ""
	const userInitials = `${user?.fname?.[0]?.toUpperCase() || ""}${user?.lname?.[0]?.toUpperCase() || ""}` || "ST"
	const fullName = [user?.fname, user?.mname, user?.lname].filter(Boolean).join(" ") || "Student"
	const studentEmail = user?.email ? String(user.email).trim().toLowerCase() : "Student account"

	const handleLogout = useCallback(() => {
		sessionStorage.removeItem("bulsuscholar_userId")
		sessionStorage.removeItem("bulsuscholar_userType")
		navigate("/", { replace: true })
	}, [navigate])

	const markNotificationRead = async (notification) => {
		if (notification.source !== "personal" || !notification?.id || notification.read === true) return
		try {
			await updateStudentNotification(notification.id, {
				read: true,
				readAt: serverTimestamp(),
			})
		} catch (error) {
			console.error("Unable to mark student notification as read.", error)
			toast.error("Unable to update this inbox message.")
		}
	}

	const markAllNotificationsRead = async () => {
		const personalUnread = unreadItems.filter((item) => item.source === "personal")
		const announcementUnread = unreadItems.filter((item) => item.source === "announcement")
		if (personalUnread.length === 0 && announcementUnread.length === 0) return
		try {
			if (personalUnread.length > 0) {
				await Promise.all(personalUnread.map((item) =>
					updateStudentNotification(item.id, {
						read: true,
						readAt: serverTimestamp(),
					}),
				))
			}
			if (announcementUnread.length > 0) {
				const nextIds = [...readAnnouncementIds, ...announcementUnread.map((item) => item.announcementId)]
				saveReadAnnouncementIds(sessionState.storedUserId, nextIds)
				setReadAnnouncementIds([...new Set(nextIds.map(String))])
			}
		} catch (error) {
			console.error("Unable to mark student notifications as read.", error)
			toast.error("Unable to update inbox messages.")
		}
	}

	const deleteNotification = async (notification) => {
		if (notification.source !== "personal" || !notification?.id) return
		try {
			await deleteStudentNotification(notification.id)
		} catch (error) {
			console.error("Unable to delete student notification.", error)
			toast.error("Unable to delete this inbox message.")
		}
	}

	const openInboxItem = (notification) => {
		if (notification.source === "personal") {
			markNotificationRead(notification)
			return
		}
		const nextIds = [...readAnnouncementIds, notification.announcementId]
		saveReadAnnouncementIds(sessionState.storedUserId, nextIds)
		setReadAnnouncementIds([...new Set(nextIds.map(String))])
		navigate("/student-dashboard/announcements", {
			state: { selectedAnnouncementId: notification.announcementId },
		})
	}

	const renderInboxItemIcon = (notification) => {
		if (isSystemInboxItem(notification)) return <HiOutlineBell />
		if (notification.authorImage) return <img src={notification.authorImage} alt="" />
		return <b>{getAuthorInitials(notification.authorName || notification.title)}</b>
	}

	if (!userLoaded) {
		return (
			<div className={`student-portal student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
				<main className="student-shell">
					<div className="student-shell-content student-dashboard-surface">
						<div className="student-loading-panel">
							<p className="dashboard-placeholder">Loading inbox...</p>
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
					<section className="student-inbox-panel">
						<header className="student-inbox-head">
							<div className="student-inbox-title"><h2>Messages</h2>{unreadItems.length > 0 ? <span>{unreadItems.length}</span> : null}</div>
							<div className="student-inbox-actions">
								<button type="button" className="student-inbox-mark-read" onClick={markAllNotificationsRead} disabled={unreadItems.length === 0}>Mark all read</button>
							</div>
						</header>
						<div className="student-inbox-list">
							{inboxItems.length === 0 ? (
								<div className="student-modern-empty"><HiOutlineInbox /><strong>Your inbox is empty.</strong><p>Personal student messages will appear here.</p></div>
							) : groupedInboxItems.map((group) => (
								<section key={group.category} className="student-inbox-group">
									<header><span><HiOutlineMail />{group.category}</span><small>{group.items.length} {group.items.length === 1 ? "notification" : "notifications"}</small></header>
									{group.items.map((notification) => (
										<article key={notification.id} className={`student-inbox-item ${notification.read === true ? "" : "unread"}`}>
											<button type="button" className="student-inbox-item-main" onClick={() => openInboxItem(notification)}>
												<span className="student-inbox-item-icon">{renderInboxItemIcon(notification)}</span>
												<span className="student-inbox-item-copy"><strong>{notification.title}</strong><small>{notification.message}</small></span>
											</button>
											<div className="student-inbox-item-actions">
												<time>{formatRelativeDate(notification.createdAt)}</time>
												{notification.source === "personal" ? <button type="button" onClick={() => deleteNotification(notification)} aria-label="Delete notification"><HiOutlineTrash /></button> : null}
												{notification.read !== true ? <i aria-label="Unread" /> : <HiCheck className="student-inbox-read-check" aria-label="Read" />}
											</div>
										</article>
									))}
								</section>
							))}
						</div>
					</section>
				</div>
			</main>
		</div>
	)
}
