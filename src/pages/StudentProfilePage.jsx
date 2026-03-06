import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import {
	HiMenu,
	HiOutlineAcademicCap,
	HiOutlineCamera,
	HiOutlineCheckCircle,
	HiOutlineClock,
	HiOutlineLogout,
	HiOutlineMoon,
	HiOutlineSun,
	HiOutlineUserCircle,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { db } from "../../firebase"
import { uploadToCloudinary } from "../services/cloudinaryService"
import logo2 from "../assets/logo2.png"
import "../css/AdminDashboard.css"
import "../css/StudentDashboard.css"
import useThemeMode from "../hooks/useThemeMode"

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

export default function StudentProfilePage() {
	const navigate = useNavigate()
	const location = useLocation()
	const [user, setUser] = useState(location.state?.user ?? null)
	const [userLoaded, setUserLoaded] = useState(!!location.state?.user)
	const [userMenuOpen, setUserMenuOpen] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [selectedPhoto, setSelectedPhoto] = useState(null)
	const [photoPreview, setPhotoPreview] = useState("")
	const userMenuRef = useRef(null)
	const fileInputRef = useRef(null)
	const { theme, setTheme } = useThemeMode()

	const [formData, setFormData] = useState({
		fname: "",
		mname: "",
		lname: "",
		email: "",
		course: "",
		major: "",
		year: "",
		section: "",
	})

	useEffect(() => {
		if (user != null) {
			setUserLoaded(true)
			return
		}
		const storedUserId = sessionStorage.getItem("bulsuscholar_userId")
		const storedType = sessionStorage.getItem("bulsuscholar_userType")
		if (storedUserId && storedType === "student") {
			getDoc(doc(db, "students", storedUserId))
				.then((snap) => {
					if (snap.exists()) setUser(snap.data())
					setUserLoaded(true)
				})
				.catch(() => setUserLoaded(true))
		} else {
			setUserLoaded(true)
		}
	}, [])

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
		if (userLoaded && !user) {
			navigate("/", { replace: true })
		}
	}, [userLoaded, user, navigate])

	useEffect(() => {
		if (!user) return
		setFormData({
			fname: user.fname || "",
			mname: user.mname || "",
			lname: user.lname || "",
			email: user.email || "",
			course: user.course || "",
			major: user.major || "",
			year: user.year || "",
			section: user.section || "",
		})
	}, [user])

	useEffect(() => {
		if (!selectedPhoto) return undefined
		const objectUrl = URL.createObjectURL(selectedPhoto)
		setPhotoPreview(objectUrl)
		return () => URL.revokeObjectURL(objectUrl)
	}, [selectedPhoto])

	const isValidated = checkValidated(user)
	const studentNumber =
		location.state?.userId ??
		sessionStorage.getItem("bulsuscholar_userId") ??
		""

	const getUserInitials = () => {
		const f = formData.fname?.[0]?.toUpperCase() || user?.fname?.[0]?.toUpperCase() || ""
		const l = formData.lname?.[0]?.toUpperCase() || user?.lname?.[0]?.toUpperCase() || ""
		return f + l || "ST"
	}

	const profileImageUrl = photoPreview || user?.profileImageUrl || ""

	const handlePhotoChange = (e) => {
		const file = e.target.files?.[0]
		if (!file) return
		if (!file.type.startsWith("image/")) {
			toast.error("Please upload an image file.")
			return
		}
		if (file.size > 5 * 1024 * 1024) {
			toast.error("Image must be 5MB or less.")
			return
		}
		setSelectedPhoto(file)
	}

	const handleSaveProfile = async () => {
		const id = studentNumber.trim()
		if (!id) {
			toast.error("Missing student ID. Please login again.")
			return
		}

		if (!formData.fname.trim() || !formData.lname.trim() || !formData.email.trim()) {
			toast.error("First name, last name, and email are required.")
			return
		}

		setIsSaving(true)
		try {
			let uploadedImageUrl = user?.profileImageUrl || null
			if (selectedPhoto) {
				const uploaded = await uploadToCloudinary(selectedPhoto)
				uploadedImageUrl = uploaded.url
			}

			const payload = {
				fname: formData.fname.trim(),
				mname: formData.mname.trim(),
				lname: formData.lname.trim(),
				email: formData.email.trim(),
				course: formData.course,
				major: formData.major,
				year: formData.year,
				section: formData.section,
				profileImageUrl: uploadedImageUrl,
				updatedAt: serverTimestamp(),
			}

			await setDoc(doc(db, "students", id), payload, { merge: true })

			const nextUser = { ...(user || {}), ...payload, profileImageUrl: uploadedImageUrl }
			setUser(nextUser)
			setSelectedPhoto(null)
			setPhotoPreview("")
			toast.success("Profile updated successfully.")
		} catch (error) {
			console.error("Failed to update profile:", error)
			toast.error("Failed to update profile. Please try again.")
		} finally {
			setIsSaving(false)
		}
	}

	if (!userLoaded) {
		return (
			<div
				className={`admin-dashboard student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}
			>
				<main className="dashboard-main">
					<div className="dashboard-content">
						<div className="dashboard-panel student-dashboard-loading-panel">
							<p className="dashboard-placeholder">Loading profile...</p>
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
						<img src={logo2} alt="BulsuScholar" className="student-header-logo" />
						<h1 className="student-header-brand">BulsuScholar</h1>
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
								onClick={() => setUserMenuOpen((o) => !o)}
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
											<p className="student-verified-dropdown-email">
												{studentNumber || "-"}
											</p>
										</div>
									</div>
									<nav className="student-verified-dropdown-nav">
										<button type="button" className="student-verified-dropdown-item">
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
												navigate("/student-dashboard/scholarships", {
													state: { user },
												})
											}}
										>
											<HiOutlineAcademicCap
												className="student-verified-dropdown-item-icon"
												aria-hidden
											/>
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
						<h2 className="dashboard-page-heading">My Profile</h2>
						<p className="dashboard-page-sub">
							Keep your student information and profile photo updated.
						</p>
					</div>

					<section className="student-profile-panel">
						<div className="student-profile-media">
							<div className="student-profile-avatar-wrap">
								{profileImageUrl ? (
									<img
										src={profileImageUrl}
										alt="Profile"
										className="student-profile-avatar-image"
									/>
								) : (
									<div className="student-profile-avatar-fallback">
										{getUserInitials()}
									</div>
								)}
								<button
									type="button"
									className="student-profile-upload-btn"
									onClick={() => fileInputRef.current?.click()}
								>
									<HiOutlineCamera aria-hidden />
									Upload Photo
								</button>
								<input
									ref={fileInputRef}
									type="file"
									accept="image/*"
									className="student-profile-file-input"
									onChange={handlePhotoChange}
								/>
							</div>
							<p className="student-profile-upload-hint">
								JPG or PNG, maximum file size 5MB.
							</p>
						</div>

						<div className="student-profile-form">
							<label className="student-profile-label">
								First Name
								<input
									type="text"
									className="student-profile-input"
									value={formData.fname}
									onChange={(e) =>
										setFormData((prev) => ({ ...prev, fname: e.target.value }))
									}
								/>
							</label>
							<label className="student-profile-label">
								Middle Name
								<input
									type="text"
									className="student-profile-input"
									value={formData.mname}
									onChange={(e) =>
										setFormData((prev) => ({ ...prev, mname: e.target.value }))
									}
								/>
							</label>
							<label className="student-profile-label">
								Last Name
								<input
									type="text"
									className="student-profile-input"
									value={formData.lname}
									onChange={(e) =>
										setFormData((prev) => ({ ...prev, lname: e.target.value }))
									}
								/>
							</label>
							<label className="student-profile-label">
								Email
								<input
									type="email"
									className="student-profile-input"
									value={formData.email}
									onChange={(e) =>
										setFormData((prev) => ({ ...prev, email: e.target.value }))
									}
								/>
							</label>
							<label className="student-profile-label">
								Course
								<input type="text" className="student-profile-input" value={formData.course} readOnly />
							</label>
							<label className="student-profile-label">
								Major
								<input type="text" className="student-profile-input" value={formData.major} readOnly />
							</label>
							<label className="student-profile-label">
								Year
								<input type="text" className="student-profile-input" value={formData.year} readOnly />
							</label>
							<label className="student-profile-label">
								Section
								<input type="text" className="student-profile-input" value={formData.section} readOnly />
							</label>
						</div>

						<div className="student-profile-actions">
							<button
								type="button"
								className="student-profile-cancel-btn"
								onClick={() => navigate("/student-dashboard", { state: { user } })}
							>
								Back to Dashboard
							</button>
							<button
								type="button"
								className="student-profile-save-btn"
								onClick={handleSaveProfile}
								disabled={isSaving}
							>
								{isSaving ? "Saving..." : "Save Profile"}
							</button>
						</div>
					</section>

					<footer className="student-footer">
						<div className="student-footer-grid">
							<div className="student-footer-brand">
								<h3>BulsuScholar</h3>
								<p>
									Institutional Student Programs and Services scholarship portal.
									Manage your records, profile, and scholarship information in one
									modern workspace.
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
									onClick={() =>
										navigate("/student-dashboard/scholarships", { state: { user } })
									}
								>
									My Scholarships
								</button>
							</div>
						</div>
						<p className="student-footer-bottom">
							© {new Date().getFullYear()} BulsuScholar. All rights reserved.
						</p>
					</footer>
				</div>
			</main>
		</div>
	)
}
