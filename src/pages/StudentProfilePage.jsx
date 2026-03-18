import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore"
import {
	HiMenu,
	HiOutlineAcademicCap,
	HiOutlineCamera,
	HiOutlineCheckCircle,
	HiOutlineClock,
	HiOutlineDocumentText,
	HiOutlineLogout,
	HiOutlineMoon,
	HiOutlineSun,
	HiOutlineUserCircle,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { db } from "../../firebase"
import { uploadToCloudinary } from "../services/cloudinaryService"
import { getCurrentSemesterTag } from "../services/scholarshipService"
import { getPortalAccessBlockMessage, getStudentAccessState } from "../services/studentAccessService"
import logo2 from "../assets/logo2.png"
import "../css/StudentDashboard.css"
import useThemeMode from "../hooks/useThemeMode"

const COURSES_WITH_MAJORS = new Set([
	"Bachelor of Secondary Education",
	"Bachelor of Science in Business Administration",
	"Bachelor in Industrial Technology",
])

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

function documentStatus(file, semesterTag) {
	if (!file?.url) return "Not uploaded"
	if (file.semesterTag && file.semesterTag !== semesterTag) {
		return `Outdated (${file.semesterTag})`
	}
	return `Current (${file.semesterTag || semesterTag})`
}

export default function StudentProfilePage() {
	const navigate = useNavigate()
	const [user, setUser] = useState(null)
	const [userLoaded, setUserLoaded] = useState(false)
	const [userId, setUserId] = useState("")
	const [userMenuOpen, setUserMenuOpen] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [isPhotoUploading, setIsPhotoUploading] = useState(false)
	const [isDocumentUploading, setIsDocumentUploading] = useState({
		cog: false,
		schoolId: false,
		applicationForm: false,
	})
	const [isLightboxOpen, setIsLightboxOpen] = useState(false)
	const userMenuRef = useRef(null)
	const forcedLogoutRef = useRef(false)
	const fileInputRef = useRef(null)
	const cogFileInputRef = useRef(null)
	const schoolIdFileInputRef = useRef(null)
	const applicationFormFileInputRef = useRef(null)
	const { theme, setTheme } = useThemeMode()
	const isValidated = checkValidated(user)
	const currentSemesterTag = getCurrentSemesterTag()
	const profileImageUrl = user?.profileImageUrl || ""

	const [formData, setFormData] = useState({
		fname: "",
		mname: "",
		lname: "",
		email: "",
		cpNumber: "",
		houseNumber: "",
		street: "",
		city: "",
		province: "",
		postalCode: "",
		course: "",
		major: "",
		year: "",
		section: "",
	})
	const courseHasMajors = COURSES_WITH_MAJORS.has(formData.course || user?.course || "")

	const getUserInitials = () => {
		const first = user?.fname?.[0]?.toUpperCase() || formData.fname?.[0]?.toUpperCase() || ""
		const last = user?.lname?.[0]?.toUpperCase() || formData.lname?.[0]?.toUpperCase() || ""
		return first + last || "ST"
	}

	const openPhotoLightbox = () => {
		if (!profileImageUrl) return
		setIsLightboxOpen(true)
	}

	const triggerPhotoUpload = () => {
		fileInputRef.current?.click()
	}

	const triggerDocumentUpload = (type) => {
		if (type === "cog") {
			cogFileInputRef.current?.click()
			return
		}
		if (type === "applicationForm") {
			applicationFormFileInputRef.current?.click()
			return
		}
		schoolIdFileInputRef.current?.click()
	}

	const handlePhotoChange = async (event) => {
		const file = event.target.files?.[0]
		event.target.value = ""
		if (!file || !userId) return

		if (!String(file.type || "").startsWith("image/")) {
			toast.error("Profile photo must be an image file.")
			return
		}

		setIsPhotoUploading(true)
		try {
			const uploadResult = await uploadToCloudinary(file)
			await setDoc(
				doc(db, "students", userId),
				{
					profileImageUrl: uploadResult.url,
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)
			setUser((prev) => ({ ...(prev || {}), profileImageUrl: uploadResult.url }))
			toast.success("Profile photo updated.")
		} catch (error) {
			console.error("Failed to upload profile photo:", error)
			toast.error("Failed to upload profile photo. Please try again.")
		} finally {
			setIsPhotoUploading(false)
		}
	}

	const handleDocumentUpload = async (type, file) => {
		if (!file || !userId) return

		const mimeType = String(file.type || "").toLowerCase()
		const isApplicationFormUpload = type === "applicationForm"
		const isAllowedFile = isApplicationFormUpload
			? mimeType.startsWith("image/") || /\.(png|jpe?g)$/i.test(file.name || "")
			: mimeType.startsWith("image/") ||
				mimeType === "application/pdf" ||
				/\.(png|jpe?g|pdf)$/i.test(file.name || "")
		if (!isAllowedFile) {
			toast.error(
				isApplicationFormUpload
					? "Scholarship application must be uploaded as PNG, JPG, or JPEG."
					: "Only PNG, JPG, JPEG, and PDF files are allowed.",
			)
			return
		}

		setIsDocumentUploading((prev) => ({ ...prev, [type]: true }))
		try {
			const uploadResult = await uploadToCloudinary(file)
			const fieldName =
				type === "cog"
					? "cogFile"
					: type === "applicationForm"
						? "scholarshipApplicationFile"
						: "schoolIdFile"
			const nextFileValue = {
				url: uploadResult.url,
				name: uploadResult.name || file.name,
				type: uploadResult.type || file.type,
				size: uploadResult.size || file.size,
				uploadedAt: new Date().toISOString(),
				...(type === "cog" ? { semesterTag: currentSemesterTag } : {}),
			}

			await setDoc(
				doc(db, "students", userId),
				{
					[fieldName]: nextFileValue,
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)

			setUser((prev) => ({ ...(prev || {}), [fieldName]: nextFileValue }))
			toast.success(
				type === "cog"
					? "COG uploaded successfully."
					: type === "applicationForm"
						? "Scholarship application uploaded successfully."
						: "Student ID uploaded successfully.",
			)
		} catch (error) {
			console.error(`Failed to upload ${type}:`, error)
			toast.error("Failed to upload document. Please try again.")
		} finally {
			setIsDocumentUploading((prev) => ({ ...prev, [type]: false }))
		}
	}

	useEffect(() => {
		function handleClickOutside(event) {
			if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
				setUserMenuOpen(false)
			}
		}

		if (!userMenuOpen) return undefined
		document.addEventListener("mousedown", handleClickOutside)
		return () => document.removeEventListener("mousedown", handleClickOutside)
	}, [userMenuOpen])

	useEffect(() => {
		const storedUserId = sessionStorage.getItem("bulsuscholar_userId")
		const storedType = sessionStorage.getItem("bulsuscholar_userType")

		if (!storedUserId || storedType !== "student") {
			setUserLoaded(true)
			return undefined
		}

		setUserId(storedUserId)
		return onSnapshot(
			doc(db, "students", storedUserId),
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
	}, [navigate])

	useEffect(() => {
		if (userLoaded && (!user || !userId)) {
			navigate("/", { replace: true })
		}
	}, [navigate, user, userId, userLoaded])

	useEffect(() => {
		if (!user) return
		setFormData({
			fname: user.fname || "",
			mname: user.mname || "",
			lname: user.lname || "",
			email: user.email || "",
			cpNumber: user.cpNumber || user.contact || user.mobile || "",
			houseNumber: user.houseNumber || "",
			street: user.street || "",
			city: user.city || "",
			province: user.province || "",
			postalCode: user.postalCode || "",
			course: user.course || "",
			major: user.major || "",
			year: user.year || "",
			section: user.section || "",
		})
	}, [user])

	const handleSaveProfile = async () => {
		if (!userId) {
			toast.error("Missing student ID. Please login again.")
			return
		}

		if (
			!formData.fname.trim() ||
			!formData.lname.trim() ||
			!formData.email.trim() ||
			!formData.cpNumber.trim() ||
			!formData.houseNumber.trim() ||
			!formData.street.trim() ||
			!formData.city.trim() ||
			!formData.province.trim() ||
			!formData.postalCode.trim()
		) {
			toast.error("All name, contact, and address details are required.")
			return
		}

		setIsSaving(true)
		try {
			const payload = {
				fname: formData.fname.trim(),
				mname: formData.mname.trim(),
				lname: formData.lname.trim(),
				email: formData.email.trim(),
				cpNumber: formData.cpNumber.trim(),
				houseNumber: formData.houseNumber.trim(),
				street: formData.street.trim(),
				city: formData.city.trim(),
				province: formData.province.trim(),
				postalCode: formData.postalCode.trim(),
				course: formData.course,
				major: courseHasMajors ? formData.major : "",
				year: formData.year,
				section: formData.section,
				profileImageUrl: user?.profileImageUrl || null,
				updatedAt: serverTimestamp(),
			}

			await setDoc(doc(db, "students", userId), payload, { merge: true })
			const refreshedSnap = await getDoc(doc(db, "students", userId))
			if (refreshedSnap.exists()) {
				setUser(refreshedSnap.data())
			}
			toast.success("Profile updated successfully.")
		} catch (error) {
			console.error("Failed to update profile:", error)
			toast.error("Failed to update profile. Please try again.")
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<div className={`student-portal student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
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
						<div className="student-header-verified-wrap">
							<button
								type="button"
								className={`student-header-verified-btn ${isValidated ? "student-header-verified-btn--verified" : "student-header-verified-btn--pending"}`}
								aria-label={isValidated ? "Verified" : "Pending verification"}
								title={isValidated ? "Verified" : "Pending"}
							>
								{isValidated ? (
									<HiOutlineCheckCircle className="student-header-verified-icon" aria-hidden />
								) : (
									<HiOutlineClock className="student-header-verified-icon" aria-hidden />
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
									{profileImageUrl ? (
										<img
											src={profileImageUrl}
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
											{profileImageUrl ? (
												<img
													src={profileImageUrl}
													alt="Profile"
													className="student-header-avatar-image-mini"
												/>
											) : (
												getUserInitials()
											)}
										</div>
										<div className="student-verified-dropdown-user-info">
											<p className="student-verified-dropdown-name">
												{`${formData.fname} ${formData.mname || ""} ${formData.lname}`.trim() ||
													"Student"}
											</p>
											<p className="student-verified-dropdown-email">{userId || "-"}</p>
										</div>
									</div>
									<nav className="student-verified-dropdown-nav">
										<button type="button" className="student-verified-dropdown-item">
											<HiOutlineUserCircle className="student-verified-dropdown-item-icon" aria-hidden />
											My Profile
										</button>
										<button
											type="button"
											className="student-verified-dropdown-item"
											onClick={() => {
												setUserMenuOpen(false)
												navigate("/student-dashboard/scholarships", { state: { user } })
											}}
										>
											<HiOutlineAcademicCap className="student-verified-dropdown-item-icon" aria-hidden />
											Scholarship
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
										<HiOutlineLogout className="student-verified-dropdown-logout-icon" aria-hidden />
										Logout
									</button>
								</div>
							)}
						</div>
					</div>
				</div>
			</header>

			<main className="student-shell">
				<div className="student-shell-content">
					<div className="student-page-title">
						<h2 className="student-page-heading">My Profile</h2>
						<p className="student-page-sub">
							Keep your information, documents, and semester records current.
						</p>
					</div>

					<section className="student-profile-modern-wrap">
						<div className="student-profile-cover">
							<div className="student-profile-cover-overlay"></div>
							<div className="student-profile-cover-content student-profile-cover-content--centered">
								<div className="student-profile-cover-avatar-wrap">
									<div className="student-profile-photo-shell" role="group" aria-label="Profile photo actions">
										{profileImageUrl ? (
											<img
												src={profileImageUrl}
												alt="Profile"
												className="student-profile-avatar-image"
											/>
										) : (
											<div className="student-profile-avatar-fallback">{getUserInitials()}</div>
										)}
										<div className="student-profile-photo-overlay">
											<button
												type="button"
												className="student-profile-photo-action student-mini-btn student-mini-btn--secondary"
												onClick={openPhotoLightbox}
											>
												Show Profile
											</button>
											<button
												type="button"
												className="student-profile-photo-action student-profile-photo-action--upload student-mini-btn student-mini-btn--primary"
												onClick={triggerPhotoUpload}
												disabled={isPhotoUploading}
											>
												<HiOutlineCamera aria-hidden />
												{isPhotoUploading ? "Uploading..." : "Upload Photo"}
											</button>
										</div>
									</div>
									<input
										ref={fileInputRef}
										type="file"
										accept="image/*"
										className="student-profile-file-input"
										onChange={handlePhotoChange}
									/>
								</div>
								<div className="student-profile-cover-text">
									<h3>{`${formData.fname} ${formData.lname}`.trim() || "Student"}</h3>
									<p>{userId}</p>
								</div>
							</div>
						</div>

						<div className="student-profile-section-grid">
							<section className="student-profile-section-card">
								<h3>Personal Details</h3>
								<div className="student-profile-form-grid">
									<label className="student-profile-label">
										First Name
										<input
											type="text"
											className="student-profile-input"
											value={formData.fname}
											onChange={(e) => setFormData((prev) => ({ ...prev, fname: e.target.value }))}
										/>
									</label>
									<label className="student-profile-label">
										Middle Name
										<input
											type="text"
											className="student-profile-input"
											value={formData.mname}
											onChange={(e) => setFormData((prev) => ({ ...prev, mname: e.target.value }))}
										/>
									</label>
									<label className="student-profile-label">
										Last Name
										<input
											type="text"
											className="student-profile-input"
											value={formData.lname}
											onChange={(e) => setFormData((prev) => ({ ...prev, lname: e.target.value }))}
										/>
									</label>
									<label className="student-profile-label">
										Email
										<input
											type="email"
											className="student-profile-input"
											value={formData.email}
											onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
										/>
									</label>
									<label className="student-profile-label">
										Contact Number
										<input
											type="text"
											className="student-profile-input"
											value={formData.cpNumber}
											onChange={(e) => setFormData((prev) => ({ ...prev, cpNumber: e.target.value.replace(/\D/g, "") }))}
											maxLength={11}
										/>
									</label>
								</div>
							</section>

							<section className="student-profile-section-card">
								<h3>Home Address</h3>
								<div className="student-profile-form-grid">
									<label className="student-profile-label">
										House No.
										<input
											type="text"
											className="student-profile-input"
											value={formData.houseNumber}
											onChange={(e) => setFormData((prev) => ({ ...prev, houseNumber: e.target.value }))}
										/>
									</label>
									<label className="student-profile-label">
										Street / Subdivision
										<input
											type="text"
											className="student-profile-input"
											value={formData.street}
											onChange={(e) => setFormData((prev) => ({ ...prev, street: e.target.value }))}
										/>
									</label>
									<label className="student-profile-label student-profile-label--full">
										Province
										<input
											type="text"
											className="student-profile-input"
											value={formData.province}
											onChange={(e) => setFormData((prev) => ({ ...prev, province: e.target.value }))}
										/>
									</label>
									<label className="student-profile-label">
										City / Municipality
										<input
											type="text"
											className="student-profile-input"
											value={formData.city}
											onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
										/>
									</label>
									<label className="student-profile-label">
										Postal Code
										<input
											type="text"
											className="student-profile-input"
											value={formData.postalCode}
											onChange={(e) => setFormData((prev) => ({ ...prev, postalCode: e.target.value.replace(/\D/g, "") }))}
											maxLength={4}
										/>
									</label>
								</div>
							</section>

							<section className="student-profile-section-card">
								<h3>Academic Information</h3>
								<div className="student-profile-form-grid">
									<label className="student-profile-label">
										Student ID
										<input type="text" className="student-profile-input" value={userId} readOnly />
									</label>
									<label className="student-profile-label">
										Course
										<input type="text" className="student-profile-input" value={formData.course} readOnly />
									</label>
									<label className="student-profile-label">
										Major
										<input
											type="text"
											className="student-profile-input"
											value={courseHasMajors ? formData.major : "N/A"}
											readOnly
										/>
									</label>
									<label className="student-profile-label">
										Year & Section
										<input
											type="text"
											className="student-profile-input"
											value={[formData.year, formData.section].filter(Boolean).join(" - ")}
											readOnly
										/>
									</label>
								</div>
							</section>

							<section className="student-profile-section-card student-profile-section-card--full">
								<h3>Document Vault</h3>
								<p className="student-profile-vault-sub">
									Upload and review COR, COG, Student ID, and scholarship application records.
								</p>
								<div className="student-vault-grid">
									<article className="student-vault-card">
										<div>
											<h4>COR</h4>
											<p>{documentStatus(user?.corFile, currentSemesterTag)}</p>
										</div>
										{user?.corFile?.url ? (
											<a href={user.corFile.url} target="_blank" rel="noreferrer" className="student-vault-link">
												<HiOutlineDocumentText aria-hidden /> View COR
											</a>
										) : (
											<span className="student-vault-muted">No file available</span>
										)}
									</article>
									<article className="student-vault-card">
										<div>
											<h4>COG</h4>
											<p>{documentStatus(user?.cogFile, currentSemesterTag)}</p>
										</div>
										<div className="student-vault-actions">
											{user?.cogFile?.url ? (
												<a
													href={user.cogFile.url}
													target="_blank"
													rel="noreferrer"
													className="student-vault-link"
												>
													<HiOutlineDocumentText aria-hidden /> View COG
												</a>
											) : (
												<span className="student-vault-muted">No file available</span>
											)}
											<button
												type="button"
												className="student-vault-upload-btn student-mini-btn student-mini-btn--primary"
												onClick={() => triggerDocumentUpload("cog")}
												disabled={isDocumentUploading.cog}
											>
												{isDocumentUploading.cog ? "Uploading..." : "Upload COG"}
											</button>
											<input
												ref={cogFileInputRef}
												type="file"
												accept=".png,.jpg,.jpeg,.pdf,image/*,application/pdf"
												className="student-profile-file-input"
												onChange={(e) => {
													const file = e.target.files?.[0]
													handleDocumentUpload("cog", file)
													e.target.value = ""
												}}
											/>
										</div>
									</article>
									<article className="student-vault-card">
										<div>
											<h4>Student ID</h4>
											<p>{user?.schoolIdFile?.url ? "Uploaded" : "Not uploaded"}</p>
										</div>
										<div className="student-vault-actions">
											{user?.schoolIdFile?.url ? (
												<a
													href={user.schoolIdFile.url}
													target="_blank"
													rel="noreferrer"
													className="student-vault-link"
												>
													<HiOutlineDocumentText aria-hidden /> View Student ID
												</a>
											) : (
												<span className="student-vault-muted">No file available</span>
											)}
											<button
												type="button"
												className="student-vault-upload-btn student-mini-btn student-mini-btn--primary"
												onClick={() => triggerDocumentUpload("schoolId")}
												disabled={isDocumentUploading.schoolId}
											>
												{isDocumentUploading.schoolId
													? "Uploading..."
													: "Upload Student ID"}
											</button>
											<input
												ref={schoolIdFileInputRef}
												type="file"
												accept=".png,.jpg,.jpeg,.pdf,image/*,application/pdf"
												className="student-profile-file-input"
												onChange={(e) => {
													const file = e.target.files?.[0]
													handleDocumentUpload("schoolId", file)
													e.target.value = ""
												}}
											/>
										</div>
									</article>
									<article className="student-vault-card">
										<div>
											<h4>Scholarship Application</h4>
											<p>{user?.scholarshipApplicationFile?.url ? "Uploaded" : "Not uploaded"}</p>
										</div>
										<div className="student-vault-actions">
											{user?.scholarshipApplicationFile?.url ? (
												<a
													href={user.scholarshipApplicationFile.url}
													target="_blank"
													rel="noreferrer"
													className="student-vault-link"
												>
													<HiOutlineDocumentText aria-hidden /> View Application
												</a>
											) : (
												<span className="student-vault-muted">No file available</span>
											)}
											<button
												type="button"
												className="student-vault-upload-btn student-mini-btn student-mini-btn--primary"
												onClick={() => triggerDocumentUpload("applicationForm")}
												disabled={isDocumentUploading.applicationForm}
											>
												{isDocumentUploading.applicationForm
													? "Uploading..."
													: "Upload Application"}
											</button>
											<input
												ref={applicationFormFileInputRef}
												type="file"
												accept=".png,.jpg,.jpeg,image/*"
												className="student-profile-file-input"
												onChange={(e) => {
													const file = e.target.files?.[0]
													handleDocumentUpload("applicationForm", file)
													e.target.value = ""
												}}
											/>
										</div>
									</article>
								</div>
							</section>
						</div>

						<div className="student-profile-actions">
							<button
								type="button"
								className="student-profile-cancel-btn student-mini-btn student-mini-btn--secondary"
								onClick={() => navigate("/student-dashboard", { state: { user } })}
							>
								Back to Dashboard
							</button>
							<button
								type="button"
								className="student-profile-save-btn student-mini-btn student-mini-btn--primary"
								onClick={handleSaveProfile}
								disabled={isSaving}
							>
								{isSaving ? "Saving..." : "Save Profile"}
							</button>
						</div>
					</section>

					{isLightboxOpen && profileImageUrl && (
						<div
							className="student-photo-lightbox"
							role="dialog"
							aria-modal="true"
							aria-label="Profile photo preview"
							onClick={() => setIsLightboxOpen(false)}
						>
							<div
								className="student-photo-lightbox-inner"
								onClick={(e) => e.stopPropagation()}
							>
								<button
									type="button"
									className="student-photo-lightbox-close"
									onClick={() => setIsLightboxOpen(false)}
								>
									Close
								</button>
								<img
									src={profileImageUrl}
									alt="Profile preview"
									className="student-photo-lightbox-image"
								/>
							</div>
						</div>
					)}

					<footer className="student-footer">
						<div className="student-footer-grid">
							<div className="student-footer-brand">
								<h3>BulsuScholar</h3>
								<p>
									Institutional Student Programs and Services scholarship portal.
									Manage your records, profile, and scholarship information in one workspace.
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
									onClick={() => navigate("/student-dashboard", { state: { user } })}
								>
									Dashboard Home
								</button>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard/scholarships", { state: { user } })}
								>
									My Scholarships
								</button>
							</div>
						</div>
						<p className="student-footer-bottom">(c) {new Date().getFullYear()} BulsuScholar. All rights reserved.</p>
					</footer>
				</div>
			</main>
		</div>
	)
}
