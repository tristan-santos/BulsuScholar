/**
 * Student Scholarships Page - Apply-only scholarship flow with SOE request locking rules.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	query,
	serverTimestamp,
	setDoc,
	where,
} from "firebase/firestore"
import { toast } from "react-toastify"
import {
	HiMenu,
	HiOutlineAcademicCap,
	HiOutlineCheckCircle,
	HiOutlineClock,
	HiOutlineDocumentText,
	HiOutlineLogout,
	HiOutlineMoon,
	HiOutlineSun,
	HiOutlineUserCircle,
	HiX,
} from "react-icons/hi"
import { db } from "../../firebase"
import logo2 from "../assets/logo2.png"
import "../css/AdminDashboard.css"
import "../css/StudentDashboard.css"
import useThemeMode from "../hooks/useThemeMode"
import {
	buildScholarshipRecord,
	getCurrentAcademicYear,
	getCurrentSemesterTag,
	getDocumentUrlsForStudent,
	getScholarshipCatalog,
	getSoeStatusForScholarship,
	normalizeScholarshipList,
	shouldWarnMultipleScholarships,
	shouldWarnZeroScholarships,
	toScholarshipProviderType,
	validateScholarshipDocuments,
	withCurrentSemesterTag,
} from "../services/scholarshipService"
import { downloadSoePdfBytes, exportSoePdfDocument } from "../services/soeService"

const SOE_EXPORT_LOCK_MONTHS = 6

function checkValidated(userData) {
	if (!userData) return false
	return Boolean(
		userData.isValidated === true ||
			userData.isValidated === "true" ||
			userData.validated === true ||
			userData.validated === "true" ||
			(userData.validatedAt != null && userData.validatedAt !== ""),
	)
}

function isOlderThanSevenDays(value) {
	if (!value) return false
	const date = value?.toDate ? value.toDate() : new Date(value)
	if (Number.isNaN(date.getTime())) return false
	const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
	return Date.now() - date.getTime() > sevenDaysMs
}

function isScholarshipActiveOrPending(status = "") {
	const normalized = String(status).toLowerCase()
	if (!normalized) return true
	return ![
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

function toJsDate(value) {
	if (!value) return null
	if (value?.toDate) return value.toDate()
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

function addMonths(date, months) {
	const next = new Date(date)
	next.setMonth(next.getMonth() + months)
	return next
}

export default function StudentScholarshipsPage() {
	const navigate = useNavigate()
	const [user, setUser] = useState(null)
	const [userLoaded, setUserLoaded] = useState(false)
	const [userId, setUserId] = useState("")
	const [userMenuOpen, setUserMenuOpen] = useState(false)
	const [isMutating, setIsMutating] = useState(false)
	const [confirmTarget, setConfirmTarget] = useState(null)
	const [expenseModalTarget, setExpenseModalTarget] = useState(null)
	const [soeExpenses, setSoeExpenses] = useState([{ label: "", amount: "" }])
	const [isExportingSoe, setIsExportingSoe] = useState(false)
	const [isDownloadingSoe, setIsDownloadingSoe] = useState(false)
	const [isSavingExpensePreset, setIsSavingExpensePreset] = useState(false)
	const [isSoePreviewOpen, setIsSoePreviewOpen] = useState(false)
	const [soePreviewUrl, setSoePreviewUrl] = useState("")
	const [soePreviewBytes, setSoePreviewBytes] = useState(null)
	const [soePreviewRegistration, setSoePreviewRegistration] = useState("")
	const { theme, setTheme } = useThemeMode()
	const userMenuRef = useRef(null)

	const scholarshipCatalog = useMemo(() => getScholarshipCatalog(), [])
	const scholarships = useMemo(
		() => normalizeScholarshipList(user?.scholarships || []),
		[user?.scholarships],
	)
	const hasLockedScholarship = scholarships.some((item) => item.isLocked)
	const lockedScholarship = scholarships.find((item) => item.isLocked) || null
	const activeOrPendingScholarships = scholarships.filter((item) =>
		isScholarshipActiveOrPending(item.status),
	)
	const hasActiveOrPendingScholarship = activeOrPendingScholarships.length > 0
	const activeOrPendingProviderTypes = new Set(
		activeOrPendingScholarships.map((item) => item.providerType),
	)
	const applicationLockTooltip =
		"You already have an existing scholarship application. You cannot apply for another until the current one is resolved."
	const isValidated = checkValidated(user)
	const avatarUrl = user?.profileImageUrl || ""
	const studentNumber = userId

	const getUserInitials = () => {
		const f = user?.fname?.[0]?.toUpperCase() || ""
		const l = user?.lname?.[0]?.toUpperCase() || ""
		return f + l || "ST"
	}

	useEffect(() => {
		function handleClickOutside(e) {
			if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
				setUserMenuOpen(false)
			}
		}
		if (userMenuOpen) {
			document.addEventListener("mousedown", handleClickOutside)
			return () => document.removeEventListener("mousedown", handleClickOutside)
		}
	}, [userMenuOpen])

	useEffect(() => {
		const storedUserId = sessionStorage.getItem("bulsuscholar_userId")
		const storedType = sessionStorage.getItem("bulsuscholar_userType")

		if (!storedUserId || storedType !== "student") {
			setUserLoaded(true)
			return
		}

		setUserId(storedUserId)
		getDoc(doc(db, "students", storedUserId))
			.then(async (snap) => {
				if (!snap.exists()) {
					setUserLoaded(true)
					return
				}
				const data = snap.data() || {}
				const normalized = normalizeScholarshipList(data.scholarships || [])
				const corFile = withCurrentSemesterTag(data.corFile)
				const cogFile = withCurrentSemesterTag(data.cogFile)
				const shouldSyncScholarships = (data.scholarships || []).some(
					(item) => !item?.id || !item?.status || !item?.providerType,
				)
				const shouldSyncDocs =
					Boolean(data.corFile?.url && !data.corFile?.semesterTag) ||
					Boolean(data.cogFile?.url && !data.cogFile?.semesterTag)

				if (shouldSyncScholarships || shouldSyncDocs) {
					await setDoc(
						doc(db, "students", storedUserId),
						{
							scholarships: normalized,
							corFile,
							cogFile,
							updatedAt: serverTimestamp(),
						},
						{ merge: true },
					)
				}

				setUser({
					...data,
					scholarships: normalized,
					corFile,
					cogFile,
				})
				setUserLoaded(true)
			})
			.catch(() => setUserLoaded(true))
	}, [])

	useEffect(() => {
		if (userLoaded && (!user || !userId)) {
			navigate("/", { replace: true })
		}
	}, [userLoaded, user, userId, navigate])

	useEffect(() => {
		return () => {
			if (soePreviewUrl) {
				URL.revokeObjectURL(soePreviewUrl)
			}
		}
	}, [soePreviewUrl])

	const syncWarnings = useCallback(
		async (scholarshipList) => {
			if (!userId || !user) return

			const warningsRef = collection(db, "studentWarning")
			const basePayload = {
				studentId: userId,
				studentName: [user.fname, user.mname, user.lname].filter(Boolean).join(" ") || "Student",
				savedScholarshipsCount: scholarshipList.length,
				lastActive: serverTimestamp(),
			}

			const zeroId = `${userId}_zero_scholarships`
			if (shouldWarnZeroScholarships(scholarshipList)) {
				await setDoc(doc(warningsRef, zeroId), {
					...basePayload,
					warningType: "zero_scholarships",
				})
			} else {
				await deleteDoc(doc(warningsRef, zeroId)).catch(() => {})
			}

			const multipleId = `${userId}_multiple_scholarships`
			if (shouldWarnMultipleScholarships(scholarshipList)) {
				await setDoc(doc(warningsRef, multipleId), {
					...basePayload,
					warningType: "multiple_scholarships",
				})
			} else {
				await deleteDoc(doc(warningsRef, multipleId)).catch(() => {})
			}

			const delayedId = `${userId}_delayed_kuya_win`
			const pendingRequests = await getDocs(
				query(collection(db, "soeRequests"), where("studentId", "==", userId)),
			)
			const hasDelayedPendingKuya = pendingRequests.docs.some((requestDoc) => {
				const request = requestDoc.data() || {}
				const requestProviderType = toScholarshipProviderType(
					request.providerType || request.scholarshipName || "",
				)
				return (
					request.status === "Pending" &&
					requestProviderType === "kuya_win" &&
					isOlderThanSevenDays(request.timestamp)
				)
			})

			if (hasDelayedPendingKuya) {
				await setDoc(doc(warningsRef, delayedId), {
					...basePayload,
					warningType: "delayed_kuya_win",
					status: "Delayed Document Submission",
				})
			} else {
				await deleteDoc(doc(warningsRef, delayedId)).catch(() => {})
			}
		},
		[user, userId],
	)

	useEffect(() => {
		if (!userLoaded || !user || !userId) return
		syncWarnings(scholarships).catch(() => {})
	}, [userLoaded, user, userId, scholarships, syncWarnings])

	const persistScholarships = async (nextScholarships, message = "") => {
		await setDoc(
			doc(db, "students", userId),
			{
				scholarships: nextScholarships,
				updatedAt: serverTimestamp(),
			},
			{ merge: true },
		)
		setUser((prev) => ({ ...(prev || {}), scholarships: nextScholarships }))
		await syncWarnings(nextScholarships)
		if (message) {
			toast.success(message)
		}
	}

	const applyScholarship = async (catalogItem) => {
		if (!user || !userId || isMutating) return
		if (hasLockedScholarship) {
			toast.info("Your scholarship selection is already locked for this semester.")
			return
		}
		if (
			scholarships.some(
				(item) =>
					item.providerType === catalogItem.providerType &&
					isScholarshipActiveOrPending(item.status),
			)
		) {
			toast.info("You already have an active application for this scholarship.")
			return
		}
		if (hasActiveOrPendingScholarship) {
			toast.info(applicationLockTooltip)
			return
		}

		const docCheck = validateScholarshipDocuments(user, catalogItem.name)
		if (!docCheck.ok) {
			if (docCheck.expired.length > 0) {
				toast.error(
					`Please upload the latest ${docCheck.expired.join(", ")} for ${docCheck.semesterTag}.`,
				)
				return
			}
			if (docCheck.missing.length > 0) {
				toast.error(`Missing required documents: ${docCheck.missing.join(", ")}.`)
				return
			}
		}

		setIsMutating(true)
		try {
			const nextRecord = buildScholarshipRecord({
				name: catalogItem.name,
				provider: catalogItem.name,
				type: "Scholarship",
				mode: "applied",
				documentUrls: getDocumentUrlsForStudent(user),
				semesterTag: getCurrentSemesterTag(),
			})
			const nextScholarships = [...scholarships, nextRecord]

			await persistScholarships(nextScholarships, `${catalogItem.name} application recorded.`)

			await addDoc(collection(db, "scholarshipApplications"), {
				studentId: userId,
				scholarshipId: nextRecord.id,
				scholarshipName: nextRecord.name,
				providerType: nextRecord.providerType,
				status: nextRecord.status,
				applicationDate: serverTimestamp(),
				semesterTag: nextRecord.semesterTag,
				documentUrls: nextRecord.documentUrls,
				academicYear: getCurrentAcademicYear(),
			})
		} catch (error) {
			console.error("Failed to apply scholarship:", error)
			toast.error("Failed to apply scholarship. Please try again.")
		} finally {
			setIsMutating(false)
		}
	}

	const requestSoe = async (target) => {
		if (!user || !userId || isMutating || !target) return
		setIsMutating(true)
		try {
			const selected = scholarships.find((item) => item.id === target.id)
			if (!selected) {
				toast.error("Scholarship record not found.")
				return
			}
			if (selected.isLocked) {
				toast.info("This scholarship is already finalized for this semester.")
				return
			}
			if (selected.adminBlocked === true) {
				toast.warning(
					"This scholarship is blocked by the scholarship office. Please visit the office for unblocking.",
				)
				return
			}

			const soeStatus = getSoeStatusForScholarship(selected)
			const finalizedRecord = {
				...selected,
				isLocked: true,
				status: soeStatus === "Issued" ? "SOE Issued" : "Pending",
				requestedSoeAt: new Date().toISOString(),
			}

			const shouldCollapse = scholarships.length >= 2
			const nextScholarships = shouldCollapse
				? [finalizedRecord]
				: scholarships.map((item) =>
						item.id === selected.id ? finalizedRecord : item,
					)

			await setDoc(
				doc(db, "students", userId),
				{
					scholarships: nextScholarships,
					updatedAt: serverTimestamp(),
					lastSoeStatus: soeStatus,
				},
				{ merge: true },
			)

			await addDoc(collection(db, "soeRequests"), {
				studentId: userId,
				scholarshipId: selected.id,
				scholarshipName: selected.name,
				providerType: selected.providerType,
				timestamp: serverTimestamp(),
				status: soeStatus,
				academicYear: getCurrentAcademicYear(),
				semesterTag: selected.semesterTag || getCurrentSemesterTag(),
			})

			setUser((prev) => ({ ...(prev || {}), scholarships: nextScholarships }))
			await syncWarnings(nextScholarships)

			if (soeStatus === "Pending") {
				toast.success(
					"SOE request submitted and marked as Pending. Wait for scholarship office verification.",
				)
			} else {
				toast.success("SOE was issued and your scholarship is now locked.")
			}
		} catch (error) {
			console.error("Failed to request SOE:", error)
			toast.error("SOE request failed. Please try again.")
		} finally {
			setIsMutating(false)
			setConfirmTarget(null)
		}
	}

	const handleRequestSoe = (target) => {
		if (!target) return
		if (target.isLocked) {
			toast.info("This scholarship is already finalized for this semester.")
			return
		}
		if (target.adminBlocked === true) {
			toast.warning(
				"This scholarship is blocked by the scholarship office. Please visit the office for unblocking.",
			)
			return
		}
		if (scholarships.length >= 2) {
			setConfirmTarget(target)
			return
		}
		requestSoe(target)
	}

	const getExportWindow = () => {
		const lastExportDate = toJsDate(user?.soeLastExportAt)
		if (!lastExportDate) {
			return {
				locked: false,
				lastExportDate: null,
				nextAllowedDate: null,
			}
		}
		const nextAllowedDate = addMonths(lastExportDate, SOE_EXPORT_LOCK_MONTHS)
		return {
			locked: Date.now() < nextAllowedDate.getTime(),
			lastExportDate,
			nextAllowedDate,
		}
	}

	const requireExportWindowOpen = () => {
		const { locked, nextAllowedDate } = getExportWindow()
		if (!locked) return true
		toast.warning(
			`SOE export is limited to once every ${SOE_EXPORT_LOCK_MONTHS} months. Next export: ${nextAllowedDate.toLocaleDateString("en-PH", {
				month: "long",
				day: "numeric",
				year: "numeric",
			})}.`,
		)
		return false
	}

	const handleDownloadSoe = (target) => {
		if (!target) return
		if (!requireExportWindowOpen()) return
		setExpenseModalTarget(target)
		const savedExpenses =
			Array.isArray(user?.soeExpenseItems) && user.soeExpenseItems.length > 0
				? user.soeExpenseItems.map((item) => ({
						label: item?.label || "",
						amount: item?.amount != null ? String(item.amount) : "",
					}))
				: [{ label: "", amount: "" }]
		setSoeExpenses(savedExpenses)
	}

	const handleExpenseRowChange = (index, field, value) => {
		setSoeExpenses((prev) =>
			prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row)),
		)
	}

	const handleAddExpenseRow = () => {
		setSoeExpenses((prev) => [...prev, { label: "", amount: "" }])
	}

	const handleRemoveExpenseRow = (index) => {
		setSoeExpenses((prev) => {
			if (prev.length <= 1) return prev
			return prev.filter((_, idx) => idx !== index)
		})
	}

	const closeExpenseModal = () => {
		setExpenseModalTarget(null)
		setSoeExpenses([{ label: "", amount: "" }])
	}

	const closeSoePreview = () => {
		setIsSoePreviewOpen(false)
		setSoePreviewRegistration("")
		setSoePreviewBytes(null)
		if (soePreviewUrl) {
			URL.revokeObjectURL(soePreviewUrl)
		}
		setSoePreviewUrl("")
	}

	const handleExportSoeWithExpenses = async () => {
		if (!expenseModalTarget || isExportingSoe) return
		if (!requireExportWindowOpen()) return

		const hasPartialRow = soeExpenses.some((row) => {
			const hasLabel = Boolean(row.label?.trim())
			const hasAmount = String(row.amount ?? "").trim() !== ""
			return (hasLabel && !hasAmount) || (!hasLabel && hasAmount)
		})
		if (hasPartialRow) {
			toast.error("Complete both Expense and Amount for each filled row.")
			return
		}

		const preparedExpenses = soeExpenses
			.map((row) => ({
				label: row.label.trim(),
				amount: Number(row.amount),
			}))
			.filter(
				(row) => row.label && Number.isFinite(row.amount) && row.amount > 0,
			)

		if (preparedExpenses.length === 0) {
			toast.error("Please add at least one expense item.")
			return
		}

		setIsExportingSoe(true)
		try {
			const { registrationNumber, pdfBytes } = await exportSoePdfDocument({
				student: user || {},
				studentId: userId,
				expenses: preparedExpenses,
				autoDownload: false,
			})

			const previewBlob = new Blob([pdfBytes], { type: "application/pdf" })
			const nextUrl = URL.createObjectURL(previewBlob)
			if (soePreviewUrl) {
				URL.revokeObjectURL(soePreviewUrl)
			}

			setSoePreviewBytes(pdfBytes)
			setSoePreviewRegistration(registrationNumber)
			setSoePreviewUrl(nextUrl)
			setIsSoePreviewOpen(true)
			setExpenseModalTarget(null)
		} catch (error) {
			console.error("Failed to export SOE:", error)
			toast.error("Unable to export SOE PDF. Please try again.")
		} finally {
			setIsExportingSoe(false)
		}
	}

	const handleConfirmDownloadSoe = async () => {
		if (!soePreviewBytes || !userId || isDownloadingSoe) return
		if (!requireExportWindowOpen()) {
			closeSoePreview()
			return
		}

		setIsDownloadingSoe(true)
		try {
			downloadSoePdfBytes(
				soePreviewBytes,
				`SOE_${userId}.pdf`,
			)
			await setDoc(
				doc(db, "students", userId),
				{
					soeLastExportAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)
			setUser((prev) => ({
				...(prev || {}),
				soeLastExportAt: new Date().toISOString(),
			}))
			const nextAllowedDate = addMonths(new Date(), SOE_EXPORT_LOCK_MONTHS)
			toast.success(
				`SOE downloaded. Registration Number: ${soePreviewRegistration}. Next export available after ${
					nextAllowedDate
						? nextAllowedDate.toLocaleDateString("en-PH", {
								month: "long",
								day: "numeric",
								year: "numeric",
							})
						: "6 months"
				}.`,
			)
			closeSoePreview()
		} catch (error) {
			console.error("Failed to finalize SOE download:", error)
			toast.error("Failed to finalize SOE download. Please try again.")
		} finally {
			setIsDownloadingSoe(false)
		}
	}

	const handleSaveExpensePreset = async () => {
		if (!userId || isSavingExpensePreset) return

		const hasPartialRow = soeExpenses.some((row) => {
			const hasLabel = Boolean(row.label?.trim())
			const hasAmount = String(row.amount ?? "").trim() !== ""
			return (hasLabel && !hasAmount) || (!hasLabel && hasAmount)
		})
		if (hasPartialRow) {
			toast.error("Complete both Expense and Amount for each filled row before saving.")
			return
		}

		const preparedExpenses = soeExpenses
			.map((row) => ({
				label: row.label.trim(),
				amount: Number(row.amount),
			}))
			.filter(
				(row) => row.label && Number.isFinite(row.amount) && row.amount > 0,
			)

		if (preparedExpenses.length === 0) {
			toast.error("Please add at least one expense item to save.")
			return
		}

		setIsSavingExpensePreset(true)
		try {
			await setDoc(
				doc(db, "students", userId),
				{
					soeExpenseItems: preparedExpenses,
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)
			setUser((prev) => ({ ...(prev || {}), soeExpenseItems: preparedExpenses }))
			toast.success("SOE expenses saved. They will auto-load next time.")
		} catch (error) {
			console.error("Failed to save SOE expenses:", error)
			toast.error("Failed to save expenses. Please try again.")
		} finally {
			setIsSavingExpensePreset(false)
		}
	}

	const modalExpenseTotal = soeExpenses.reduce((sum, row) => {
		const label = row.label?.trim()
		const amount = Number(row.amount)
		if (!label || !Number.isFinite(amount) || amount <= 0) return sum
		return sum + amount
	}, 0)

	if (!userLoaded) {
		return (
			<div
				className={`admin-dashboard student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}
			>
				<main className="dashboard-main">
					<div className="dashboard-content">
						<div className="dashboard-panel student-dashboard-loading-panel">
							<p className="dashboard-placeholder">Loading scholarships...</p>
						</div>
					</div>
				</main>
			</div>
		)
	}

	return (
		<div
			className={`admin-dashboard student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}
		>
			<header className="dashboard-header student-header">
				<div className="student-header-top-stripe"></div>
				<div className="student-header-content">
					<div className="student-header-left">
						<Link to="/student-dashboard" className="student-header-home-link" aria-label="Go to dashboard">
							<img src={logo2} alt="BulsuScholar" className="student-header-logo" />
							<h1 className="student-header-brand">BulsuScholar</h1>
						</Link>
					</div>
					<div className="student-header-right">
						<div className="student-header-verified-wrap">
							<button
								type="button"
								className={`student-header-verified-btn ${isValidated ? "student-header-verified-btn--verified" : "student-header-verified-btn--pending"}`}
								aria-label={isValidated ? "Verified" : "Pending verification"}
								title={isValidated ? "Verified" : "Pending"}
							>
								{isValidated ? (
									<HiOutlineCheckCircle
										className="student-header-verified-icon"
										aria-hidden
									/>
								) : (
									<HiOutlineClock
										className="student-header-verified-icon"
										aria-hidden
									/>
								)}
								<span className="student-header-verified-tooltip-below">
									{isValidated ? "Verified" : "Pending"}
								</span>
							</button>
						</div>
						<div className="student-header-user-wrap" ref={userMenuRef}>
							<button
								type="button"
								className="student-header-user-btn"
								onClick={() => setUserMenuOpen((open) => !open)}
								aria-label="User menu"
								aria-expanded={userMenuOpen}
							>
								<HiMenu className="student-header-menu-icon" aria-hidden />
								<div className="student-header-avatar">
									{avatarUrl ? (
										<img
											src={avatarUrl}
											alt="Profile"
											className="student-header-avatar-image-mini"
										/>
									) : (
										getUserInitials()
									)}
								</div>
							</button>
							{userMenuOpen && (
								<div className="student-verified-dropdown">
									<div className="student-verified-dropdown-user">
										<div className="student-verified-dropdown-avatar">
											{avatarUrl ? (
												<img
													src={avatarUrl}
													alt="Profile"
													className="student-header-avatar-image-mini"
												/>
											) : (
												getUserInitials()
											)}
										</div>
										<div className="student-verified-dropdown-user-info">
											<p className="student-verified-dropdown-name">
												{[user?.fname, user?.mname, user?.lname]
													.filter(Boolean)
													.join(" ") || "Student"}
											</p>
											<p className="student-verified-dropdown-email">
												{studentNumber || "-"}
											</p>
										</div>
									</div>
									<nav className="student-verified-dropdown-nav">
										<button
											type="button"
											className="student-verified-dropdown-item"
											onClick={() => {
												setUserMenuOpen(false)
												navigate("/student-dashboard/profile", { state: { user } })
											}}
										>
											<HiOutlineUserCircle
												className="student-verified-dropdown-item-icon"
												aria-hidden
											/>
											My Profile
										</button>
										<button
											type="button"
											className="student-verified-dropdown-item"
											onClick={() => {
												setUserMenuOpen(false)
												navigate("/student-dashboard")
											}}
										>
											<HiOutlineAcademicCap
												className="student-verified-dropdown-item-icon"
												aria-hidden
											/>
											Dashboard
										</button>
									</nav>
									<div className="student-verified-dropdown-theme">
										<span className="student-verified-dropdown-theme-label">THEME</span>
										<div className="student-verified-dropdown-theme-btns">
											<button
												type="button"
												className={`student-verified-dropdown-theme-btn ${theme === "light" ? "active" : ""}`}
												onClick={() => setTheme("light")}
											>
												<HiOutlineSun aria-hidden />
												Light
											</button>
											<button
												type="button"
												className={`student-verified-dropdown-theme-btn ${theme === "dark" ? "active" : ""}`}
												onClick={() => setTheme("dark")}
											>
												<HiOutlineMoon aria-hidden />
												Dark
											</button>
										</div>
									</div>
									<button
										type="button"
										className="student-verified-dropdown-logout"
										onClick={() => {
											sessionStorage.removeItem("bulsuscholar_userId")
											sessionStorage.removeItem("bulsuscholar_userType")
											setUserMenuOpen(false)
											navigate("/", { replace: true })
										}}
									>
										<HiOutlineLogout
											className="student-verified-dropdown-logout-icon"
											aria-hidden
										/>
										Logout
									</button>
								</div>
							)}
						</div>
					</div>
				</div>
			</header>

			<main className="dashboard-main">
				<div className="dashboard-content">
					<div className="dashboard-page-title">
						<h2 className="dashboard-page-heading">Scholarship Control Center</h2>
						<p className="dashboard-page-sub">
							Submit one active scholarship application at a time. Apply locks out other programs until resolved.
						</p>
					</div>

					{lockedScholarship && (
						<div className="student-lock-banner">
							<HiOutlineCheckCircle aria-hidden />
							<div>
								<p className="student-lock-banner-title">Scholarship selection finalized</p>
								<p className="student-lock-banner-sub">
									{lockedScholarship.name} is locked for {lockedScholarship.semesterTag || getCurrentSemesterTag()}.
								</p>
							</div>
						</div>
					)}

					<section className="student-scholarship-workspace">
						<div className="student-scholarship-board">
							<h3>My Scholarship Applications</h3>
							{scholarships.length === 0 ? (
								<p className="dashboard-placeholder">
									No scholarship application yet. Apply from the available programs below.
								</p>
							) : (
								<div className="student-scholarship-cards">
									{scholarships.map((entry) => (
										<article key={entry.id} className="student-scholarship-card">
											<div className="student-scholarship-card-left">
												<HiOutlineAcademicCap className="student-scholarship-card-icon" aria-hidden />
											</div>
											<div className="student-scholarship-card-info">
												<h3 className="student-scholarship-card-name">{entry.name}</h3>
												<p className="student-scholarship-card-provider">{entry.status}</p>
												<p className="student-scholarship-card-provider">
													Semester: {entry.semesterTag}
												</p>
											</div>
											<div className="student-scholarship-card-action">
												<div className="student-scholarship-card-action-buttons">
													<button
														type="button"
														className="student-scholarship-request-soe"
														disabled={isMutating || entry.isLocked || entry.adminBlocked === true}
														onClick={() => handleRequestSoe(entry)}
													>
														<HiOutlineDocumentText />
														{entry.adminBlocked === true
															? "Blocked by Office"
															: entry.isLocked
																? "Finalized"
																: "Request SOE"}
													</button>
													<button
														type="button"
														className="student-scholarship-download-soe"
														onClick={() => handleDownloadSoe(entry)}
													>
														<HiOutlineDocumentText />
														Download SOE
													</button>
												</div>
											</div>
										</article>
									))}
								</div>
							)}
						</div>

						<div className="student-scholarship-board">
							<h3>Available Programs</h3>
							<div className="student-program-grid">
								{scholarshipCatalog.map((catalogItem) => {
									const hasThisActiveApplication = scholarships.some(
										(item) =>
											item.providerType === catalogItem.providerType &&
											isScholarshipActiveOrPending(item.status),
									)
									const blockedByExclusivity =
										hasActiveOrPendingScholarship &&
										!activeOrPendingProviderTypes.has(catalogItem.providerType)
									const applyDisabled =
										hasLockedScholarship ||
										hasThisActiveApplication ||
										blockedByExclusivity ||
										isMutating
									const tooltip = blockedByExclusivity
										? applicationLockTooltip
										: hasThisActiveApplication
											? "Application already submitted for this scholarship."
											: ""

									return (
										<article key={catalogItem.providerType} className="student-program-card">
											<h4>{catalogItem.name}</h4>
											<p>
												{catalogItem.requiresFullDocs
													? "Requires COR, COG, School ID"
													: "Requires COR"}
											</p>
											<div className="student-program-actions">
												<button
													type="button"
													className="student-program-apply-btn"
													disabled={applyDisabled}
													title={tooltip}
													onClick={() => applyScholarship(catalogItem)}
												>
													Apply
												</button>
											</div>
											{tooltip && <span className="student-program-tooltip">{tooltip}</span>}
										</article>
									)
								})}
							</div>
						</div>
					</section>

					<footer className="student-footer">
						<div className="student-footer-grid">
							<div className="student-footer-brand">
								<h3>BulsuScholar</h3>
								<p>
									Institutional Student Programs and Services scholarship portal.
									Track and manage your scholarship declarations and requests.
								</p>
							</div>
							<div className="student-footer-col">
								<h4>Support</h4>
								<p>Office of Scholarships</p>
								<p>Email: scholarships@bulsu.edu.ph</p>
								<p>Mon-Fri, 8:00 AM - 5:00 PM</p>
							</div>
							<div className="student-footer-col">
								<h4>Quick Links</h4>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard/profile", { state: { user } })}
								>
									My Profile
								</button>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard", { state: { user } })}
								>
									Dashboard Home
								</button>
							</div>
						</div>
						<p className="student-footer-bottom">
							(c) {new Date().getFullYear()} BulsuScholar. All rights reserved.
						</p>
					</footer>
				</div>
			</main>

			{confirmTarget && (
				<div className="student-soe-modal-backdrop" role="presentation">
					<div
						className="student-soe-modal"
						role="dialog"
						aria-modal="true"
						aria-label="SOE final confirmation"
					>
						<button
							type="button"
							className="student-soe-modal-close"
							onClick={() => setConfirmTarget(null)}
						>
							<HiX aria-hidden />
						</button>
						<h3>Final Confirmation</h3>
						<p>
							Requesting an SOE for [{confirmTarget.name}] will finalize your choice and clear any other scholarship entries for this semester. Do you wish to proceed?
						</p>
						<div className="student-soe-modal-actions">
							<button
								type="button"
								className="student-program-save-btn"
								onClick={() => setConfirmTarget(null)}
							>
								Cancel
							</button>
							<button
								type="button"
								className="student-program-apply-btn"
								onClick={() => requestSoe(confirmTarget)}
								disabled={isMutating}
							>
								Confirm SOE Request
							</button>
						</div>
					</div>
				</div>
			)}

			{expenseModalTarget && (
				<div className="student-soe-modal-backdrop" role="presentation">
					<div
						className="student-soe-modal student-soe-expense-modal"
						role="dialog"
						aria-modal="true"
						aria-label="SOE expense entry"
					>
						<button
							type="button"
							className="student-soe-modal-close"
							onClick={closeExpenseModal}
						>
							<HiX aria-hidden />
						</button>
						<h3>SOE Expenses</h3>
						<p>
							Add the expenses and corresponding amounts to include in your SOE export.
						</p>

						<div className="student-soe-expense-rows">
							{soeExpenses.map((row, index) => (
								<div key={`expense-row-${index}`} className="student-soe-expense-row">
									<input
										type="text"
										className="student-soe-expense-input"
										placeholder="Expense (e.g. Food Allowance)"
										value={row.label}
										onChange={(e) =>
											handleExpenseRowChange(index, "label", e.target.value)
										}
									/>
									<input
										type="number"
										className="student-soe-expense-input"
										placeholder="Amount"
										min="0"
										step="0.01"
										value={row.amount}
										onChange={(e) =>
											handleExpenseRowChange(index, "amount", e.target.value)
										}
									/>
									<button
										type="button"
										className="student-soe-expense-remove"
										onClick={() => handleRemoveExpenseRow(index)}
										disabled={soeExpenses.length <= 1}
									>
										Remove
									</button>
								</div>
							))}
						</div>

						<div className="student-soe-expense-tools">
							<button
								type="button"
								className="student-program-save-btn"
								onClick={handleAddExpenseRow}
							>
								Add Expense
							</button>
							<button
								type="button"
								className="student-program-save-btn"
								onClick={handleSaveExpensePreset}
								disabled={isSavingExpensePreset}
							>
								{isSavingExpensePreset ? "Saving..." : "Save Expenses"}
							</button>
						</div>
						<p className="student-soe-expense-total">
							Total:{" "}
							{new Intl.NumberFormat("en-PH", {
								style: "currency",
								currency: "PHP",
								minimumFractionDigits: 2,
							}).format(modalExpenseTotal)}
						</p>
						<p className="student-soe-export-warning">
							Warning: After final download, you can export SOE again only after{" "}
							{SOE_EXPORT_LOCK_MONTHS} months. Double-check all expenses and amounts.
						</p>

						<div className="student-soe-modal-actions">
							<button
								type="button"
								className="student-program-save-btn"
								onClick={closeExpenseModal}
							>
								Cancel
							</button>
							<button
								type="button"
								className="student-program-apply-btn"
								onClick={handleExportSoeWithExpenses}
								disabled={isExportingSoe}
							>
								{isExportingSoe ? "Preparing..." : "Save & Preview SOE"}
							</button>
						</div>
					</div>
				</div>
			)}

			{isSoePreviewOpen && soePreviewUrl && (
				<div className="student-soe-preview-backdrop" role="presentation">
					<div className="student-soe-preview-modal" role="dialog" aria-modal="true" aria-label="SOE preview">
						<button type="button" className="student-soe-modal-close" onClick={closeSoePreview}>
							<HiX aria-hidden />
						</button>
						<h3>SOE Preview</h3>
						<p className="student-soe-export-warning">
							Final warning: Once downloaded, your next SOE export is available after{" "}
							{SOE_EXPORT_LOCK_MONTHS} months. Confirm that all expenses and amounts are correct.
						</p>
						<div className="student-soe-preview-frame-wrap">
							<iframe
								src={soePreviewUrl}
								title="SOE PDF Preview"
								className="student-soe-preview-frame"
							/>
						</div>
						<div className="student-soe-modal-actions">
							<button type="button" className="student-program-save-btn" onClick={closeSoePreview}>
								Cancel
							</button>
							<button
								type="button"
								className="student-program-apply-btn"
								onClick={handleConfirmDownloadSoe}
								disabled={isDownloadingSoe}
							>
								{isDownloadingSoe ? "Downloading..." : "Download Final SOE"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
