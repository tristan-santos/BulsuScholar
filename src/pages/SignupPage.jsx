import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
	HiOutlineMail,
	HiOutlineLockClosed,
	HiOutlineAcademicCap,
	HiOutlinePencil,
	HiOutlineTrash,
	HiOutlineCloudUpload,
	HiOutlineClock,
	HiOutlineEye,
	HiOutlineEyeOff,
} from "react-icons/hi"
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore"
import { toast } from "react-toastify"
import { db } from "../../firebase"
import { uploadToCloudinary } from "../services/cloudinaryService"
import "../css/LoginPage.css"
import "../css/SignupPage.css"
import loginBackground from "../assets/LoginBackground.jpg"
import logo from "../assets/logo.png"
import logo2 from "../assets/logo2.png"

const TOTAL_STEPS = 5

const COURSES = [
	"Bachelor of Science in Information Technology",
	"Bachelor of Science in Computer Science",
	"Bachelor of Science in Civil Engineering",
	"Bachelor of Science in Business Administration",
	"Bachelor of Science in Education",
	"Bachelor of Science in Nursing",
	"Bachelor of Science in Accountancy",
]

const SCHOLARSHIP_PROVIDERS = [
	"DOST",
	"CHED",
	"DSWD",
	"Provincial Government",
	"Private Sector",
	"University Scholarship",
	"Other",
]

const SCHOLARSHIP_TYPES = ["Scholarship", "Educational Assistance"]

async function encryptPasswordAES256(plainPassword) {
	if (!plainPassword) return ""

	const secret =
		import.meta.env.VITE_PASSWORD_SECRET ||
		"bulsuscholar-default-secret-key-32!!!"

	const enc = new TextEncoder()
	const keyBytes = enc.encode(secret.padEnd(32).slice(0, 32))

	const cryptoKey = await window.crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: "AES-GCM" },
		false,
		["encrypt"],
	)

	const iv = window.crypto.getRandomValues(new Uint8Array(12))
	const cipherBuffer = await window.crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		cryptoKey,
		enc.encode(plainPassword),
	)

	const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength)
	combined.set(iv, 0)
	combined.set(new Uint8Array(cipherBuffer), iv.byteLength)

	let binary = ""
	for (let i = 0; i < combined.byteLength; i += 1) {
		binary += String.fromCharCode(combined[i])
	}
	return btoa(binary)
}

function isPasswordStrong(pwd) {
	const hasCapital = /[A-Z]/.test(pwd)
	const hasNumber = /[0-9]/.test(pwd)
	const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)
	const hasMinLength = pwd.length >= 6
	return hasCapital && hasNumber && hasSpecial && hasMinLength
}

function getPasswordRequirements(pwd) {
	return {
		hasCapital: /[A-Z]/.test(pwd),
		hasNumber: /[0-9]/.test(pwd),
		hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
		hasMinLength: pwd.length >= 6,
	}
}

export default function SignupPage() {
	const navigate = useNavigate()
	const [step, setStep] = useState(1)
	const [userId, setUserId] = useState("")
	const [password, setPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [showPassword, setShowPassword] = useState(false)
	const [showConfirmPassword, setShowConfirmPassword] = useState(false)
	const [showPasswordTooltip, setShowPasswordTooltip] = useState(false)
	const [fname, setFname] = useState("")
	const [mname, setMname] = useState("")
	const [lname, setLname] = useState("")
	const [course, setCourse] = useState("")
	const [year, setYear] = useState("")
	const [section, setSection] = useState("")
	const [hasExistingScholarship, setHasExistingScholarship] = useState(null)
	const [showAddScholarshipForm, setShowAddScholarshipForm] = useState(false)
	const [editingScholarshipIndex, setEditingScholarshipIndex] = useState(null)
	const [scholarships, setScholarships] = useState([])
	const [scholarshipProvider, setScholarshipProvider] = useState("")
	const [scholarshipProviderOther, setScholarshipProviderOther] = useState("")
	const [scholarshipDate, setScholarshipDate] = useState("")
	const [scholarshipType, setScholarshipType] = useState("")
	const [corFile, setCorFile] = useState(null)
	const [showImagePreview, setShowImagePreview] = useState(false)
	const [registrationNumber, setRegistrationNumber] = useState("")
	const [isPending, setIsPending] = useState(false)
	const [verificationStatus, setVerificationStatus] = useState(null) // 'auto-verified' or 'pending-review'

	const isStep1Invalid =
		step === 1 &&
		(!userId.trim() ||
			!password.trim() ||
			!confirmPassword.trim() ||
			password !== confirmPassword ||
			!isPasswordStrong(password))

	const isStep2Invalid =
		step === 2 &&
		(!fname.trim() || !lname.trim() || !course || !year || !section.trim())

	const isStep3Invalid =
		step === 3 &&
		(hasExistingScholarship === null ||
			(hasExistingScholarship === true && scholarships.length === 0))

	const isStep4Invalid = step === 4 && (!corFile || !registrationNumber.trim())

	const isNextDisabled =
		isStep1Invalid || isStep2Invalid || isStep3Invalid || isStep4Invalid

	const handleNext = async (e) => {
		e.preventDefault()
		if (isNextDisabled) return

		// Step 1: Check if user ID exists in Firebase
		if (step === 1) {
			const studentId = userId.trim()

			if (!studentId) {
				toast.error("Please enter a User ID")
				return
			}

			if (!isPasswordStrong(password)) {
				toast.error(
					"Password must contain at least 1 capital letter, 1 number, and 1 special character (!@#$%^&*...)",
				)
				return
			}

			if (password !== confirmPassword) {
				toast.error("Passwords do not match")
				return
			}

			try {
				// Check if user exists in students or pendingStudent collections
				const [studentSnap, pendingSnap] = await Promise.all([
					getDoc(doc(db, "students", studentId)),
					getDoc(doc(db, "pendingStudent", studentId)),
				])

				if (studentSnap.exists()) {
					toast.error("This User ID is already registered in the system.")
					return
				}

				if (pendingSnap.exists()) {
					toast.error(
						"This User ID is already pending review. Please wait for approval.",
					)
					return
				}

				// User ID is available, proceed to next step silently
				setStep((s) => s + 1)
			} catch (err) {
				console.error("Error checking user ID:", err)
				toast.error("Failed to validate User ID. Please try again.")
			}
			return
		}

		if (step === TOTAL_STEPS) {
			try {
				const encryptedPassword = await encryptPasswordAES256(password)
				const studentId = userId.trim()

				// Prevent duplicate registrations in students or pendingStudent
				const [studentSnap, pendingSnap, existingSnap] = await Promise.all([
					getDoc(doc(db, "students", studentId)),
					getDoc(doc(db, "pendingStudent", studentId)),
					getDoc(doc(db, "existingStudent", studentId)),
				])

				if (studentSnap.exists() || pendingSnap.exists()) {
					toast.error(
						"This student number is already registered and is still in review.",
					)
					return
				}

				let corFilePayload = null
				if (corFile) {
					try {
						const imageData = await uploadToCloudinary(corFile)
						corFilePayload = {
							name: imageData.name,
							type: imageData.type,
							size: imageData.size,
							url: imageData.url,
						}
					} catch (uploadErr) {
						toast.error("Failed to upload COR file: " + uploadErr.message)
						console.error("Failed to upload COR file:", uploadErr)
						return
					}
				}

				const baseData = {
					course,
					fname: fname.trim(),
					lname: lname.trim(),
					mname: mname.trim(),
					studentnumber: studentId,
					userType: "student",
					year,
					section: section.trim(),
					registrationNumber: registrationNumber.trim(),
					corFile: corFilePayload,
					password: encryptedPassword,
					hasExistingScholarship,
					scholarships,
				}

				let isAutoVerified = false

				if (existingSnap.exists()) {
					// Check if names match in existingStudent record
					const existingData = existingSnap.data()
					const existingFname = existingData.fname?.trim().toLowerCase() || ""
					const existingLname = existingData.lname?.trim().toLowerCase() || ""
					const existingMname = existingData.mname?.trim().toLowerCase() || ""

					const userFname = fname.trim().toLowerCase()
					const userLname = lname.trim().toLowerCase()
					const userMname = mname.trim().toLowerCase()

					const namesMatch =
						existingFname === userFname &&
						existingLname === userLname &&
						existingMname === userMname

					if (namesMatch) {
						// Auto-approve if student exists in existingStudent and names match
						isAutoVerified = true
						await setDoc(
							doc(db, "students", studentId),
							{
								...baseData,
								isValidated: true,
								isPending: false,
								validatedAt: serverTimestamp(),
								createdAt: serverTimestamp(),
							},
							{ merge: true },
						)
						toast.success(
							"Your account has been verified! You can now log in.",
						)
					} else {
						// Names don't match - send to pending review
						await setDoc(doc(db, "pendingStudent", studentId), {
							...baseData,
							isValidated: false,
							isPending: true,
							validatedAt: null,
							createdAt: serverTimestamp(),
							namesMismatch: true,
						})
					}
				} else {
					// Student doesn't exist in existingStudent - send to pending review
					await setDoc(doc(db, "pendingStudent", studentId), {
						...baseData,
						isValidated: false,
						isPending: true,
						validatedAt: null,
						createdAt: serverTimestamp(),
					})
				}

				setVerificationStatus(
					isAutoVerified ? "auto-verified" : "pending-review",
				)
				setIsPending(true)
			} catch (err) {
				console.error("Error saving pending student:", err)
			}
			return
		}
		if (step < TOTAL_STEPS) setStep((s) => s + 1)
	}

	const handleBack = () => {
		if (step > 1) {
			if (step === 3 && showAddScholarshipForm) {
				setShowAddScholarshipForm(false)
			} else {
				setStep((s) => s - 1)
			}
		}
	}

	const handleSaveScholarship = () => {
		const provider =
			scholarshipProvider === "Other"
				? scholarshipProviderOther
				: scholarshipProvider
		if (!provider.trim() || !scholarshipDate || !scholarshipType) return
		const data = {
			provider,
			lastPayout: scholarshipDate,
			type: scholarshipType,
		}
		if (editingScholarshipIndex !== null) {
			setScholarships((prev) =>
				prev.map((s, i) => (i === editingScholarshipIndex ? data : s)),
			)
			setEditingScholarshipIndex(null)
		} else {
			setScholarships((prev) => [...prev, data])
		}
		setScholarshipProvider("")
		setScholarshipProviderOther("")
		setScholarshipDate("")
		setScholarshipType("")
		setShowAddScholarshipForm(false)
	}

	const handleEditScholarship = (index) => {
		const s = scholarships[index]
		const isOther = !SCHOLARSHIP_PROVIDERS.slice(0, -1).includes(s.provider)
		setScholarshipProvider(isOther ? "Other" : s.provider)
		setScholarshipProviderOther(isOther ? s.provider : "")
		setScholarshipDate(s.lastPayout || s.date || "")
		setScholarshipType(s.type)
		setEditingScholarshipIndex(index)
		setShowAddScholarshipForm(true)
	}

	const handleDeleteScholarship = (index) => {
		setScholarships((prev) => prev.filter((_, i) => i !== index))
	}

	const handleCancelScholarshipForm = () => {
		setShowAddScholarshipForm(false)
		setEditingScholarshipIndex(null)
		setScholarshipProvider("")
		setScholarshipProviderOther("")
		setScholarshipDate("")
		setScholarshipType("")
	}

	if (isPending) {
		return (
			<div className="login-page signup-page">
				<div
					className="login-panel login-panel-info"
					style={{ "--login-bg": `url(${loginBackground})` }}
				>
					<div className="login-info-inner">
						<div className="login-info-icon" aria-hidden>
							<img
								src={logo}
								alt="Institutional Student Programs and Services logo"
								className="login-logo-img"
							/>
						</div>
						<h1 className="login-info-title">
							Institutional Student Programs and Services
						</h1>
						<p className="login-info-desc">
							Empowering college students to achieve their educational dreams
							through streamlined scholarship management.
						</p>
						<ul className="login-info-features" role="list">
							<li>
								<span className="login-feature-title">
									Comprehensive Tracking
								</span>
								<span className="login-feature-desc">
									Monitor all college scholarship applications in one place
								</span>
							</li>
							<li>
								<span className="login-feature-title">Real-time Analytics</span>
								<span className="login-feature-desc">
									Get insights with powerful dashboards and reports
								</span>
							</li>
							<li>
								<span className="login-feature-title">
									Efficient Management
								</span>
								<span className="login-feature-desc">
									Streamline the review and approval process
								</span>
							</li>
						</ul>
					</div>
				</div>

				<div className="login-panel login-panel-form">
					<div className="login-form-inner signup-pending-inner">
						<img
							src={logo2}
							alt="Bulacan State University Office of the Scholarships"
							className="login-form-logo"
						/>
						<h2 className="login-form-title">BulsuScholar</h2>
						{verificationStatus === "auto-verified" ? (
							<>
								<div className="signup-pending-icon-wrap signup-verified-wrap">
									<span className="signup-verified-icon">✓</span>
								</div>
								<p className="signup-pending-title signup-verified-title">
									You are now verified!
								</p>
								<p className="signup-pending-info">
									Your account has been successfully verified. You can now log
									in to access your scholarship information and dashboard.
								</p>
								<button
									type="button"
									className="login-submit signup-pending-back-btn"
									onClick={() => navigate("/")}
								>
									Go to Login
								</button>
							</>
						) : (
							<>
								<div className="signup-pending-icon-wrap">
									<HiOutlineClock className="signup-pending-icon" aria-hidden />
								</div>
								<p className="signup-pending-title">
									Account verification pending
								</p>
								<p className="signup-pending-info">
									Your registration has been submitted and is under review.
									Verification typically takes 1–3 business days.
								</p>
								<button
									type="button"
									className="login-submit signup-pending-back-btn"
									onClick={() => navigate("/")}
								>
									Back to Login
								</button>
							</>
						)}
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="login-page signup-page">
			<div
				className="login-panel login-panel-info"
				style={{ "--login-bg": `url(${loginBackground})` }}
			>
				<div className="login-info-inner">
					<div className="login-info-icon" aria-hidden>
						<img
							src={logo}
							alt="Institutional Student Programs and Services logo"
							className="login-logo-img"
						/>
					</div>
					<h1 className="login-info-title">
						Institutional Student Programs and Services
					</h1>
					<p className="login-info-desc">
						Empowering college students to achieve their educational dreams
						through streamlined scholarship management.
					</p>
					<ul className="login-info-features" role="list">
						<li>
							<span className="login-feature-title">
								Comprehensive Tracking
							</span>
							<span className="login-feature-desc">
								Monitor all college scholarship applications in one place
							</span>
						</li>
						<li>
							<span className="login-feature-title">Real-time Analytics</span>
							<span className="login-feature-desc">
								Get insights with powerful dashboards and reports
							</span>
						</li>
						<li>
							<span className="login-feature-title">Efficient Management</span>
							<span className="login-feature-desc">
								Streamline the review and approval process
							</span>
						</li>
					</ul>
				</div>
			</div>

			<div className="login-panel login-panel-form">
				<div className="login-form-inner">
					<img
						src={logo2}
						alt="Bulacan State University Office of the Scholarships"
						className="login-form-logo"
					/>
					<h2 className="login-form-title">BulsuScholar</h2>
					<p className="login-form-subtitle">
						{step === 1 && "Create your account"}
						{step === 2 && "Enter your credentials."}
						{step === 3 &&
							(hasExistingScholarship === null
								? "Tell us about your scholarships."
								: "Add your scholarship details.")}
						{step === 4 && "Upload Certificate of Registration."}
						{step === 5 && "Review your information before submitting."}
					</p>
					<div
						className="signup-stepper"
						role="progressbar"
						aria-valuenow={step}
						aria-valuemin={1}
						aria-valuemax={TOTAL_STEPS}
						aria-label={`Step ${step} of ${TOTAL_STEPS}`}
					>
						{Array.from({ length: TOTAL_STEPS }, (_, i) => (
							<div key={i} className="stepper-segment">
								<div
									className={`stepper-circle ${step > i + 1 ? "stepper-circle--complete" : step === i + 1 ? "stepper-circle--current" : ""}`}
								/>
								{i < TOTAL_STEPS - 1 && (
									<div className="stepper-line">
										<div
											className="stepper-line-fill"
											style={{ width: step > i + 1 ? "100%" : "0%" }}
										/>
									</div>
								)}
							</div>
						))}
					</div>

					<form className="login-form" onSubmit={handleNext} noValidate>
						{step === 1 && (
							<>
								<label className="login-label" htmlFor="signup-user-id">
									User Id
								</label>
								<div className="login-input-wrap">
									<HiOutlineMail className="login-input-icon" aria-hidden />
									<input
										id="signup-user-id"
										type="text"
										className="login-input"
										placeholder="Enter your User Id"
										value={userId}
										onChange={(e) =>
											setUserId(e.target.value.replace(/\D/g, ""))
										}
										autoComplete="username"
										autoCapitalize="off"
									/>
								</div>

								<label className="login-label" htmlFor="signup-password">
									Password
								</label>
								<div className="password-input-container">
									<div
										className={`login-input-wrap ${
											password.trim() && !isPasswordStrong(password)
												? "login-input-wrap--error"
												: ""
										}`}
									>
										<HiOutlineLockClosed
											className="login-input-icon"
											aria-hidden
										/>
										<input
											id="signup-password"
											type={showPassword ? "text" : "password"}
											className="login-input"
											placeholder="Enter your password"
											value={password}
											onChange={(e) => setPassword(e.target.value)}
											onFocus={() => setShowPasswordTooltip(true)}
											onBlur={() => setShowPasswordTooltip(false)}
											autoComplete="new-password"
										/>
										<button
											type="button"
											className="login-input-eye-btn"
											onClick={() => setShowPassword((v) => !v)}
											aria-label={
												showPassword ? "Hide password" : "Show password"
											}
										>
											{showPassword ? (
												<HiOutlineEyeOff
													className="login-input-eye-icon"
													aria-hidden
												/>
											) : (
												<HiOutlineEye
													className="login-input-eye-icon"
													aria-hidden
												/>
											)}
										</button>
									</div>
									{showPasswordTooltip && password && (
										<div className="password-requirements-floating">
											<div
												className={`requirement ${
													getPasswordRequirements(password).hasMinLength
														? "requirement--met"
														: ""
												}`}
											>
												<span>✓</span> At least 6 characters
											</div>
											<div
												className={`requirement ${
													getPasswordRequirements(password).hasCapital
														? "requirement--met"
														: ""
												}`}
											>
												<span>✓</span> At least 1 capital letter
											</div>
											<div
												className={`requirement ${
													getPasswordRequirements(password).hasNumber
														? "requirement--met"
														: ""
												}`}
											>
												<span>✓</span> At least 1 number
											</div>
											<div
												className={`requirement ${
													getPasswordRequirements(password).hasSpecial
														? "requirement--met"
														: ""
												}`}
											>
												<span>✓</span> At least 1 special character (!@#$%...)
											</div>
										</div>
									)}
								</div>

								<label
									className="login-label"
									htmlFor="signup-confirm-password"
								>
									Confirm Password
								</label>
								<div className="login-input-wrap">
									<HiOutlineLockClosed
										className="login-input-icon"
										aria-hidden
									/>
									<input
										id="signup-confirm-password"
										type={showConfirmPassword ? "text" : "password"}
										className="login-input"
										placeholder="Confirm your password"
										value={confirmPassword}
										onChange={(e) => setConfirmPassword(e.target.value)}
										autoComplete="new-password"
									/>
									<button
										type="button"
										className="login-input-eye-btn"
										onClick={() => setShowConfirmPassword((v) => !v)}
										aria-label={
											showConfirmPassword ? "Hide password" : "Show password"
										}
									>
										{showConfirmPassword ? (
											<HiOutlineEyeOff
												className="login-input-eye-icon"
												aria-hidden
											/>
										) : (
											<HiOutlineEye
												className="login-input-eye-icon"
												aria-hidden
											/>
										)}
									</button>
								</div>
							</>
						)}

						{step === 2 && (
							<>
								<label className="login-label" htmlFor="signup-fname">
									First Name
								</label>
								<div className="login-input-wrap">
									<input
										id="signup-fname"
										type="text"
										className="login-input"
										placeholder="Enter first name"
										value={fname}
										onChange={(e) => setFname(e.target.value)}
										autoCapitalize="words"
									/>
								</div>

								<div className="signup-row">
									<div className="signup-field">
										<label className="login-label" htmlFor="signup-mname">
											Middle Name
										</label>
										<div className="login-input-wrap">
											<input
												id="signup-mname"
												type="text"
												className="login-input"
												placeholder="Middle name"
												value={mname}
												onChange={(e) => setMname(e.target.value)}
												autoCapitalize="words"
											/>
										</div>
									</div>
									<div className="signup-field">
										<label className="login-label" htmlFor="signup-lname">
											Last Name
										</label>
										<div className="login-input-wrap">
											<input
												id="signup-lname"
												type="text"
												className="login-input"
												placeholder="Last name"
												value={lname}
												onChange={(e) => setLname(e.target.value)}
												autoCapitalize="words"
											/>
										</div>
									</div>
								</div>

								<label className="login-label" htmlFor="signup-course">
									Course
								</label>
								<select
									id="signup-course"
									className="login-select"
									value={course}
									onChange={(e) => setCourse(e.target.value)}
								>
									<option value="" disabled>
										Select course
									</option>
									{COURSES.map((c) => (
										<option key={c} value={c}>
											{c}
										</option>
									))}
								</select>

								<div className="signup-row">
									<div className="signup-field">
										<label className="login-label" htmlFor="signup-year">
											Year
										</label>
										<select
											id="signup-year"
											className="login-select"
											value={year}
											onChange={(e) => setYear(e.target.value)}
										>
											<option value="" disabled>
												Select year
											</option>
											{[1, 2, 3, 4].map((y) => (
												<option key={y} value={y}>
													{y}
												</option>
											))}
										</select>
									</div>
									<div className="signup-field">
										<label className="login-label" htmlFor="signup-section">
											Section
										</label>
										<select
											id="signup-section"
											className="login-select"
											value={section}
											onChange={(e) => setSection(e.target.value)}
										>
											<option value="" disabled>
												Select section
											</option>
											{["A", "B", "C", "D", "E", "F", "G", "H"].map((sec) => (
												<option key={sec} value={sec}>
													{sec}
												</option>
											))}
										</select>
									</div>
								</div>
							</>
						)}
						{step === 3 && (
							<>
								{hasExistingScholarship === null ? (
									<>
										<p className="signup-question">
											Do you have an existing scholarship?
										</p>
										<div className="signup-yes-no">
											<button
												type="button"
												className="signup-choice-btn signup-choice-btn--yes"
												onClick={() => setHasExistingScholarship(true)}
											>
												Yes
											</button>
											<button
												type="button"
												className="signup-choice-btn signup-choice-btn--no"
												onClick={() => {
													setHasExistingScholarship(false)
													setStep(4)
												}}
											>
												No
											</button>
										</div>
									</>
								) : hasExistingScholarship ? (
									<div className="signup-scholarship-section">
										{!showAddScholarshipForm ? (
											<>
												<button
													type="button"
													className="signup-add-btn"
													onClick={() => setShowAddScholarshipForm(true)}
												>
													Add scholarship
												</button>
												{scholarships.length === 0 && (
													<button
														type="button"
														className="signup-no-scholarship-btn"
														onClick={() => setStep((s) => s + 1)}
													>
														I don't have any scholarship
													</button>
												)}
												{scholarships.length > 0 && (
													<ul className="scholarship-list">
														{scholarships.map((s, i) => (
															<li key={i} className="scholarship-item">
																<HiOutlineAcademicCap
																	className="scholarship-item-icon"
																	aria-hidden
																/>
																<span className="scholarship-item-name">
																	{s.provider}
																</span>
																<div className="scholarship-item-actions">
																	<button
																		type="button"
																		className="scholarship-item-btn scholarship-item-btn--edit"
																		onClick={() => handleEditScholarship(i)}
																		aria-label="Edit scholarship"
																	>
																		<HiOutlinePencil
																			className="scholarship-item-btn-icon"
																			aria-hidden
																		/>
																	</button>
																	<button
																		type="button"
																		className="scholarship-item-btn scholarship-item-btn--delete"
																		onClick={() => handleDeleteScholarship(i)}
																		aria-label="Delete scholarship"
																	>
																		<HiOutlineTrash
																			className="scholarship-item-btn-icon"
																			aria-hidden
																		/>
																	</button>
																</div>
															</li>
														))}
													</ul>
												)}
											</>
										) : (
											<div className="scholarship-form">
												<label
													className="login-label"
													htmlFor="scholarship-provider"
												>
													Scholarship Provider
												</label>
												<select
													id="scholarship-provider"
													className="login-select"
													value={scholarshipProvider}
													onChange={(e) =>
														setScholarshipProvider(e.target.value)
													}
												>
													<option value="">Select provider</option>
													{SCHOLARSHIP_PROVIDERS.map((p) => {
														const allSavedProviders = scholarships.map(
															(s) => s.provider,
														)
														const isAlreadySaved =
															allSavedProviders.includes(p) &&
															editingScholarshipIndex === null
														return (
															<option
																key={p}
																value={p}
																disabled={isAlreadySaved}
															>
																{p}
															</option>
														)
													})}
												</select>

												{scholarshipProvider === "Other" && (
													<>
														<label
															className="login-label"
															htmlFor="scholarship-provider-other"
														>
															Specify Provider
														</label>
														<div className="login-input-wrap">
															<input
																id="scholarship-provider-other"
																type="text"
																className="login-input"
																placeholder="Enter provider name"
																value={scholarshipProviderOther}
																onChange={(e) =>
																	setScholarshipProviderOther(e.target.value)
																}
															/>
														</div>
													</>
												)}

												<label
													className="login-label"
													htmlFor="scholarship-date"
												>
													Last Payout Date
												</label>
												<div className="login-input-wrap">
													<input
														id="scholarship-date"
														type="date"
														className="login-input"
														value={scholarshipDate}
														onChange={(e) => setScholarshipDate(e.target.value)}
														max={new Date().toISOString().split("T")[0]}
														onClick={(e) => e.currentTarget.showPicker?.()}
														onFocus={(e) => e.currentTarget.showPicker?.()}
													/>
												</div>

												<label
													className="login-label"
													htmlFor="scholarship-type"
												>
													Type of Scholarship
												</label>
												<select
													id="scholarship-type"
													className="login-select"
													value={scholarshipType}
													onChange={(e) => setScholarshipType(e.target.value)}
												>
													<option value="">Select type</option>
													{SCHOLARSHIP_TYPES.map((t) => (
														<option key={t} value={t}>
															{t}
														</option>
													))}
												</select>

												<div className="scholarship-form-actions">
													<button
														type="button"
														className="signup-back-btn"
														onClick={handleCancelScholarshipForm}
													>
														Cancel
													</button>
													<button
														type="button"
														className="login-submit"
														onClick={handleSaveScholarship}
														disabled={
															!scholarshipProvider.trim() ||
															(scholarshipProvider === "Other" &&
																!scholarshipProviderOther.trim()) ||
															!scholarshipDate ||
															!scholarshipType
														}
													>
														{editingScholarshipIndex !== null
															? "Update"
															: "Save"}
													</button>
												</div>
											</div>
										)}
									</div>
								) : (
									<p className="signup-step-content">
										No existing scholarship.
									</p>
								)}
							</>
						)}
						{step === 4 && (
							<>
								<label className="login-label" htmlFor="signup-cor-upload">
									Upload Certificate of Registration (COR)
								</label>
								<label
									className="signup-upload-wrap"
									htmlFor="signup-cor-upload"
								>
									<input
										id="signup-cor-upload"
										type="file"
										className="signup-file-input"
										accept=".png,.jpg,image/png,image/jpeg"
										onChange={(e) => {
											const file = e.target.files?.[0] ?? null
											if (file) {
												const validExtensions = ["png", "jpg"]
												const fileExtension = file.name
													.split(".")
													.pop()
													?.toLowerCase()

												if (!validExtensions.includes(fileExtension)) {
													toast.error(
														"Only PNG and JPG image files are allowed.",
													)
													e.target.value = ""
													setCorFile(null)
													return
												}
											}
											setCorFile(file)
										}}
									/>
									{corFile ? (
										<>
											<HiOutlineAcademicCap
												className="signup-upload-icon signup-upload-icon--success"
												aria-hidden
											/>
											<span className="signup-upload-filename">
												{corFile.name}
											</span>
										</>
									) : (
										<>
											<HiOutlineCloudUpload
												className="signup-upload-icon"
												aria-hidden
											/>
											<span className="signup-upload-hint">
												Drop file here or click to browse
											</span>
											<span className="signup-upload-formats">
												PNG or JPG only
											</span>
										</>
									)}
								</label>

								<p className="signup-cor-note">
									Registration Number will appear at the COR.
								</p>
								<label
									className="login-label"
									htmlFor="signup-registration-number"
								>
									Registration Number
								</label>
								<div className="login-input-wrap">
									<input
										id="signup-registration-number"
										type="text"
										className="login-input"
										placeholder="Enter registration number"
										value={registrationNumber}
										onChange={(e) =>
											setRegistrationNumber(e.target.value.replace(/\D/g, ""))
										}
									/>
								</div>
							</>
						)}
						{step === 5 && (
							<div className="signup-review">
								<div className="signup-review-section">
									<h3 className="signup-review-heading">Account</h3>
									<p className="signup-review-row">
										<span className="signup-review-label">User Id</span>{" "}
										{userId}
									</p>
								</div>
								<div className="signup-review-section">
									<h3 className="signup-review-heading">Personal</h3>
									<p className="signup-review-row">
										<span className="signup-review-label">Name</span>{" "}
										{[fname, mname, lname].filter(Boolean).join(" ")}
									</p>
									<p className="signup-review-row">
										<span className="signup-review-label">Course</span> {course}
									</p>
									<p className="signup-review-row">
										<span className="signup-review-label">Year</span> {year} ·{" "}
										<span className="signup-review-label">Section</span>{" "}
										{section}
									</p>
								</div>
								{scholarships.length > 0 && (
									<div className="signup-review-section">
										<h3 className="signup-review-heading">Scholarships</h3>
										<ul className="scholarship-list scholarship-review-list">
											{scholarships.map((s, i) => (
												<li
													key={i}
													className="scholarship-item scholarship-item-review"
												>
													<HiOutlineAcademicCap
														className="scholarship-item-icon"
														aria-hidden
													/>
													<div className="scholarship-item-content">
														<div className="scholarship-item-name">
															{s.provider}
														</div>
														<div className="scholarship-item-type">
															{s.type}
														</div>
														{s.lastPayout && (
															<div className="scholarship-item-payout">
																Last payout: {s.lastPayout}
															</div>
														)}
													</div>
												</li>
											))}
										</ul>
									</div>
								)}
								<div className="signup-review-section">
									<h3 className="signup-review-heading">COR</h3>
									<p className="signup-review-row">
										<span className="signup-review-label">File</span>
										{corFile ? (
											<button
												type="button"
												className="signup-preview-btn-mini"
												onClick={() => setShowImagePreview(true)}
												title={corFile.name}
											>
												View Image
											</button>
										) : (
											"—"
										)}
									</p>
									<p className="signup-review-row">
										<span className="signup-review-label">
											Registration No.
										</span>{" "}
										{registrationNumber || "—"}
									</p>
								</div>
							</div>
						)}

						{!(step === 3 && showAddScholarshipForm) && (
							<div className="signup-actions">
								{step > 1 && (
									<button
										type="button"
										className="signup-back-btn"
										onClick={handleBack}
									>
										Back
									</button>
								)}
								<button
									type="submit"
									className="login-submit"
									disabled={isNextDisabled}
								>
									{step === TOTAL_STEPS ? "Verify Account" : "Next"}
								</button>
							</div>
						)}

						<div className="login-create-account">
							<span className="login-create-text">
								Already have an account?
							</span>
							<button
								type="button"
								className="create-account-btn"
								onClick={() => navigate("/")}
							>
								Login now!
							</button>
						</div>
					</form>
				</div>
			</div>

			{showImagePreview && corFile && (
				<div
					className="signup-preview-modal-overlay"
					onClick={() => setShowImagePreview(false)}
				>
					<div
						className="signup-preview-modal"
						onClick={(e) => e.stopPropagation()}
					>
						<button
							type="button"
							className="signup-preview-close"
							onClick={() => setShowImagePreview(false)}
						>
							✕
						</button>
						<img
							src={URL.createObjectURL(corFile)}
							alt="COR File Preview"
							className="signup-preview-image"
						/>
					</div>
				</div>
			)}
		</div>
	)
}
