import { useEffect, useMemo, useRef, useState } from "react"
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
	HiOutlineUser,
	HiOutlineIdentification,
	HiOutlineCheckCircle,
} from "react-icons/hi"
import {
	serverTimestamp,
	recordExists,
	upsertStudent,
	db,
} from "../services/supabaseDataService"
import { toast } from "react-toastify"
import { supabase } from "../services/supabaseClient"
import { uploadToStorage } from "../services/storageService"
import { findMatchingGrantorScholars } from "../services/grantorService"
import {
	buildScholarshipRecord,
	getCurrentSemesterTag,
	getDocumentUrlsForStudent,
} from "../services/scholarshipService"
import { isPdf, convertPdfToImageFile } from "../utils/pdfConverter"
import { PROVINCES, getCitiesByProvince } from "../data/philippineLocations"
import "../css/LoginPage.css"
import "../css/SignupPage.css"
import loginBackground from "../assets/LoginBackground.jpg"
import logo from "../assets/logo.png"
import logo2 from "../assets/logo2.png"

const COURSES = [
	{
		course: "Bachelor of Elementary Education",
		majors: [],
	},
	{
		course: "Bachelor of Early Childhood Education",
		majors: [],
	},
	{
		course: "Bachelor of Secondary Education",
		majors: [
			"Science",
			"English (Minor in Mandarin)",
			"Mathematics",
			"Social Studies",
		],
	},
	{
		course: "Bachelor of Technology and Livelihood Education - Home Economics",
		majors: [],
	},
	{
		course: "Bachelor of Physical Education",
		majors: [],
	},
	{
		course: "Bachelor of Science in Business Administration",
		majors: ["Financial Management", "Marketing Management"],
	},
	{
		course: "Bachelor of Science in Entrepreneurship",
		majors: [],
	},
	{
		course: "Bachelor of Science in Information Technology",
		majors: [],
	},
	{
		course: "Bachelor of Science in Computer Engineering",
		majors: [],
	},
	{
		course: "Bachelor of Science in Industrial Engineering",
		majors: [],
	},
	{
		course: "Bachelor in Industrial Technology",
		majors: [
			"Automotive",
			"Drafting and Digital Graphics",
			"Computer",
			"Electronics",
			"Electrical",
			"Food Processing",
		],
	},
]

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isPasswordStrong(pwd) {
	const hasCapital = /[A-Z]/.test(pwd)
	const hasNumber = /[0-9]/.test(pwd)
	const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd)
	const hasMinLength = pwd.length >= 6
	return hasCapital && hasNumber && hasSpecial && hasMinLength
}

function getPasswordRequirements(pwd) {
	return {
		hasCapital: /[A-Z]/.test(pwd),
		hasNumber: /[0-9]/.test(pwd),
		hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd),
		hasMinLength: pwd.length >= 6,
	}
}

import {
	sendEmailNotification,
	getWelcomeEmailBody,
} from "../services/emailService"

function buildGrantorMatchScholarships(
	matches = [],
	studentDraft = {},
	studentId = "",
	semesterTag = "",
) {
	const hasMultipleMatches = matches.length >= 2
	return matches.map((match) => {
		const nextRecord = buildScholarshipRecord({
			name: match.scholarshipName || match.grantorName || "Scholarship",
			provider: match.grantorName || match.scholarshipName || "Grantor",
			studentId,
			type: "Scholarship",
			mode: "applied",
			documentUrls: getDocumentUrlsForStudent(studentDraft),
			semesterTag,
		})

		return {
			...nextRecord,
			name: match.scholarshipName || match.grantorName || nextRecord.name,
			provider:
				match.grantorName || match.scholarshipName || nextRecord.provider,
			providerType: match.providerType || nextRecord.providerType,
			status: hasMultipleMatches ? "Pending Selection" : "Matched",
			adminBlocked: hasMultipleMatches,
			adminBlockedAt: hasMultipleMatches ? new Date().toISOString() : null,
			matchSource: "grantor_roster",
			matchedGrantorId: match.grantorId || "",
			matchedGrantorName: match.grantorName || "",
			matchedScholarId: match.id || "",
			documentRequirementLabel: match.requiresFullDocs
				? "Requires COR and COG"
				: "Requires COR and COG",
		}
	})
}

function toGrantorMatchMetadata(matches = []) {
	return matches.map((match) => ({
		id: match.id || "",
		grantorId: match.grantorId || "",
		grantorName: match.grantorName || "",
		providerType: match.providerType || "",
		scholarshipName:
			match.scholarshipName || match.grantorName || "Scholarship",
		documentRequirementLabel: match.requiresFullDocs
			? "Requires COR and COG"
			: "Requires COR and COG",
	}))
}

export default function SignupPage() {
	const navigate = useNavigate()
	const [userId, setUserId] = useState("")
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [showPassword, setShowPassword] = useState(false)
	const [showConfirmPassword, setShowConfirmPassword] = useState(false)
	const [showPasswordTooltip, setShowPasswordTooltip] = useState(false)
	const [fname, setFname] = useState("")
	const [mname, setMname] = useState("")
	const [lname, setLname] = useState("")
	const [cpNumber, setCpNumber] = useState("")
	const [street, setStreet] = useState("")
	const [city, setCity] = useState("")
	const [province, setProvince] = useState("")
	const [postalCode, setPostalCode] = useState("")
	const [course, setCourse] = useState("")
	const [major, setMajor] = useState("")
	const [year, setYear] = useState("")
	const [section, setSection] = useState("")
	const [gwa, setGwa] = useState("")
	const [corFile, setCorFile] = useState(null)
	const [cogFile, setCogFile] = useState(null)
	const [showImagePreview, setShowImagePreview] = useState(false)
	const [previewFile, setPreviewFile] = useState(null)
	const [isPending, setIsPending] = useState(false)

	const isCogOptional = useMemo(() => {
		return false
	}, [])

	const [verificationStatus, setVerificationStatus] = useState(null)
	const [showReview, setShowReview] = useState(false)
	const [hasStartedReview, setHasStartedReview] = useState(false)
	const sectionCompletionRef = useRef({
		account: false,
		personal: false,
		school: false,
	})

	// Get selected course to check for majors
	const selectedCourse = COURSES.find((c) => c.course === course)
	const courseHasMajors = selectedCourse && selectedCourse.majors.length > 0

	const scrollToSection = (sectionId) => {
		const element = document.getElementById(sectionId)
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" })
		}
	}

	const handleReviewSubmit = (e) => {
		e.preventDefault()

		// Validate User ID
		if (!userId.trim()) {
			toast.error("Please enter a User ID")
			scrollToSection("section-account")
			return
		}

		// Validate Email
		if (!email.trim() || !EMAIL_REGEX.test(email)) {
			toast.error("Please enter a valid email address")
			scrollToSection("section-account")
			return
		}

		if (!isPasswordStrong(password)) {
			toast.error(
				"Password must contain at least 1 capital letter, 1 number, and 1 special character (!@#$%^&*)",
			)
			scrollToSection("section-account")
			return
		}

		if (password !== confirmPassword) {
			toast.error("Passwords do not match")
			scrollToSection("section-account")
			return
		}

		// Validate Personal Info
		if (!fname.trim() || !lname.trim() || !cpNumber.trim()) {
			toast.error("Please fill in all required personal information")
			scrollToSection("section-personal")
			return
		}

		// Validate CP Number
		if (cpNumber.trim().length < 11) {
			toast.error("Please enter a valid 11-digit CP Number")
			scrollToSection("section-personal")
			return
		}

		// Validate Address components
		if (
			!street.trim() ||
			!city.trim() ||
			!province.trim() ||
			!postalCode.trim()
		) {
			toast.error("Please complete your home address details")
			scrollToSection("section-personal")
			return
		}

		// Validate School Info
		if (!course || !year || !section.trim() || !gwa.trim()) {
			toast.error("Please complete your school information including GWA")
			scrollToSection("section-school")
			return
		}

		// Validate Major (if course has majors)
		if (courseHasMajors && !major.trim()) {
			toast.error("Please select a major for your course")
			scrollToSection("section-school")
			return
		}

		// Validate Stage 1 documents.
		if (!corFile) {
			toast.error("Please upload your Certificate of Registration (COR)")
			scrollToSection("section-cor")
			return
		}

		if (!cogFile) {
			toast.error("Please upload your Certificate of Grades (COG)")
			scrollToSection("section-cor")
			return
		}

		// All validations passed, show review
		setHasStartedReview(true)
		setShowReview(true)
	}

	const isAccountSectionComplete = useMemo(() => {
		return (
			!!userId.trim() &&
			EMAIL_REGEX.test(email) &&
			isPasswordStrong(password) &&
			password === confirmPassword
		)
	}, [userId, email, password, confirmPassword])

	const isPersonalSectionComplete = useMemo(() => {
		return (
			!!fname.trim() &&
			!!lname.trim() &&
			!!cpNumber.trim() &&
			cpNumber.trim().length >= 11 &&
			!!street.trim() &&
			!!city.trim() &&
			!!province.trim() &&
			!!postalCode.trim()
		)
	}, [fname, lname, cpNumber, street, city, province, postalCode])

	const isDocumentStageComplete = useMemo(() => {
		return Boolean(corFile && cogFile && gwa.trim())
	}, [corFile, cogFile, gwa])

	// Automatically move to next sections if complete
	useEffect(() => {
		if (showReview || isPending || hasStartedReview) return

		if (isDocumentStageComplete && !sectionCompletionRef.current.documents) {
			sectionCompletionRef.current.documents = true
			scrollToSection("section-account")
		}

		if (!isDocumentStageComplete) {
			sectionCompletionRef.current.documents = false
		}
	}, [isDocumentStageComplete, showReview, isPending, hasStartedReview])

	useEffect(() => {
		if (showReview || isPending || hasStartedReview) return

		if (isAccountSectionComplete && !sectionCompletionRef.current.account) {
			sectionCompletionRef.current.account = true
			scrollToSection("section-personal")
		}

		if (!isAccountSectionComplete) {
			sectionCompletionRef.current.account = false
		}
	}, [isAccountSectionComplete, showReview, isPending, hasStartedReview])

	useEffect(() => {
		if (showReview || isPending || hasStartedReview) return

		if (isPersonalSectionComplete && !sectionCompletionRef.current.personal) {
			sectionCompletionRef.current.personal = true
			scrollToSection("section-school")
		}

		if (!isPersonalSectionComplete) {
			sectionCompletionRef.current.personal = false
		}
	}, [isPersonalSectionComplete, showReview, isPending, hasStartedReview])

	const handleCourseChange = (e) => {
		setCourse(e.target.value)
		setMajor("") // Reset major when course changes
	}

	const handleSubmit = async (e) => {
		e.preventDefault()

		// Validate User ID
		if (!userId.trim()) {
			toast.error("Please enter a User ID")
			scrollToSection("section-account")
			return
		}

		// Validate Email
		if (!email.trim() || !EMAIL_REGEX.test(email)) {
			toast.error("Please enter a valid email address")
			scrollToSection("section-account")
			return
		}

		if (!isPasswordStrong(password)) {
			toast.error(
				"Password must contain at least 1 capital letter, 1 number, and 1 special character (!@#$%^&*)",
			)
			scrollToSection("section-account")
			return
		}

		if (password !== confirmPassword) {
			toast.error("Passwords do not match")
			scrollToSection("section-account")
			return
		}

		// Validate Personal Info
		if (!fname.trim() || !lname.trim() || !cpNumber.trim()) {
			toast.error("Please fill in all required personal information")
			scrollToSection("section-personal")
			return
		}

		// Validate CP Number
		if (cpNumber.trim().length < 11) {
			toast.error("Please enter a valid 11-digit CP Number")
			scrollToSection("section-personal")
			return
		}

		// Validate Address components
		if (
			!street.trim() ||
			!city.trim() ||
			!province.trim() ||
			!postalCode.trim()
		) {
			toast.error("Please complete your home address details")
			scrollToSection("section-personal")
			return
		}

		// Validate School Info
		if (!course || !year || !section.trim() || !gwa.trim()) {
			toast.error("Please complete your school information including GWA")
			scrollToSection("section-school")
			return
		}

		// Validate Major (if course has majors)
		if (courseHasMajors && !major.trim()) {
			toast.error("Please select a major for your course")
			scrollToSection("section-school")
			return
		}

		// Validate Stage 1 documents.
		if (!corFile) {
			toast.error("Please upload your Certificate of Registration (COR)")
			scrollToSection("section-cor")
			return
		}

		if (!cogFile) {
			toast.error("Please upload your Certificate of Grades (COG)")
			scrollToSection("section-cor")
			return
		}

		// Check if user ID exists in Supabase
		const studentId = userId.trim()
		try {
			const [studentExists, pendingExists, providerExists, adminExists] =
				await Promise.all([
					recordExists("students", studentId),
					recordExists("pending_students", studentId),
					recordExists("providers", studentId),
					recordExists("admins", studentId),
				])

			if (studentExists || providerExists || adminExists) {
				toast.error("This User ID is already registered in the system.")
				scrollToSection("section-account")
				return
			}

			if (pendingExists) {
				toast.error(
					"This User ID is already pending review. Please wait for approval.",
				)
				scrollToSection("section-account")
				return
			}

			console.log(
				"SignupPage: Starting Supabase Auth signUp for email:",
				email.trim(),
			)
			const { data: authData, error: authError } = await supabase.auth.signUp({
				email: email.trim(),
				password,
				options: {
					emailRedirectTo: `${window.location.origin}/confirm-email`,
					data: {
						user_id: studentId,
						user_type: "student",
						full_name: `${fname.trim()} ${lname.trim()}`.trim(),
					},
				},
			})

			if (authError) {
				console.error("SignupPage: Supabase Auth signUp ERROR:", authError)
				toast.error(
					authError.message || "Failed to create Supabase Auth account.",
				)
				return
			}
			console.log("SignupPage: Supabase Auth signUp SUCCESS:", authData)

			const semesterTag = getCurrentSemesterTag()
			let corFilePayload = null
			if (corFile) {
				try {
					console.log("SignupPage: Uploading COR file...")
					const imageData = await uploadToStorage(corFile, { folder: "COR" })
					const corFileId = `${corFile.name.replace(/\.[^/.]+$/, "")}_${studentId}`
					corFilePayload = {
						id: corFileId,
						name: imageData.name,
						type: imageData.type,
						size: imageData.size,
						url: imageData.url,
						semesterTag,
					}
					console.log("SignupPage: COR upload SUCCESS:", corFilePayload.url, "ID:", corFileId)
				} catch (uploadErr) {
					console.error("SignupPage: COR upload ERROR:", uploadErr)
					toast.error("Failed to upload COR file: " + uploadErr.message)
					return
				}
			}

			let cogFilePayload = null
			if (cogFile) {
				try {
					console.log("SignupPage: Uploading COG file...")
					const imageData = await uploadToStorage(cogFile, { folder: "COG" })
					const cogFileId = `${cogFile.name.replace(/\.[^/.]+$/, "")}_${studentId}`
					cogFilePayload = {
						id: cogFileId,
						name: imageData.name,
						type: imageData.type,
						size: imageData.size,
						url: imageData.url,
						semesterTag,
					}
					console.log("SignupPage: COG upload SUCCESS:", cogFilePayload.url, "ID:", cogFileId)
				} catch (uploadErr) {
					console.error("SignupPage: COG upload ERROR:", uploadErr)
					toast.error("Failed to upload COG file: " + uploadErr.message)
					return
				}
			}

			const registrationDraft = {
				course,
				major: major.trim(),
				email: email.trim(),
				fname: fname.trim(),
				lname: lname.trim(),
				mname: mname.trim(),
				cpNumber: cpNumber.trim(),
				street: street.trim(),
				city: city.trim(),
				province: province.trim(),
				postalCode: postalCode.trim(),
				studentnumber: studentId,
				userType: "student",
				authUserId: authData?.user?.id || "",
				year,
				section: section.trim(),
				gwa: gwa.trim(),
				corFile: corFilePayload,
				cogFile: cogFilePayload,
			}
			console.log(
				"SignupPage: Saving student record to database...",
				registrationDraft,
			)
			const matchedGrantors = await findMatchingGrantorScholars(
				db,
				registrationDraft,
			)
			const matchedScholarships = buildGrantorMatchScholarships(
				matchedGrantors,
				registrationDraft,
				studentId,
				semesterTag,
			)
			const hasMultipleMatchedGrantors = matchedScholarships.length >= 2
			const grantorConflictMessage = hasMultipleMatchedGrantors
				? "Multiple grantor matches were found based on your name and address. Choose one matched grantor first before requesting scholarship materials."
				: ""
			const baseData = {
				...registrationDraft,
				scholarships: matchedScholarships,
				grantorMatches: toGrantorMatchMetadata(matchedGrantors),
				scholarshipConflictWarning: hasMultipleMatchedGrantors,
				scholarshipConflictMessage: grantorConflictMessage,
				scholarshipRestrictionReason: hasMultipleMatchedGrantors
					? "multiple_scholarships"
					: null,
				...(hasMultipleMatchedGrantors
					? {
							restrictions: {
								accountAccess: false,
								scholarshipEligibility: true,
								complianceHold: false,
							},
						}
					: {}),
			}

			// All new students now go to pending review by default or auto-verified if no scholarship is needed
			// Since scholarships are removed from signup, we can auto-verify or keep them pending.
			// The user said "Student Creation of Account: Login and Reviewing of information",
			// usually this implies an admin review or just a simpler signup.
			// Given the previous logic, I'll set them to pending for safety, or auto-verify if that's the new standard.
			// Let's stick to auto-verify for now as there are no "blocking" scholarship requirements anymore during signup.

			const isAutoVerified = true

			if (isAutoVerified) {
				await upsertStudent(
					studentId,
					{
						...baseData,
						isValidated: true,
						isPending: false,
						validatedAt: serverTimestamp(),
						createdAt: serverTimestamp(),
					},
					{ merge: true },
				)
				console.log("SignupPage: Student document saved successfully to database")

				// Only send confirmation email after successful signup with no errors
				sendEmailNotification(
					email.trim(),
					`${fname.trim()} ${lname.trim()}`,
					"Welcome to BulsuScholar!",
					getWelcomeEmailBody(`${fname.trim()} ${lname.trim()}`),
				).catch((err) => console.error("Welcome email failed:", err))

				toast.success(
					"🎉 Congratulations! Your account has been successfully created.",
				)
				if (matchedScholarships.length === 1) {
					toast.info(
						`Matched grantor found: ${matchedScholarships[0].name}. Upload the required documents first before requesting materials.`,
					)
				} else if (matchedScholarships.length >= 2) {
					toast.info(
						"Multiple grantor matches were found. Choose one matched grantor in the scholarship section before requesting materials.",
					)
				}
			} else {
				await upsertStudent(
					studentId,
					{
						...baseData,
						isValidated: false,
						isPending: true,
						validatedAt: null,
						createdAt: serverTimestamp(),
					},
					{ pending: true },
				)
				toast.success("📋 Your application has been submitted for review.")
			}

			setVerificationStatus(isAutoVerified ? "auto-verified" : "pending-review")
			setIsPending(true)
		} catch (err) {
			console.error("Error saving student:", err)
			toast.error("Failed to create account. Please try again.")
		}
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
									Email Confirmation has been sent
								</p>
								<p className="signup-pending-info">
									Please check your email for a confirmation link. Click the link to verify your account and complete the registration process. If you don't see the email, please check your spam folder.
								</p>
								<div className="signup-verified-details">
									<p>
										<strong>What happens next?</strong>
									</p>
									<ul>
										<li>Verify your email address by clicking the confirmation link</li>
										<li>Complete any additional verification if required</li>
										<li>Access your account and student dashboard</li>
										<li>Begin tracking your scholarship applications</li>
									</ul>
								</div>
								<button
									type="button"
									className="login-submit signup-pending-back-btn"
									onClick={() => navigate("/")}
								>
									Go back to Login
								</button>
							</>
						) : (
							<>
								<div className="signup-pending-icon-wrap">
									<HiOutlineClock className="signup-pending-icon" aria-hidden />
								</div>
								<p className="signup-pending-title">
									📋 Application Under Review
								</p>
								<p className="signup-pending-info">
									Your application requires additional verification due to your
									scholarship selections. Our team will review your documents
									and contact you for an interview or additional requirements.
								</p>
								<div className="signup-pending-details">
									<p>
										<strong>What to expect:</strong>
									</p>
									<ul>
										<li>Email notification within 1-3 business days</li>
										<li>Possible interview or document verification</li>
										<li>Compliance check for selected scholarships</li>
										<li>Final approval notification</li>
									</ul>
									<p>
										<strong>Need help?</strong> Contact the Scholarships Office
										at scholarships@bulsu.edu.ph
									</p>
								</div>
								<button
									type="button"
									className="login-submit signup-pending-back-btn"
									onClick={() => navigate("/")}
								>
									Return to Login
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
						Create your account to get started
					</p>

					{!showReview && (
						<form
							className="login-form signup-scrollable-form"
							onSubmit={handleReviewSubmit}
							noValidate
						>
							<div className="signup-process-step signup-process-step--documents">
								<span>Stage 1</span>
								<strong>Submit Required Documents</strong>
								<p>Upload your COR and COG first before completing the student account form.</p>
							</div>

							{/* Document Upload Section */}
							<div id="section-cor" className="signup-form-section signup-form-section--documents">
								<div className="signup-section-header">
									<div className="signup-section-icon">
										<HiOutlineCloudUpload />
									</div>
									<h3 className="signup-section-title">Required Documents</h3>
								</div>

								{/* Certificate of Registration (COR) Upload */}
								<label className="login-label" htmlFor="signup-cor-upload">
									1. Certificate of Registration (COR){" "}
									<span className="required">*</span>
								</label>
								<label
									className="signup-upload-wrap"
									htmlFor="signup-cor-upload"
								>
									<input
										id="signup-cor-upload"
										type="file"
										className="signup-file-input"
										accept=".png,.jpg,.pdf,image/png,image/jpeg,application/pdf"
										onChange={(e) => {
											const file = e.target.files?.[0] ?? null
											if (file) {
												const validExtensions = ["png", "jpg", "pdf"]
												const fileExtension = file.name
													.split(".")
													.pop()
													?.toLowerCase()

												if (!validExtensions.includes(fileExtension)) {
													toast.error(
														"Only PNG, JPG, and PDF files are allowed.",
													)
													e.target.value = ""
													setCorFile(null)
													return
												}

												if (isPdf(file)) {
													toast.info("Converting PDF to image...")
													convertPdfToImageFile(file)
														.then((convertedFile) => {
															setCorFile(convertedFile)
															toast.success("PDF converted successfully!")
														})
														.catch((error) => {
															toast.error(
																`PDF conversion failed: ${error.message}`,
															)
															e.target.value = ""
															setCorFile(null)
														})
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
												Drop COR here or click to browse
											</span>
										</>
									)}
								</label>

								<label
									className="login-label"
									htmlFor="signup-cog-upload"
									style={{ marginTop: "1rem", display: "block" }}
								>
									2. Certificate of Grades (COG){" "}
									<span className="required">*</span>
								</label>
								<label
									className="signup-upload-wrap"
									htmlFor="signup-cog-upload"
								>
									<input
										id="signup-cog-upload"
										type="file"
										className="signup-file-input"
										accept=".png,.jpg,.pdf,image/png,image/jpeg,application/pdf"
										onChange={(e) => {
											const file = e.target.files?.[0] ?? null
											if (file) {
												const validExtensions = ["png", "jpg", "pdf"]
												const fileExtension = file.name
													.split(".")
													.pop()
													?.toLowerCase()

												if (!validExtensions.includes(fileExtension)) {
													toast.error(
														"Only PNG, JPG, and PDF files are allowed.",
													)
													e.target.value = ""
													setCogFile(null)
													return
												}

												if (isPdf(file)) {
													toast.info("Converting PDF to image...")
													convertPdfToImageFile(file)
														.then((convertedFile) => {
															setCogFile(convertedFile)
															toast.success("PDF converted successfully!")
														})
														.catch((error) => {
															toast.error(
																`PDF conversion failed: ${error.message}`,
															)
															e.target.value = ""
															setCogFile(null)
														})
													return
												}
											}
											setCogFile(file)
										}}
									/>
									{cogFile ? (
										<>
											<HiOutlineAcademicCap
												className="signup-upload-icon signup-upload-icon--success"
												aria-hidden
											/>
											<span className="signup-upload-filename">
												{cogFile.name}
											</span>
										</>
									) : (
										<>
											<HiOutlineCloudUpload
												className="signup-upload-icon"
												aria-hidden
											/>
											<span className="signup-upload-hint">
												Drop COG here or click to browse
											</span>
										</>
									)}
								</label>

								<label
									className="login-label"
									htmlFor="signup-gwa"
									style={{ marginTop: "1rem", display: "block" }}
								>
									GWA (General Weighted Average){" "}
									<span className="required">*</span>
								</label>
								<div
									className={`login-input-wrap ${!cogFile ? "login-input-wrap--disabled" : ""}`}
								>
									<input
										id="signup-gwa"
										type="number"
										step="0.01"
										min="1.0"
										max="5.0"
										className="login-input"
										placeholder={cogFile ? "e.g., 1.25" : "Upload COG first to enter GWA"}
										value={gwa}
										onChange={(e) => setGwa(e.target.value)}
										disabled={!cogFile}
									/>
								</div>

								<div
									className="signup-cor-note"
									style={{ marginTop: "1.5rem" }}
								>
									Stage 1 requires both COR and COG to verify your enrollment and academic status.
								</div>
							</div>

							<div className="signup-process-step signup-process-step--form">
								<span>Stage 2</span>
								<strong>Complete Student Form</strong>
								<p>Fill in your account, personal, and school information after the required documents.</p>
							</div>

							{/* Account Section */}
							<div id="section-account" className="signup-form-section">
								<div className="signup-section-header">
									<div className="signup-section-icon">
										<HiOutlineIdentification />
									</div>
									<h3 className="signup-section-title">Account Information</h3>
								</div>

								<label className="login-label" htmlFor="signup-user-id">
									User Id <span className="required">*</span>
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

								<label className="login-label" htmlFor="signup-email">
									Email Address <span className="required">*</span>
								</label>
								<div className="login-input-wrap">
									<HiOutlineMail className="login-input-icon" aria-hidden />
									<input
										id="signup-email"
										type="email"
										className="login-input"
										placeholder="Enter your email address"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										autoComplete="email"
									/>
								</div>

								<label className="login-label" htmlFor="signup-password">
									Password <span className="required">*</span>
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
												<span>✓</span> At least 1 special character (!@#$%)
											</div>
										</div>
									)}
								</div>

								<label
									className="login-label"
									htmlFor="signup-confirm-password"
								>
									Confirm Password <span className="required">*</span>
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
							</div>

							{/* Personal Information Section */}
							<div id="section-personal" className="signup-form-section">
								<div className="signup-section-header">
									<div className="signup-section-icon">
										<HiOutlineUser />
									</div>
									<h3 className="signup-section-title">Personal Information</h3>
								</div>

								<div className="signup-row">
									<div className="signup-field">
										<label className="login-label" htmlFor="signup-fname">
											First Name <span className="required">*</span>
										</label>
										<div className="login-input-wrap">
											<input
												id="signup-fname"
												type="text"
												className="login-input"
												placeholder="First name"
												value={fname}
												onChange={(e) => setFname(e.target.value)}
												autoCapitalize="words"
											/>
										</div>
									</div>
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
								</div>

								<div className="signup-row">
									<div className="signup-field">
										<label className="login-label" htmlFor="signup-lname">
											Last Name <span className="required">*</span>
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

								<div className="signup-row">
									<div className="signup-field">
										<label className="login-label" htmlFor="signup-cp">
											CP Number <span className="required">*</span>
										</label>
										<div className="login-input-wrap">
											<input
												id="signup-cp"
												type="text"
												className="login-input"
												placeholder="09XXXXXXXXX"
												maxLength={11}
												value={cpNumber}
												onChange={(e) =>
													setCpNumber(e.target.value.replace(/\D/g, ""))
												}
											/>
										</div>
									</div>
								</div>

								<h4 className="signup-form-subtitle-small">Home Address</h4>

								<label className="login-label" htmlFor="signup-province">
									Province <span className="required">*</span>
								</label>
								<select
									id="signup-province"
									className="login-select"
									value={province}
									onChange={(e) => {
										setProvince(e.target.value)
										setCity("")
									}}
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

								<div className="signup-row">
									<div className="signup-field">
										<label className="login-label" htmlFor="signup-city">
											City / Municipality <span className="required">*</span>
										</label>
										<select
											id="signup-city"
											className="login-select"
											value={city}
											onChange={(e) => setCity(e.target.value)}
											disabled={!province}
										>
											<option value="" disabled>
												{province ? "Select city" : "Select province first"}
											</option>
											{province &&
												getCitiesByProvince(province).map((c) => (
													<option key={c} value={c}>
														{c}
													</option>
												))}
										</select>
									</div>
									<div className="signup-field signup-field--small">
										<label className="login-label" htmlFor="signup-postal">
											Postal Code <span className="required">*</span>
										</label>
										<div className="login-input-wrap">
											<input
												id="signup-postal"
												type="text"
												className="login-input"
												placeholder="XXXX"
												maxLength={4}
												value={postalCode}
												onChange={(e) =>
													setPostalCode(e.target.value.replace(/\D/g, ""))
												}
											/>
										</div>
									</div>
								</div>

								<div className="signup-row">
									<div className="signup-field">
										<label className="login-label" htmlFor="signup-street">
											Street / Subdivision <span className="required">*</span>
										</label>
										<div className="login-input-wrap">
											<input
												id="signup-street"
												type="text"
												className="login-input"
												placeholder="Street name / Subdivision"
												value={street}
												onChange={(e) => setStreet(e.target.value)}
											/>
										</div>
									</div>
								</div>
							</div>

							{/* School Information Section */}
							<div id="section-school" className="signup-form-section">
								<div className="signup-section-header">
									<div className="signup-section-icon">
										<HiOutlineAcademicCap />
									</div>
									<h3 className="signup-section-title">School Information</h3>
								</div>

								<label className="login-label" htmlFor="signup-course">
									Course <span className="required">*</span>
								</label>
								<select
									id="signup-course"
									className="login-select"
									value={course}
									onChange={handleCourseChange}
								>
									<option value="" disabled>
										Select course
									</option>
									{COURSES.map((c) => (
										<option key={c.course} value={c.course}>
											{c.course}
										</option>
									))}
								</select>

								{courseHasMajors && (
									<>
										<label className="login-label" htmlFor="signup-major">
											Major <span className="required">*</span>
										</label>
										<select
											id="signup-major"
											className="login-select"
											value={major}
											onChange={(e) => setMajor(e.target.value)}
										>
											<option value="" disabled>
												Select major
											</option>
											{selectedCourse.majors.map((m) => (
												<option key={m} value={m}>
													{m}
												</option>
											))}
										</select>
									</>
								)}

								<div className="signup-row">
									<div className="signup-field">
										<label className="login-label" htmlFor="signup-year">
											Year <span className="required">*</span>
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
											Section <span className="required">*</span>
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
							</div>

							{/* Submit Button */}
							<div className="signup-form-submit">
								<button
									type="submit"
									className="login-submit login-submit--full"
								>
									Review & Submit
								</button>
							</div>

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
					)}
					{/* Review Section */}
					{showReview && (
						<div className="signup-review-section">
							<div className="signup-review-header">
								<h2 className="signup-review-title">Review Your Information</h2>
								<p className="signup-review-subtitle">
									Please review all your information before submitting. You can
									edit any section by clicking the edit buttons.
								</p>
							</div>

							{/* Account Information Review */}
							<div className="signup-review-card signup-review-card--account">
								<div className="signup-review-card-header">
									<h3 className="signup-review-card-title">
										<span className="signup-review-card-title-icon" aria-hidden>
											<HiOutlineUser />
										</span>
										Account Information
									</h3>
									<button
										type="button"
										className="signup-review-edit-btn"
										onClick={() => {
											setShowReview(false)
											scrollToSection("section-account")
										}}
									>
										<HiOutlinePencil /> Edit
									</button>
								</div>
								<div className="signup-review-content">
									<div className="signup-review-row">
										<span className="signup-review-label signup-review-label-group">
											<span className="signup-review-row-icon" aria-hidden>
												<HiOutlineIdentification />
											</span>
											<span>User ID:</span>
										</span>
										<span className="signup-review-value">{userId}</span>
									</div>
									<div className="signup-review-row">
										<span className="signup-review-label signup-review-label-group">
											<span className="signup-review-row-icon" aria-hidden>
												<HiOutlineMail />
											</span>
											<span>Email:</span>
										</span>
										<span className="signup-review-value">{email}</span>
									</div>
									<div className="signup-review-row">
										<span className="signup-review-label signup-review-label-group">
											<span className="signup-review-row-icon" aria-hidden>
												<HiOutlineLockClosed />
											</span>
											<span>Password:</span>
										</span>
										<span className="signup-review-value">
											{"*".repeat(12)}
										</span>
									</div>
								</div>
							</div>

							{/* Personal Information Review */}
							<div className="signup-review-card signup-review-card--personal">
								<div className="signup-review-card-header">
									<h3 className="signup-review-card-title">
										<span className="signup-review-card-title-icon" aria-hidden>
											<HiOutlineIdentification />
										</span>
										Personal Information
									</h3>
									<button
										type="button"
										className="signup-review-edit-btn"
										onClick={() => {
											setShowReview(false)
											scrollToSection("section-personal")
										}}
									>
										<HiOutlinePencil /> Edit
									</button>
								</div>
								<div className="signup-review-content">
									<div className="signup-review-row">
										<span className="signup-review-label signup-review-label-group">
											<span className="signup-review-row-icon" aria-hidden>
												<HiOutlineUser />
											</span>
											<span>Full Name:</span>
										</span>
										<span className="signup-review-value">
											{fname} {mname} {lname}
										</span>
									</div>
									<div className="signup-review-row">
										<span className="signup-review-label signup-review-label-group">
											<span className="signup-review-row-icon" aria-hidden>
												<HiOutlineUser />
											</span>
											<span>CP Number:</span>
										</span>
										<span className="signup-review-value">{cpNumber}</span>
									</div>
									<div className="signup-review-row">
										<span className="signup-review-label signup-review-label-group">
											<span className="signup-review-row-icon" aria-hidden>
												<HiOutlineIdentification />
											</span>
											<span>Home Address:</span>
										</span>
										<span className="signup-review-value">
											{street}, {city}, {province} {postalCode}
										</span>
									</div>
								</div>
							</div>

							{/* School Information Review */}
							<div className="signup-review-card signup-review-card--school">
								<div className="signup-review-card-header">
									<h3 className="signup-review-card-title">
										<span className="signup-review-card-title-icon" aria-hidden>
											<HiOutlineAcademicCap />
										</span>
										School Information
									</h3>
									<button
										type="button"
										className="signup-review-edit-btn"
										onClick={() => {
											setShowReview(false)
											scrollToSection("section-school")
										}}
									>
										<HiOutlinePencil /> Edit
									</button>
								</div>
								<div className="signup-review-content">
									<div className="signup-review-row">
										<span className="signup-review-label signup-review-label-group">
											<span className="signup-review-row-icon" aria-hidden>
												<HiOutlineAcademicCap />
											</span>
											<span>Course:</span>
										</span>
										<span className="signup-review-value">{course}</span>
									</div>
									{major && (
										<div className="signup-review-row">
											<span className="signup-review-label signup-review-label-group">
												<span className="signup-review-row-icon" aria-hidden>
													<HiOutlineAcademicCap />
												</span>
												<span>Major:</span>
											</span>
											<span className="signup-review-value">{major}</span>
										</div>
									)}
									<div className="signup-review-row">
										<span className="signup-review-label signup-review-label-group">
											<span className="signup-review-row-icon" aria-hidden>
												<HiOutlineIdentification />
											</span>
											<span>Year & Section:</span>
										</span>
										<span className="signup-review-value">
											{year} - {section}
										</span>
									</div>
									<div className="signup-review-row">
										<span className="signup-review-label signup-review-label-group">
											<span className="signup-review-row-icon" aria-hidden>
												<HiOutlinePencil />
											</span>
											<span>GWA:</span>
										</span>
										<span className="signup-review-value">{gwa}</span>
									</div>
								</div>
							</div>

							{/* Document Upload Review */}
							{(corFile || cogFile) && (
								<div className="signup-review-card signup-review-card--documents">
									<div className="signup-review-card-header">
										<h3 className="signup-review-card-title">
											<span
												className="signup-review-card-title-icon"
												aria-hidden
											>
												<HiOutlineCloudUpload />
											</span>
											Uploaded Documents
										</h3>
										<button
											type="button"
											className="signup-review-edit-btn"
											onClick={() => {
												setShowReview(false)
												scrollToSection("section-cor")
											}}
										>
											<HiOutlinePencil /> Edit
										</button>
									</div>
									<div className="signup-review-documents">
										{corFile && (
											<div className="signup-review-document">
												<div className="signup-review-document-info">
													<span className="signup-review-document-label signup-review-label-group">
														<span
															className="signup-review-row-icon"
															aria-hidden
														>
															<HiOutlineCloudUpload />
														</span>
														<span>Certificate of Registration (COR):</span>
													</span>
													<span className="signup-review-document-name signup-review-label-group">
														<span
															className="signup-review-row-icon"
															aria-hidden
														>
															<HiOutlineIdentification />
														</span>
														<span>{corFile.name}</span>
													</span>
												</div>
												<div className="signup-review-document-preview">
													<img
														src={URL.createObjectURL(corFile)}
														alt="COR Preview"
														className="signup-review-document-image"
														onClick={() => {
															setPreviewFile(corFile)
															setShowImagePreview(true)
														}}
													/>
												</div>
											</div>
										)}
										{cogFile && (
											<div
												className="signup-review-document"
												style={{ marginTop: "1rem" }}
											>
												<div className="signup-review-document-info">
													<span className="signup-review-document-label signup-review-label-group">
														<span
															className="signup-review-row-icon"
															aria-hidden
														>
															<HiOutlineCloudUpload />
														</span>
														<span>Certificate of Grades (COG):</span>
													</span>
													<span className="signup-review-document-name signup-review-label-group">
														<span
															className="signup-review-row-icon"
															aria-hidden
														>
															<HiOutlineIdentification />
														</span>
														<span>{cogFile.name}</span>
													</span>
												</div>
												<div className="signup-review-document-preview">
													<img
														src={URL.createObjectURL(cogFile)}
														alt="COG Preview"
														className="signup-review-document-image"
														onClick={() => {
															setPreviewFile(cogFile)
															setShowImagePreview(true)
														}}
													/>
												</div>
											</div>
										)}
									</div>
								</div>
							)}

							{/* Final Submit Actions */}
							<div className="signup-review-actions">
								<button
									type="button"
									className="signup-review-back-btn"
									onClick={() => setShowReview(false)}
								>
									Back to Edit
								</button>
								<button
									type="button"
									className="login-submit signup-review-submit-btn"
									onClick={handleSubmit}
								>
									Create Account
								</button>
							</div>
						</div>
					)}
				</div>
			</div>

			{showImagePreview && previewFile && (
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
							src={URL.createObjectURL(previewFile)}
							alt="Document Preview"
							className="signup-preview-image"
						/>
					</div>
				</div>
			)}
		</div>
	)
}
