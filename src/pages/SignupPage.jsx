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
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore"
import { toast } from "react-toastify"
import { db } from "../../firebase"
import { uploadToCloudinary } from "../services/cloudinaryService"
import { encryptPasswordAES256 } from "../services/authService"
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

const SCHOLARSHIP_PROVIDERS = [
	"Cong. Tina Pancho",
	"Morisson",
	"Kuya Win Scholarship Program",
	"Other",
]

const SCHOLARSHIP_TYPES = ["Scholarship", "Educational Assistance"]
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
	const [course, setCourse] = useState("")
	const [major, setMajor] = useState("")
	const [year, setYear] = useState("")
	const [section, setSection] = useState("")
	const [hasExistingScholarship, setHasExistingScholarship] = useState(null)
	const [showAddScholarshipForm, setShowAddScholarshipForm] = useState(false)
	const [editingScholarshipIndex, setEditingScholarshipIndex] = useState(null)
	const [scholarships, setScholarships] = useState([])
	const [scholarshipProvider, setScholarshipProvider] = useState("")
	const [scholarshipProviderOther, setScholarshipProviderOther] = useState("")
	const [scholarshipType, setScholarshipType] = useState("")
	const [kuyaWinCor, setKuyaWinCor] = useState(null)
	const [kuyaWinCog, setKuyaWinCog] = useState(null)
	const [kuyaWinSchoolId, setKuyaWinSchoolId] = useState(null)
	const [corFile, setCorFile] = useState(null)
	const [cogFile, setCogFile] = useState(null)
	const [schoolIdFile, setSchoolIdFile] = useState(null)
	const [showImagePreview, setShowImagePreview] = useState(false)
	const [previewFile, setPreviewFile] = useState(null)
	const [isPending, setIsPending] = useState(false)
	const [verificationStatus, setVerificationStatus] = useState(null)
	const [showReview, setShowReview] = useState(false)
	const [hasStartedReview, setHasStartedReview] = useState(false)
	const sectionCompletionRef = useRef({
		account: false,
		personal: false,
		scholarship: false,
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
		if (!fname.trim() || !lname.trim() || !course || !year || !section.trim()) {
			toast.error("Please fill in all required personal information")
			scrollToSection("section-personal")
			return
		}

		// Validate Major (if course has majors)
		if (courseHasMajors && !major.trim()) {
			toast.error("Please select a major for your course")
			scrollToSection("section-personal")
			return
		}

		// Validate Scholarship
		if (hasExistingScholarship === null) {
			toast.error("Please indicate if you have an existing scholarship")
			scrollToSection("section-scholarship")
			return
		}

		if (hasExistingScholarship === true && scholarships.length === 0) {
			toast.error("Please add your scholarship details or select 'No'")
			scrollToSection("section-scholarship")
			return
		}

		// Validate Documents based on scholarship
		if (requireCog && !cogFile) {
			toast.error("Please upload your Last Semester Certificate of Grades")
			scrollToSection("section-cor")
			return
		}

		if (requireCor && !corFile) {
			toast.error("Please upload your Certificate of Registration (COR)")
			scrollToSection("section-cor")
			return
		}

		if (requireSchoolId && !schoolIdFile) {
			toast.error("Please upload your School ID or Valid ID")
			scrollToSection("section-cor")
			return
		}

		// All validations passed, show review
		setHasStartedReview(true)
		setShowReview(true)
	}

	// Determine required documents based on added scholarships
	const getRequiredDocuments = () => {
		// If user has no scholarship, only require COR
		if (hasExistingScholarship === false) {
			return { requireCor: true, requireCog: false, requireSchoolId: false }
		}

		// If user said yes to scholarship but hasn't added any, don't require documents yet
		if (!hasExistingScholarship || scholarships.length === 0) {
			return { requireCor: false, requireCog: false, requireSchoolId: false }
		}

		const requiresFullDocs = scholarships.some((s) => {
			const provider = s.provider.toLowerCase()
			return (
				provider.includes("kuya win") ||
				provider.includes("other") ||
				!["cong. tina pancho", "morisson"].some((p) =>
					provider.includes(p.toLowerCase()),
				)
			)
		})

		const requiresCorOnly = scholarships.some((s) => {
			const provider = s.provider.toLowerCase()
			return provider === "cong. tina pancho" || provider === "morisson"
		})

		// If any scholarship requires full docs, show all
		if (requiresFullDocs) {
			return { requireCor: true, requireCog: true, requireSchoolId: true }
		}

		// If any scholarship requires COR only
		if (requiresCorOnly) {
			return { requireCor: true, requireCog: false, requireSchoolId: false }
		}

		return { requireCor: false, requireCog: false, requireSchoolId: false }
	}

	const { requireCor, requireCog, requireSchoolId } = getRequiredDocuments()

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
			!!course &&
			(!courseHasMajors || !!major.trim()) &&
			!!year &&
			!!section.trim()
		)
	}, [fname, lname, course, courseHasMajors, major, year, section])

	const isScholarshipSectionComplete = useMemo(() => {
		return (
			hasExistingScholarship === false ||
			(hasExistingScholarship === true && scholarships.length > 0)
		)
	}, [hasExistingScholarship, scholarships.length])

	// Keep uploaded files in sync with current scholarship requirements.
	// If a document is no longer required, clear it so it won't appear in review.
	useEffect(() => {
		if (!requireCor && corFile) {
			setCorFile(null)
			if (previewFile === corFile) {
				setPreviewFile(null)
				setShowImagePreview(false)
			}
		}

		if (!requireCog && cogFile) {
			setCogFile(null)
			if (previewFile === cogFile) {
				setPreviewFile(null)
				setShowImagePreview(false)
			}
		}

		if (!requireSchoolId && schoolIdFile) {
			setSchoolIdFile(null)
			if (previewFile === schoolIdFile) {
				setPreviewFile(null)
				setShowImagePreview(false)
			}
		}
	}, [
		requireCor,
		requireCog,
		requireSchoolId,
		corFile,
		cogFile,
		schoolIdFile,
		previewFile,
	])

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
			scrollToSection("section-scholarship")
		}

		if (!isPersonalSectionComplete) {
			sectionCompletionRef.current.personal = false
		}
	}, [isPersonalSectionComplete, showReview, isPending, hasStartedReview])

	useEffect(() => {
		if (showReview || isPending || hasStartedReview) return

		const hasDocumentSection = requireCor || requireCog || requireSchoolId
		if (
			hasDocumentSection &&
			isScholarshipSectionComplete &&
			!sectionCompletionRef.current.scholarship
		) {
			sectionCompletionRef.current.scholarship = true
			scrollToSection("section-cor")
		}

		if (!isScholarshipSectionComplete) {
			sectionCompletionRef.current.scholarship = false
		}
	}, [
		isScholarshipSectionComplete,
		requireCor,
		requireCog,
		requireSchoolId,
		showReview,
		isPending,
		hasStartedReview,
	])

	// Helper function to determine if student should be auto-verified based on scholarships
	const shouldAutoVerify = (scholarshipList) => {
		if (!scholarshipList || scholarshipList.length === 0) {
			return true // No scholarships means auto-verified
		}

		// Check if any scholarship requires approval (Kuya Win or Other)
		const requiresApproval = scholarshipList.some((s) => {
			const provider = s.provider.toLowerCase().trim()
			return provider.includes("kuya win") || provider === "other"
		})

		if (requiresApproval) {
			return false // If any scholarship requires approval, not auto-verified
		}

		// Check if all scholarships are only Cong. Tina Pancho and/or Morisson
		const allowedProviders = scholarshipList.every((s) => {
			const provider = s.provider.toLowerCase().trim()
			return provider === "cong. tina pancho" || provider === "morisson"
		})

		return allowedProviders // Auto-verify only if all scholarships are allowed providers
	}

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
		if (!fname.trim() || !lname.trim() || !course || !year || !section.trim()) {
			toast.error("Please fill in all required personal information")
			scrollToSection("section-personal")
			return
		}

		// Validate Major (if course has majors)
		if (courseHasMajors && !major.trim()) {
			toast.error("Please select a major for your course")
			scrollToSection("section-personal")
			return
		}

		// Validate Scholarship
		if (hasExistingScholarship === null) {
			toast.error("Please indicate if you have an existing scholarship")
			scrollToSection("section-scholarship")
			return
		}

		if (hasExistingScholarship === true && scholarships.length === 0) {
			toast.error("Please add your scholarship details or select 'No'")
			scrollToSection("section-scholarship")
			return
		}

		// Validate Documents based on scholarship
		if (requireCog && !cogFile) {
			toast.error("Please upload your Last Semester Certificate of Grades")
			scrollToSection("section-cor")
			return
		}

		if (requireCor && !corFile) {
			toast.error("Please upload your Certificate of Registration (COR)")
			scrollToSection("section-cor")
			return
		}

		if (requireSchoolId && !schoolIdFile) {
			toast.error("Please upload your School ID or Valid ID")
			scrollToSection("section-cor")
			return
		}

		// Check if user ID exists in Firebase
		const studentId = userId.trim()
		try {
			const [studentSnap, pendingSnap] = await Promise.all([
				getDoc(doc(db, "students", studentId)),
				getDoc(doc(db, "pendingStudent", studentId)),
			])

			if (studentSnap.exists()) {
				toast.error("This User ID is already registered in the system.")
				scrollToSection("section-account")
				return
			}

			if (pendingSnap.exists()) {
				toast.error(
					"This User ID is already pending review. Please wait for approval.",
				)
				scrollToSection("section-account")
				return
			}

			// All validations passed, proceed with registration
			const encryptedPassword = await encryptPasswordAES256(password)

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

			let cogFilePayload = null
			if (cogFile) {
				try {
					const imageData = await uploadToCloudinary(cogFile)
					cogFilePayload = {
						name: imageData.name,
						type: imageData.type,
						size: imageData.size,
						url: imageData.url,
					}
				} catch (uploadErr) {
					toast.error(
						"Failed to upload Certificate of Grades file: " + uploadErr.message,
					)
					console.error("Failed to upload COG file:", uploadErr)
					return
				}
			}

			let schoolIdFilePayload = null
			if (schoolIdFile) {
				try {
					const imageData = await uploadToCloudinary(schoolIdFile)
					schoolIdFilePayload = {
						name: imageData.name,
						type: imageData.type,
						size: imageData.size,
						url: imageData.url,
					}
				} catch (uploadErr) {
					toast.error("Failed to upload School ID file: " + uploadErr.message)
					console.error("Failed to upload School ID file:", uploadErr)
					return
				}
			}

			const baseData = {
				course,
				major: major.trim(),
				email: email.trim(),
				fname: fname.trim(),
				lname: lname.trim(),
				mname: mname.trim(),
				studentnumber: studentId,
				userType: "student",
				year,
				section: section.trim(),
				corFile: corFilePayload,
				cogFile: cogFilePayload,
				schoolIdFile: schoolIdFilePayload,
				password: encryptedPassword,
				hasExistingScholarship,
				scholarships,
			}

			// Determine if student should be auto-verified based on scholarships
			const isAutoVerified = shouldAutoVerify(scholarships)

			if (isAutoVerified) {
				// Auto-verified students go directly to students collection
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
					"🎉 Congratulations! Your account has been automatically verified based on your scholarship selections.",
				)
			} else {
				// Students requiring approval go to pendingStudent collection
				await setDoc(doc(db, "pendingStudent", studentId), {
					...baseData,
					isValidated: false,
					isPending: true,
					validatedAt: null,
					createdAt: serverTimestamp(),
				})
				toast.success(
					"📋 Your application has been submitted for review. We'll contact you for the next steps.",
				)
			}

			setVerificationStatus(isAutoVerified ? "auto-verified" : "pending-review")
			setIsPending(true)
		} catch (err) {
			console.error("Error saving pending student:", err)
			toast.error("Failed to create account. Please try again.")
		}
	}

	const handleSaveScholarship = () => {
		let provider
		if (scholarshipProvider === "Other") {
			provider = scholarshipProviderOther.trim()
			if (!provider) {
				toast.error("Please specify the scholarship provider name")
				return
			}
		} else {
			provider = scholarshipProvider
		}

		if (!provider || !scholarshipType) return

		const data = {
			provider,
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
		// Reset form to default state
		setScholarshipProvider("")
		setScholarshipProviderOther("")
		setScholarshipType("")
		setShowAddScholarshipForm(false)
	}

	const handleEditScholarship = (index) => {
		const s = scholarships[index]
		const provider = (s.provider || "").trim()
		const isUnsetProvider = !provider || provider.toLowerCase() === "none"
		const isOther =
			!isUnsetProvider && !SCHOLARSHIP_PROVIDERS.slice(0, -1).includes(provider)
		setScholarshipProvider(isUnsetProvider ? "" : isOther ? "Other" : provider)
		setScholarshipProviderOther(isOther ? provider : "")
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
									🎉 Account Successfully Verified!
								</p>
								<p className="signup-pending-info">
									Your scholarship application has been automatically approved
									based on your selected scholarships. You now have full access
									to the BulsuScholar platform to track your applications and
									manage your scholarship information.
								</p>
								<div className="signup-verified-details">
									<p>
										<strong>What happens next?</strong>
									</p>
									<ul>
										<li>Access your personalized student dashboard</li>
										<li>View and update your scholarship details</li>
										<li>Receive notifications about new opportunities</li>
										<li>Track your application progress</li>
									</ul>
								</div>
								<button
									type="button"
									className="login-submit signup-pending-back-btn"
									onClick={() => navigate("/")}
								>
									Continue to Login
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

								<label className="login-label" htmlFor="signup-fname">
									First Name <span className="required">*</span>
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

							{/* Scholarship Section */}
							<div id="section-scholarship" className="signup-form-section">
								<div className="signup-section-header">
									<div className="signup-section-icon">
										<HiOutlineAcademicCap />
									</div>
									<h3 className="signup-section-title">
										Scholarship Information
									</h3>
								</div>

								{hasExistingScholarship === null && (
									<>
										<p className="signup-question">
											Do you have an existing scholarship?{" "}
											<span className="required">*</span>
										</p>
										<div className="signup-yes-no">
											<button
												type="button"
												className={`signup-choice-btn signup-choice-btn--yes ${hasExistingScholarship === true ? "signup-choice-btn--active" : ""}`}
												onClick={() => setHasExistingScholarship(true)}
											>
												<HiOutlineCheckCircle /> Yes
											</button>
											<button
												type="button"
												className={`signup-choice-btn signup-choice-btn--no ${hasExistingScholarship === false ? "signup-choice-btn--active" : ""}`}
												onClick={() => {
													setHasExistingScholarship(false)
													setScholarships([])
												}}
											>
												No
											</button>
										</div>
									</>
								)}

								{hasExistingScholarship === true && (
									<div className="signup-scholarship-section">
										{!showAddScholarshipForm ? (
											<>
												<button
													type="button"
													className="signup-add-btn"
													onClick={() => {
														setScholarshipProvider("")
														setScholarshipProviderOther("")
														setScholarshipType("")
														setShowAddScholarshipForm(true)
													}}
												>
													+ Add Scholarship
												</button>
												{scholarships.length === 0 && (
													<button
														type="button"
														className="signup-no-scholarship-btn"
														onClick={() => {
															setHasExistingScholarship(false)
															scrollToSection("section-cor")
														}}
													>
														Skip & continue to COR upload
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
																<div className="scholarship-item-content">
																	<span className="scholarship-item-name">
																		{s.provider}
																	</span>
																	<span className="scholarship-item-type">
																		{s.type}
																	</span>
																</div>
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
													<option value="" disabled>
														Select provider
													</option>
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
													<option value="" disabled>
														Select type
													</option>
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
								)}

								{hasExistingScholarship === false && (
									<p className="signup-step-content">
										No existing scholarship. Please continue to upload your COR.
									</p>
								)}
							</div>

							{/* COR Section */}
							{(requireCor || requireCog || requireSchoolId) && (
								<div id="section-cor" className="signup-form-section">
									<div className="signup-section-header">
										<div className="signup-section-icon">
											<HiOutlineCloudUpload />
										</div>
										<h3 className="signup-section-title">Document Upload</h3>
									</div>

									{/* Certificate of Grades Upload */}
									{requireCog && (
										<>
											<label
												className="login-label"
												htmlFor="signup-cog-upload"
											>
												Last Semester - Certificate of Grades{" "}
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
																setCogFile(null)
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
															Drop file here or click to browse
														</span>
														<span className="signup-upload-formats">
															PNG or JPG only
														</span>
													</>
												)}
											</label>
										</>
									)}

									{/* Certificate of Registration (COR) Upload */}
									{requireCor && (
										<>
											<label
												className="login-label"
												htmlFor="signup-cor-upload"
											>
												Certificate of Registration (COR){" "}
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
										</>
									)}

									{/* School ID / Valid ID Upload */}
									{requireSchoolId && (
										<>
											<label
												className="login-label"
												htmlFor="signup-schoolid-upload"
											>
												School ID / Valid ID <span className="required">*</span>
											</label>
											<label
												className="signup-upload-wrap"
												htmlFor="signup-schoolid-upload"
											>
												<input
													id="signup-schoolid-upload"
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
																setSchoolIdFile(null)
																return
															}
														}
														setSchoolIdFile(file)
													}}
												/>
												{schoolIdFile ? (
													<>
														<HiOutlineAcademicCap
															className="signup-upload-icon signup-upload-icon--success"
															aria-hidden
														/>
														<span className="signup-upload-filename">
															{schoolIdFile.name}
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
										</>
									)}
								</div>
							)}

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
								</div>
							</div>

							{/* Scholarship Information Review */}
							<div className="signup-review-card signup-review-card--scholarship">
								<div className="signup-review-card-header">
									<h3 className="signup-review-card-title">
										<span className="signup-review-card-title-icon" aria-hidden>
											<HiOutlineAcademicCap />
										</span>
										Scholarship Information
									</h3>
									<button
										type="button"
										className="signup-review-edit-btn"
										onClick={() => {
											setShowReview(false)
											scrollToSection("section-scholarship")
										}}
									>
										<HiOutlinePencil /> Edit
									</button>
								</div>
								<div className="signup-review-content">
									{scholarships.length > 0 && (
										<div className="signup-review-scholarships">
											<span className="signup-review-label signup-review-label-group">
												<span className="signup-review-row-icon" aria-hidden>
													<HiOutlineAcademicCap />
												</span>
												<span>Scholarships:</span>
											</span>
											<div className="signup-review-scholarship-list">
												{scholarships.map((scholarship, index) => (
													<div
														key={index}
														className="signup-review-scholarship-item"
													>
														<span className="signup-review-scholarship-name">
															{scholarship.provider} - {scholarship.type}
														</span>
													</div>
												))}
											</div>
										</div>
									)}
								</div>
							</div>

							{/* Document Upload Review */}
							{(corFile || cogFile || schoolIdFile) && (
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
													<span className="signup-review-document-size signup-review-label-group">
														<span
															className="signup-review-row-icon"
															aria-hidden
														>
															<HiOutlineCheckCircle />
														</span>
														<span>
															({(corFile.size / 1024 / 1024).toFixed(2)} MB)
														</span>
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
											<div className="signup-review-document">
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
													<span className="signup-review-document-size signup-review-label-group">
														<span
															className="signup-review-row-icon"
															aria-hidden
														>
															<HiOutlineCheckCircle />
														</span>
														<span>
															({(cogFile.size / 1024 / 1024).toFixed(2)} MB)
														</span>
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
										{schoolIdFile && (
											<div className="signup-review-document">
												<div className="signup-review-document-info">
													<span className="signup-review-document-label signup-review-label-group">
														<span
															className="signup-review-row-icon"
															aria-hidden
														>
															<HiOutlineCloudUpload />
														</span>
														<span>School ID:</span>
													</span>
													<span className="signup-review-document-name signup-review-label-group">
														<span
															className="signup-review-row-icon"
															aria-hidden
														>
															<HiOutlineIdentification />
														</span>
														<span>{schoolIdFile.name}</span>
													</span>
													<span className="signup-review-document-size signup-review-label-group">
														<span
															className="signup-review-row-icon"
															aria-hidden
														>
															<HiOutlineCheckCircle />
														</span>
														<span>
															({(schoolIdFile.size / 1024 / 1024).toFixed(2)}{" "}
															MB)
														</span>
													</span>
												</div>
												<div className="signup-review-document-preview">
													<img
														src={URL.createObjectURL(schoolIdFile)}
														alt="School ID Preview"
														className="signup-review-document-image"
														onClick={() => {
															setPreviewFile(schoolIdFile)
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
