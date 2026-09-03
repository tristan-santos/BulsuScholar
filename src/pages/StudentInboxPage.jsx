import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
	collection,
	collectionGroup,
	deleteDoc,
	doc,
	onSnapshot,
	query,
	serverTimestamp,
	setDoc,
	where,
} from "../services/supabaseDataService"
import {
	HiCheck,
	HiOutlineBell,
	HiOutlineInbox,
	HiOutlineMail,
	HiOutlineTrash,
	HiOutlineX,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { db } from "../services/supabaseDataService"
import useThemeMode from "../hooks/useThemeMode"
import useArchivedGrantorIds, { isAnnouncementBlockedByGrantor } from "../hooks/useArchivedGrantorIds"
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
import "../css/StudentPortalRefresh.css"

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

function formatDateTime(value) {
	const date = value?.toDate ? value.toDate() : new Date(value)
	if (!value || Number.isNaN(date.getTime())) return "Date unavailable"
	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date)
}

function formatNotificationDetailLabel(value = "") {
	return String(value || "Notification")
		.replace(/[_-]+/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getStudentNotificationCategory(notification = {}) {
	const type = String(notification.type || notification.category || "").toLowerCase()
	if (type.includes("scholar")) return "Scholarships"
	if (type.includes("document") || type.includes("compliance")) return "Documents"
	if (type.includes("announcement")) return "Announcements"
	if (type.includes("account") || type.includes("security")) return "Account"
	return "Notifications"
}

function normalizeStudentNotification(row = {}, id = "", sourceTable = "studentNotifications") {
	const type = row.type || row.category || "notification"
	const isAnnouncement = String(type).toLowerCase().includes("announcement")
	const authorName = row.authorName || row.senderName || row.sourceLabel || row.createdByName || ""
	return {
		id,
		sourceTable,
		notificationFallbackTable: row.notificationFallbackTable || "",
		// Older account notifications can contain a stale `source: announcement`
		// value. Only announcement-typed records may use announcement navigation.
		source: isAnnouncement ? (row.source || "personal") : "personal",
		type,
		title: isAnnouncement && authorName
			? `New announcement from ${authorName}`
			: row.title || "Student Update",
		message: row.message || row.description || "You have a new student inbox notification.",
		read: row.read === true,
		createdAt: row.createdAt || row.created_at || row.updatedAt || row.updated_at || null,
		authorName,
		authorImage: row.authorImage || row.authorImageUrl || row.profileImageUrl || row.senderImageUrl || "",
		announcementId: String(row.announcementId || ""),
		announcementSource: row.announcementSource || "grantor",
		applicationNumber: row.applicationNumber || row.requestNumber || "",
		scholarshipName: row.scholarshipName || row.providerLabel || row.provider || "",
		grantorName: row.grantorName || row.authorName || row.senderName || "",
		grantorId: String(row.grantorId || row.providerId || ""),
		reason: row.reason || row.rejectionReason || "",
		notes: row.notes || row.rejectionNotes || "",
		readAt: row.readAt || row.read_at || null,
	}
}

function hasRoutableAnnouncementId(notification = {}) {
	const value = String(notification.announcementId || "").trim().toLowerCase()
	return Boolean(value && !["undefined", "null", "none"].includes(value))
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
		announcementSource: announcement.source || "admin",
		source: "announcement",
		type: "announcement",
		title: `New announcement from ${announcement.sourceLabel || (announcement.source === "grantor" ? "Grantor" : "Scholarship Office")}`,
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
	const archivedGrantorIds = useArchivedGrantorIds()
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
	const [selectedNotification, setSelectedNotification] = useState(null)
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
		const syncReadIds = window.setTimeout(() => {
			setReadAnnouncementIds(loadReadAnnouncementIds(sessionState.storedUserId))
		}, 0)
		let notificationRows = []
		let warningRows = []
		const updateInboxNotifications = () => {
			setNotifications(
				[...notificationRows, ...warningRows]
					.filter((item) => {
						const isGrantorAnnouncement = String(item.type || "").toLowerCase().includes("announcement")
						return !(isGrantorAnnouncement && archivedGrantorIds.has(String(item.grantorId || item.providerId || "")))
					})
					.sort(
					(a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
				),
			)
		}
		const unsubscribeNotifications = onSnapshot(
			query(collection(db, "studentNotifications"), where("studentId", "==", sessionState.storedUserId)),
			(snap) => {
				notificationRows = snap.docs.map((item) =>
					normalizeStudentNotification(item.data() || {}, item.id, "studentNotifications"),
				)
				updateInboxNotifications()
			},
			() => {
				notificationRows = []
				updateInboxNotifications()
			},
		)
		const unsubscribeWarnings = onSnapshot(
			query(collection(db, "studentWarning"), where("studentId", "==", sessionState.storedUserId)),
			(snap) => {
				warningRows = snap.docs
					.map((item) => normalizeStudentNotification(item.data() || {}, item.id, "studentWarning"))
					.filter((item) => item.source === "personal" || item.notificationFallbackTable === "student_warnings")
				updateInboxNotifications()
			},
			() => {
				warningRows = []
				updateInboxNotifications()
			},
		)
		return () => {
			window.clearTimeout(syncReadIds)
			unsubscribeNotifications()
			unsubscribeWarnings()
		}
	}, [archivedGrantorIds, sessionState.storedUserId])

	useEffect(() => {
		let adminRows = []
		let grantorRows = []

		const updateAnnouncements = () => {
			setAnnouncements(
				sortStudentAnnouncements([...adminRows, ...grantorRows])
					.filter((item) => !isAnnouncementBlockedByGrantor(item, archivedGrantorIds))
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
				grantorRows = snap.docs.map((item) => {
					const raw = item.data() || {}
					return normalizeStudentAnnouncement({
						...raw,
						grantorId: raw.grantorId || item.ref?.parent?.parent?.id || "",
					}, item.id, "grantor")
				})
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
	}, [archivedGrantorIds])

	useEffect(() => {
		if (!profileMenuOpen) return undefined
		const handlePointerDown = (event) => {
			if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false)
		}
		document.addEventListener("mousedown", handlePointerDown)
		return () => document.removeEventListener("mousedown", handlePointerDown)
	}, [profileMenuOpen])

	const inboxItems = useMemo(() => {
		const notifiedAnnouncementIds = new Set(
			notifications
				.filter((item) => item.announcementId)
				.map((item) => String(item.announcementId)),
		)
		const announcementItems = announcements
			.filter((announcement) => !notifiedAnnouncementIds.has(String(announcement.id || "")))
			.map((announcement) => announcementToInboxItem(announcement, readAnnouncementIds))
		return [...notifications, ...announcementItems].sort(
			(a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
		)
	}, [announcements, notifications, readAnnouncementIds])
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
	const selectedNotificationDetails = useMemo(() => {
		if (!selectedNotification) return []
		const detailKeys = [
			["applicationNumber", "Application Number"],
			["scholarshipName", "Scholarship"],
			["grantorName", "Grantor"],
			["reason", "Reason"],
			["notes", "Notes"],
			["announcementId", "Announcement ID"],
		]
		return detailKeys
			.map(([key, label]) => {
				const value = selectedNotification[key]
				if (value == null || value === "") return null
				return { key, label, value }
			})
			.filter(Boolean)
	}, [selectedNotification])
	const markNotificationRead = async (notification) => {
		if (notification.source !== "personal" || !notification?.id || notification.read === true) return
		try {
			const updateData = {
				read: true,
				readAt: serverTimestamp(),
			}
			if (notification.sourceTable === "studentWarning") {
				await setDoc(doc(db, "studentWarning", notification.id), updateData, { merge: true })
			} else {
				await updateStudentNotification(notification.id, updateData)
			}
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
					item.sourceTable === "studentWarning"
						? setDoc(doc(db, "studentWarning", item.id), {
								read: true,
								readAt: serverTimestamp(),
							}, { merge: true })
						: updateStudentNotification(item.id, {
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
			if (notification.sourceTable === "studentWarning") {
				await deleteDoc(doc(db, "studentWarning", notification.id))
			} else {
				await deleteStudentNotification(notification.id)
			}
			if (selectedNotification?.id === notification.id) setSelectedNotification(null)
		} catch (error) {
			console.error("Unable to delete student notification.", error)
			toast.error("Unable to delete this inbox message.")
		}
	}

	const openInboxItem = async (notification) => {
		const isAnnouncement = String(notification.type || "").toLowerCase().includes("announcement")
		if (notification.source === "personal") {
			await markNotificationRead(notification)
			if (isAnnouncement && hasRoutableAnnouncementId(notification)) {
				const source = encodeURIComponent(notification.announcementSource || "grantor")
				const announcementId = encodeURIComponent(notification.announcementId)
				navigate(`/student-dashboard/announcements/${source}/${announcementId}`)
				return
			}
			setSelectedNotification({ ...notification, read: true, readAt: notification.readAt || new Date().toISOString() })
			return
		}
		if (!isAnnouncement || !hasRoutableAnnouncementId(notification)) {
			setSelectedNotification({ ...notification, source: "personal", read: true, readAt: notification.readAt || new Date().toISOString() })
			return
		}
		const nextIds = [...readAnnouncementIds, notification.announcementId]
		saveReadAnnouncementIds(sessionState.storedUserId, nextIds)
		setReadAnnouncementIds([...new Set(nextIds.map(String))])
		const source = encodeURIComponent(notification.announcementSource || "admin")
		const announcementId = encodeURIComponent(notification.announcementId)
		navigate(`/student-dashboard/announcements/${source}/${announcementId}`)
	}

	const renderInboxItemIcon = (notification) => {
		if (isSystemInboxItem(notification)) return <HiOutlineBell />
		if (notification.authorImage) return <img src={notification.authorImage} alt="" />
		return <b>{getAuthorInitials(notification.authorName || notification.title)}</b>
	}

	if (!userLoaded) {
		return (
			<div className={`student-portal student-dashboard student-portal-view student-portal-view--inbox ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
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
		<div className={`student-portal student-dashboard student-portal-view student-portal-view--inbox ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
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
			{selectedNotification ? (
				<div className="student-inbox-detail-backdrop" role="presentation" onMouseDown={(event) => {
					if (event.target === event.currentTarget) setSelectedNotification(null)
				}}>
					<section className="student-inbox-detail-modal" role="dialog" aria-modal="true" aria-labelledby="student-inbox-detail-title" onMouseDown={(event) => event.stopPropagation()}>
						<header className="student-inbox-detail-head">
							<div className="student-inbox-detail-title">
								<span className="student-inbox-detail-icon">{renderInboxItemIcon(selectedNotification)}</span>
								<div>
									<span>{getStudentNotificationCategory(selectedNotification)}</span>
									<h3 id="student-inbox-detail-title">{selectedNotification.title || "Inbox Message"}</h3>
								</div>
							</div>
							<button type="button" onClick={() => setSelectedNotification(null)} aria-label="Close inbox details">
								<HiOutlineX aria-hidden />
							</button>
						</header>
						<div className="student-inbox-detail-meta">
							<p><span>Received</span><strong>{formatDateTime(selectedNotification.createdAt)}</strong></p>
							<p><span>Status</span><strong>{selectedNotification.read === true ? "Read" : "Unread"}</strong></p>
							{selectedNotification.readAt ? (
								<p><span>Read At</span><strong>{formatDateTime(selectedNotification.readAt)}</strong></p>
							) : null}
							<p><span>Type</span><strong>{formatNotificationDetailLabel(selectedNotification.type)}</strong></p>
						</div>
						<div className="student-inbox-detail-message">
							<span>Full Message</span>
							<p>{selectedNotification.message || "No message content was provided for this inbox item."}</p>
						</div>
						<div className="student-inbox-detail-grid">
							<p><span>Author Name</span><strong>{selectedNotification.authorName || selectedNotification.grantorName || "BulsuScholar"}</strong></p>
							{selectedNotificationDetails.map((item) => (
								<p key={item.key}><span>{item.label}</span><strong>{item.value}</strong></p>
							))}
						</div>
						<footer className="student-inbox-detail-actions">
							<button type="button" className="student-inbox-detail-delete" onClick={async () => { await deleteNotification(selectedNotification) }}>
								<HiOutlineTrash aria-hidden /> Delete Message
							</button>
							<button type="button" className="student-inbox-detail-close" onClick={() => setSelectedNotification(null)}>Close</button>
						</footer>
					</section>
				</div>
			) : null}
		</div>
	)
}
