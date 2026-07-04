import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
	addDoc,
	collection,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	serverTimestamp,
	setDoc,
	where,
} from "../services/supabaseDataService"
import {
	HiOutlineCamera,
	HiOutlineDocumentText,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { db } from "../services/supabaseDataService"
import { uploadToStorage } from "../services/storageService"
import {
	getCurrentAcademicYear,
	getCurrentSemesterTag,
	getDocumentUrlsForStudent,
	normalizeScholarshipList,
} from "../services/scholarshipService"
import { getPortalAccessBlockMessage, getStudentAccessState } from "../services/studentAccessService"
import { isPdf, convertPdfToImageFile } from "../utils/pdfConverter"
import { PROVINCES, getCitiesByProvince } from "../data/philippineLocations"
import StudentTopbar from "../components/StudentTopbar"
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

function canUploadDocument(file, semesterTag) {
	if (!file?.url) return true
	if (file.semesterTag && file.semesterTag !== semesterTag) return true
	return Boolean(file.requiresReupload || file.resetRequired || file.uploadResetRequired)
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
	const currentSemesterTag = getCurrentSemesterTag()
	const profileImageUrl = user?.profileImageUrl || ""
	const canUploadCog = canUploadDocument(user?.cogFile, currentSemesterTag)
	const canUploadSchoolId = canUploadDocument(user?.schoolIdFile, currentSemesterTag)
	const canUploadApplicationForm = canUploadDocument(user?.scholarshipApplicationFile, currentSemesterTag)

	const [formData, setFormData] = useState({
		fname: "",
		mname: "",
		lname: "",
		email: "",
		cpNumber: "",
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

	const syncScholarshipApplicationDocuments = async ({
		type,
		studentSnapshot,
		nextFileValue,
	}) => {
		if (!userId || !studentSnapshot) return

		const scholarships = normalizeScholarshipList(studentSnapshot.scholarships || [])
		if (scholarships.length === 0) return

		const documentUrls = getDocumentUrlsForStudent(studentSnapshot)
		const applicationCollection = collection(db, "scholarshipApplications")
		const applicationSnapshot = await getDocs(
			query(applicationCollection, where("studentId", "==", userId)),
		)
		const matchingDocs = new Map()

		applicationSnapshot.docs.forEach((applicationDoc) => {
			const data = applicationDoc.data() || {}
			const scholarshipKey = String(
				data.scholarshipId || data.applicationNumber || data.requestNumber || "",
			)
			if (scholarshipKey) {
				matchingDocs.set(scholarshipKey, applicationDoc.id)
			}
		})

		const syncJobs = scholarships.map((scholarship) => {
			const scholarshipKey = String(
				scholarship.id || scholarship.applicationNumber || scholarship.requestNumber || "",
			)
			const payload = {
				studentId: userId,
				fname: studentSnapshot.fname || "",
				mname: studentSnapshot.mname || "",
				lname: studentSnapshot.lname || "",
				fullName:
					[studentSnapshot.fname, studentSnapshot.mname, studentSnapshot.lname]
						.filter(Boolean)
						.join(" ")
						.trim() || "Applicant",
				email: studentSnapshot.email || "",
				cpNumber: studentSnapshot.cpNumber || "",
				scholarshipId: scholarshipKey,
				applicationNumber:
					scholarship.applicationNumber || scholarship.requestNumber || scholarshipKey,
				requestNumber:
					scholarship.requestNumber || scholarship.applicationNumber || scholarshipKey,
				scholarshipName: scholarship.name || scholarship.provider || "Scholarship",
				providerType: scholarship.providerType || "",
				providerLabel: scholarship.provider || scholarship.name || "Scholarship",
				status: scholarship.status || "Applied",
				tracking: scholarship.tracking || null,
				appliedAt: scholarship.appliedAt || null,
				applicationDate: scholarship.appliedAt || null,
				semesterTag: scholarship.semesterTag || currentSemesterTag,
				academicYear: scholarship.academicYear || getCurrentAcademicYear(),
				documentUrls,
				updatedAt: serverTimestamp(),
			}

			if (type === "applicationForm") {
				payload.scholarshipApplicationFile = nextFileValue
				payload.applicationFormFile = nextFileValue
			}

			const existingDocId = matchingDocs.get(scholarshipKey)
			if (existingDocId) {
				return setDoc(doc(db, "scholarshipApplications", existingDocId), payload, {
					merge: true,
				})
			}

			return addDoc(applicationCollection, {
				...payload,
				createdAt: serverTimestamp(),
			})
		})

		await Promise.all(syncJobs)
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
			const uploadResult = await uploadToStorage(file)
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
			let fileToUpload = file

			// Convert PDF to image if needed (for COR and School ID)
			if (isPdf(file) && (type === "cog" || type === "schoolId")) {
				toast.info("Converting PDF to image...")
				fileToUpload = await convertPdfToImageFile(file)
				toast.success("PDF converted successfully!")
			}

			const uploadResult = await uploadToStorage(fileToUpload)
			const fieldName =
				type === "cog"
					? "cogFile"
					: type === "applicationForm"
						? "scholarshipApplicationFile"
						: "schoolIdFile"
			const nextFileValue = {
				url: uploadResult.url,
				name: uploadResult.name || fileToUpload.name,
				type: uploadResult.type || fileToUpload.type,
				size: uploadResult.size || fileToUpload.size,
				uploadedAt: new Date().toISOString(),
				semesterTag: currentSemesterTag,
			}

			await setDoc(
				doc(db, "students", userId),
				{
					[fieldName]: nextFileValue,
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)

			const nextStudentSnapshot = { ...(user || {}), [fieldName]: nextFileValue }
			await syncScholarshipApplicationDocuments({
				type,
				studentSnapshot: nextStudentSnapshot,
				nextFileValue,
			})

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
			<StudentTopbar user={user} theme={theme} setTheme={setTheme} />

			<main className="student-shell">
				<div className="student-shell-content">
					<div className="student-page-title student-profile-page-title">
						<div>
							<span className="student-profile-page-kicker">Student Account</span>
							<h2 className="student-page-heading">My Profile</h2>
							<p className="student-page-sub">
								Keep your information, documents, and semester records current.
							</p>
						</div>
						<div className="student-profile-header-actions">
							<button
								type="button"
								className="student-profile-cancel-btn student-mini-btn student-mini-btn--secondary"
								onClick={() => navigate("/student-dashboard")}
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
												className="student-profile-photo-edit"
												onClick={triggerPhotoUpload}
												disabled={isPhotoUploading}
												aria-label={isPhotoUploading ? "Uploading profile photo" : "Change profile photo"}
											>
												<HiOutlineCamera aria-hidden />
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
									<div className="student-profile-summary-chips">
										<span>{currentSemesterTag}</span>
										<span>{[formData.year, formData.section].filter(Boolean).join(" - ") || "Year not set"}</span>
										<span>{formData.course || "Course not set"}</span>
									</div>
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
									<label className="student-profile-label student-profile-label--full">
										Province
										<select
											className="student-profile-input"
											value={formData.province}
											onChange={(e) =>
												setFormData((prev) => ({
													...prev,
													province: e.target.value,
													city: "",
												}))
											}
										>
											<option value="" disabled>
												Select province
											</option>
											{PROVINCES.map((p) => (
												<option key={p} value={p}>
													{p}
												</option>
											))}
										</select>
									</label>
									<label className="student-profile-label">
										City / Municipality
										<select
											className="student-profile-input"
											value={formData.city}
											onChange={(e) =>
												setFormData((prev) => ({
													...prev,
													city: e.target.value,
												}))
											}
											disabled={!formData.province}
										>
											<option value="" disabled>
												{formData.province ? "Select city" : "Select province first"}
											</option>
											{formData.province &&
												getCitiesByProvince(formData.province).map((c) => (
													<option key={c} value={c}>
														{c}
													</option>
												))}
										</select>
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
									<label className="student-profile-label student-profile-label--full">
										Street / Subdivision
										<input
											type="text"
											className="student-profile-input"
											value={formData.street}
											onChange={(e) => setFormData((prev) => ({ ...prev, street: e.target.value }))}
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
										) : null}
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
											) : null}
											{canUploadCog ? (
												<button
													type="button"
													className="student-vault-upload-btn student-mini-btn student-mini-btn--primary"
													onClick={() => triggerDocumentUpload("cog")}
													disabled={isDocumentUploading.cog}
												>
													{isDocumentUploading.cog ? "Uploading..." : "Upload COG"}
												</button>
											) : null}
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
											<p>{documentStatus(user?.schoolIdFile, currentSemesterTag)}</p>
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
											) : null}
											{canUploadSchoolId ? (
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
											) : null}
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
											<p>{documentStatus(user?.scholarshipApplicationFile, currentSemesterTag)}</p>
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
											) : null}
											{canUploadApplicationForm ? (
												<button
													type="button"
													className="student-vault-upload-btn student-mini-btn student-mini-btn--primary"
													onClick={() => triggerDocumentUpload("applicationForm")}
													disabled={isDocumentUploading.applicationForm}
												>
													{isDocumentUploading.applicationForm
														? "Uploading..."
														: "Upload Application Form"}
												</button>
											) : null}
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
									onClick={() => navigate("/student-dashboard")}
								>
									Dashboard Home
								</button>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard/announcements")}
								>
									Announcements
								</button>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard/inbox")}
								>
									Inbox
								</button>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard/scholarships")}
								>
									My Scholarships
								</button>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard/profile")}
								>
									My Profile
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
