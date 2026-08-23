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
	HiOutlineDownload,
	HiOutlineEye,
	HiOutlineX,
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
import { isPdf, convertPdfToImage, convertPdfToImageFile } from "../utils/pdfConverter"
import { CONTACT_NUMBER_RULE_MESSAGE, isValidContactNumber, normalizeContactNumber, sanitizeContactNumber } from "../utils/contactNumber"
import { PROVINCES, getCitiesByProvince, getBarangaysByLocation } from "../data/philippineLocations"
import StudentTopbar from "../components/StudentTopbar"
import CustomSelect from "../components/CustomSelect"
import ZoomableImagePreview from "../components/ZoomableImagePreview"
import { downloadStudentApplicationProfile } from "../services/applicationFormService"
import { scanStudentDocument } from "../services/documentScanService"
import "../css/StudentDashboard.css"
import "../css/StudentPortalRefresh.css"
import useThemeMode from "../hooks/useThemeMode"

const COURSES_WITH_MAJORS = new Set([
	"Bachelor of Secondary Education",
	"Bachelor of Science in Business Administration",
	"Bachelor in Industrial Technology",
])

function _checkValidated(userData) {
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

function normalizeIdentityText(value = "") {
	return String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9ñ\s]/gi, " ")
		.replace(/\s+/g, " ")
		.trim()
}

function normalizeStudentNumber(value = "") {
	return String(value || "").replace(/\D/g, "")
}

function getLevenshteinDistance(left = "", right = "") {
	const a = normalizeIdentityText(left)
	const b = normalizeIdentityText(right)
	if (a === b) return 0
	if (!a) return b.length
	if (!b) return a.length

	const matrix = Array.from({ length: b.length + 1 }, (_, row) => [row])
	for (let column = 0; column <= a.length; column += 1) {
		matrix[0][column] = column
	}

	for (let row = 1; row <= b.length; row += 1) {
		for (let column = 1; column <= a.length; column += 1) {
			const substitutionCost = a[column - 1] === b[row - 1] ? 0 : 1
			matrix[row][column] = Math.min(
				matrix[row - 1][column] + 1,
				matrix[row][column - 1] + 1,
				matrix[row - 1][column - 1] + substitutionCost,
			)
		}
	}

	return matrix[b.length][a.length]
}

function getLevenshteinSimilarity(left = "", right = "") {
	const a = normalizeIdentityText(left)
	const b = normalizeIdentityText(right)
	if (!a && !b) return 1
	if (!a || !b) return 0
	const maxLength = Math.max(a.length, b.length)
	return Number((1 - getLevenshteinDistance(a, b) / maxLength).toFixed(4))
}

function tokenSortName(value = "") {
	return normalizeIdentityText(value).split(" ").filter(Boolean).sort().join(" ")
}

function buildFullNameFromParts(data = {}) {
	return [data?.fname, data?.mname, data?.lname].filter(Boolean).join(" ").trim()
}

function buildScannedName(extracted = {}) {
	return (
		extracted.fullName ||
		[extracted.firstName, extracted.middleName, extracted.lastName].filter(Boolean).join(" ")
	).trim()
}

function _validateApplicationFormIdentity({ student = {}, studentId = "", extracted = {} }) {
	const expectedStudentNumber = normalizeStudentNumber(
		student?.studentnumber || student?.studentId || studentId,
	)
	const scannedStudentNumber = normalizeStudentNumber(extracted?.studentId)
	const expectedName = buildFullNameFromParts(student)
	const scannedName = buildScannedName(extracted)
	const expectedSortedName = tokenSortName(expectedName)
	const scannedSortedName = tokenSortName(scannedName)
	const nameSimilarity = getLevenshteinSimilarity(expectedSortedName, scannedSortedName)
	const hasReadableName = Boolean(expectedSortedName && scannedSortedName)
	const passed = hasReadableName && nameSimilarity >= 0.7
	const failedRules = []

	if (!expectedName) failedRules.push("Missing expected student name from the account.")
	if (!scannedName) failedRules.push("Student name was not readable in the uploaded Student Application Profile.")
	if (hasReadableName && nameSimilarity < 0.7) {
		failedRules.push(`Name similarity too low: ${nameSimilarity}. Required at least 0.70.`)
	}

	return {
		algorithm: "Weighted Record Linkage with Levenshtein Similarity",
		passed,
		thresholds: {
			studentNumber: "Skipped because the Student Application Profile template has no student number field",
			nameSimilarity: ">= 0.70",
		},
		score: nameSimilarity,
		studentNumberMatched: Boolean(
			expectedStudentNumber &&
				scannedStudentNumber &&
				expectedStudentNumber === scannedStudentNumber,
		),
		studentNumberRuleSkipped: true,
		nameSimilarity,
		failedRules,
		expected: {
			studentNumber: expectedStudentNumber,
			name: expectedName,
		},
		scanned: {
			studentNumber: scannedStudentNumber,
			name: scannedName,
		},
		normalized: {
			expectedName: normalizeIdentityText(expectedName),
			scannedName: normalizeIdentityText(scannedName),
			expectedSortedName,
			scannedSortedName,
		},
		rawExtracted: extracted,
	}
}

async function isValidPdfUpload(file) {
	if (!file || file.size <= 0 || file.size > 10 * 1024 * 1024) return false
	const header = new Uint8Array(await file.slice(0, 5).arrayBuffer())
	return String.fromCharCode(...header) === "%PDF-"
}

function isPreviewPdf(file = {}) {
	const type = String(file?.type || file?.contentType || "").toLowerCase()
	const name = String(file?.name || file?.url || "").toLowerCase()
	return type.includes("pdf") || name.includes(".pdf")
}

export default function StudentProfilePage() {
	const navigate = useNavigate()
	const [user, setUser] = useState(null)
	const [userLoaded, setUserLoaded] = useState(false)
	const [userId, setUserId] = useState("")
	const [userMenuOpen, setUserMenuOpen] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [barangayOptions, setBarangayOptions] = useState([])
	const [barangayLoading, setBarangayLoading] = useState(false)
	const [barangayError, setBarangayError] = useState("")
	const [isPhotoUploading, setIsPhotoUploading] = useState(false)
	const [isDownloadingApplicationForm, setIsDownloadingApplicationForm] = useState(false)
	const [isDocumentUploading, setIsDocumentUploading] = useState({
		cor: false,
		cog: false,
		schoolId: false,
		applicationForm: false,
	})
	const [isLightboxOpen, setIsLightboxOpen] = useState(false)
	const [previewDocument, setPreviewDocument] = useState(null)
	const [previewBlobUrl, setPreviewBlobUrl] = useState("")
	const [isPreviewLoading, setIsPreviewLoading] = useState(false)
	const userMenuRef = useRef(null)
	const forcedLogoutRef = useRef(false)
	const fileInputRef = useRef(null)
	const corFileInputRef = useRef(null)
	const cogFileInputRef = useRef(null)
	const schoolIdFileInputRef = useRef(null)
	const applicationFormFileInputRef = useRef(null)
	const { theme, setTheme } = useThemeMode()
	const currentSemesterTag = getCurrentSemesterTag()
	const profileImageUrl = user?.profileImageUrl || ""
	const canUploadCor = canUploadDocument(user?.corFile, currentSemesterTag)
	const canUploadCog = canUploadDocument(user?.cogFile, currentSemesterTag)
	const canUploadSchoolId = canUploadDocument(user?.schoolIdFile, currentSemesterTag)
	const applicationScholarship = normalizeScholarshipList(user?.scholarships || []).find((item) => {
		const status = String(item?.status || "").toLowerCase()
		return !["rejected", "denied", "cancelled", "canceled", "expired"].some((value) => status.includes(value))
	}) || null
	const hasDownloadedApplicationForm = Boolean(
		applicationScholarship?.applicationFormDownloadedAt || user?.applicationFormDownloadedAt,
	)
	const canDownloadApplicationForm = true
	const canUploadApplicationForm =
		hasDownloadedApplicationForm &&
		canUploadDocument(user?.scholarshipApplicationFile, currentSemesterTag)

	const [formData, setFormData] = useState({
		fname: "",
		mname: "",
		lname: "",
		email: "",
		cpNumber: "",
		street: "",
		city: "",
		province: "",
		barangay: "",
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

	const _openPhotoLightbox = () => {
		if (!profileImageUrl) return
		setIsLightboxOpen(true)
	}

	const openDocumentPreview = (title, file) => {
		if (!file?.url) return
		setPreviewDocument({
			title,
			url: file.url,
			name: file.name || title,
			isPdf: isPreviewPdf(file),
		})
	}

	const closeDocumentPreview = () => {
		setPreviewDocument(null)
	}

	const downloadPreviewDocument = async () => {
		if (!previewDocument?.url) return
		try {
			const response = await fetch(previewDocument.url)
			if (!response.ok) throw new Error(`download_failed_${response.status}`)
			const blob = await response.blob()
			const url = URL.createObjectURL(blob)
			const link = document.createElement("a")
			link.href = url
			link.download = previewDocument.name || `${previewDocument.title}.pdf`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)
		} catch (error) {
			console.error("Failed to download document:", error)
			toast.error("Unable to download the document.")
		}
	}

	const triggerPhotoUpload = () => {
		fileInputRef.current?.click()
	}

	const triggerDocumentUpload = (type) => {
		if (type === "cor") {
			corFileInputRef.current?.click()
			return
		}
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

	const handleDownloadApplicationForm = async () => {
		if (!user || !userId || isDownloadingApplicationForm) return

		setIsDownloadingApplicationForm(true)
		try {
			await downloadStudentApplicationProfile({
				student: user,
				studentId: userId,
				scholarship: applicationScholarship || {},
				useGrantorForm: false,
			})
			const downloadedAt = new Date().toISOString()
			const nextScholarships = normalizeScholarshipList(user?.scholarships || []).map((entry) =>
				applicationScholarship && (
					entry.id === applicationScholarship.id ||
					entry.applicationNumber === applicationScholarship.applicationNumber ||
					entry.requestNumber === applicationScholarship.requestNumber
				)
					? {
							...entry,
							applicationFormDownloadedAt: downloadedAt,
							applicationFormDownloadedSemesterTag: currentSemesterTag,
						}
					: entry,
			)
			await setDoc(
				doc(db, "students", userId),
				{
					scholarships: nextScholarships,
					applicationFormDownloadedAt: downloadedAt,
					applicationFormDownloadedSemesterTag: currentSemesterTag,
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)
			setUser((prev) => ({
				...(prev || {}),
				scholarships: nextScholarships,
				applicationFormDownloadedAt: downloadedAt,
				applicationFormDownloadedSemesterTag: currentSemesterTag,
			}))
			toast.success("Student Application Profile downloaded.")
		} catch (error) {
			console.error("Failed to generate Student Application Profile:", error)
			toast.error("Unable to download the Student Application Profile.")
		} finally {
			setIsDownloadingApplicationForm(false)
		}
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
		if (type === "applicationForm") {
			if (!hasDownloadedApplicationForm) {
				toast.info("Download the Student Application Profile first before uploading it.")
				return
			}
		}

		const mimeType = String(file.type || "").toLowerCase()
		const isApplicationFormUpload = type === "applicationForm"
		const isAllowedFile = isApplicationFormUpload
			? mimeType === "application/pdf" || /\.pdf$/i.test(file.name || "")
			: mimeType.startsWith("image/") ||
				mimeType === "application/pdf" ||
				/\.(png|jpe?g|pdf)$/i.test(file.name || "")
		if (!isAllowedFile) {
			toast.error(
				isApplicationFormUpload
					? "Student Application Profile must be uploaded as a PDF file."
					: "Only PNG, JPG, JPEG, and PDF files are allowed.",
			)
			return
		}
		if (isApplicationFormUpload && !(await isValidPdfUpload(file))) {
			toast.error("Invalid Student Application Profile. Upload a valid PDF file no larger than 10 MB.")
			return
		}

		setIsDocumentUploading((prev) => ({ ...prev, [type]: true }))
		try {
			let fileToUpload = file
			let applicationProfileValidation = null

			if (isApplicationFormUpload) {
				const scanResult = await scanStudentDocument(file, "application_profile")
				applicationProfileValidation = _validateApplicationFormIdentity({
					student: user,
					studentId: userId,
					extracted: scanResult?.extracted || {},
				})
				if (!applicationProfileValidation.passed) {
					const reason = applicationProfileValidation.failedRules[0] || "The student name does not match this account."
					toast.error(`Invalid Student Application Profile. ${reason}`)
					return
				}
			}

			// Convert PDF to image if needed for document preview compatibility.
			if (isPdf(file) && (type === "cor" || type === "cog" || type === "schoolId")) {
				toast.info("Converting PDF to image...")
				fileToUpload = await convertPdfToImageFile(file)
				toast.success("PDF converted successfully!")
			}

			const uploadResult = await uploadToStorage(fileToUpload)
			const fieldName =
				type === "cor"
					? "corFile"
					: type === "cog"
					? "cogFile"
					: type === "applicationForm"
						? "scholarshipApplicationFile"
						: "schoolIdFile"
			const nextFileValue = {
				url: uploadResult.url,
				name: uploadResult.name || fileToUpload.name,
				type: uploadResult.type || fileToUpload.type,
				size: uploadResult.size || fileToUpload.size,
				path: uploadResult.path || uploadResult.publicId || "",
				bucket: uploadResult.bucket || "",
				uploadedAt: new Date().toISOString(),
				semesterTag: currentSemesterTag,
				...(applicationProfileValidation
					? {
						identityValidated: true,
						identityScore: applicationProfileValidation.nameSimilarity,
						validationAlgorithm: applicationProfileValidation.algorithm,
					}
					: {}),
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
				type === "cor"
					? "COR uploaded successfully."
					: type === "cog"
					? "ROG uploaded successfully."
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
		if (!previewDocument?.url) {
			setPreviewBlobUrl("")
			setIsPreviewLoading(false)
			return undefined
		}

		let cancelled = false
		let objectUrl = ""
		setIsPreviewLoading(true)
		setPreviewBlobUrl("")

		fetch(previewDocument.url)
			.then((response) => {
				if (!response.ok) throw new Error(`preview_failed_${response.status}`)
				return response.blob()
			})
			.then(async (blob) => {
				if (cancelled) return
				if (previewDocument.isPdf) {
					const pdfFile = new File([blob], previewDocument.name || "document.pdf", {
						type: "application/pdf",
					})
					const previewImageBlob = await convertPdfToImage(pdfFile)
					if (cancelled) return
					objectUrl = URL.createObjectURL(previewImageBlob)
				} else {
					objectUrl = URL.createObjectURL(blob)
				}
				setPreviewBlobUrl(objectUrl)
			})
			.catch((error) => {
				if (cancelled) return
				console.error("Failed to load document preview:", error)
				toast.error("Unable to preview the document. You can still download it.")
			})
			.finally(() => {
				if (!cancelled) setIsPreviewLoading(false)
			})

		return () => {
			cancelled = true
			if (objectUrl) URL.revokeObjectURL(objectUrl)
		}
	}, [previewDocument])

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
			barangay: user.barangay || "",
			postalCode: user.postalCode || "",
			course: user.course || "",
			major: user.major || "",
			year: user.year || "",
			section: user.section || "",
		})
	}, [user])

	useEffect(() => {
		let isCancelled = false
		setBarangayOptions([])
		setBarangayError("")

		if (!formData.province || !formData.city) {
			setBarangayLoading(false)
			return undefined
		}

		setBarangayLoading(true)
		getBarangaysByLocation(formData.province, formData.city)
			.then((options) => {
				if (isCancelled) return
				setBarangayOptions(options)
				if (options.length === 0) {
					setBarangayError("Barangays could not be found for the selected city or municipality.")
				}
			})
			.catch((error) => {
				if (isCancelled) return
				console.error("Barangay lookup failed:", error)
				setBarangayError("Unable to load barangays. Please check your connection and try again.")
			})
			.finally(() => {
				if (!isCancelled) setBarangayLoading(false)
			})

		return () => {
			isCancelled = true
		}
	}, [formData.province, formData.city])

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
			!formData.barangay.trim() ||
			!formData.postalCode.trim()
		) {
			toast.error("All name, contact, and address details are required.")
			return
		}
		if (!isValidContactNumber(formData.cpNumber)) {
			toast.error(CONTACT_NUMBER_RULE_MESSAGE)
			return
		}

		setIsSaving(true)
		try {
			const payload = {
				fname: formData.fname.trim(),
				mname: formData.mname.trim(),
				lname: formData.lname.trim(),
				email: formData.email.trim(),
				cpNumber: normalizeContactNumber(formData.cpNumber),
				street: formData.street.trim(),
				city: formData.city.trim(),
				province: formData.province.trim(),
				barangay: formData.barangay.trim(),
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
		<div className={`student-portal student-dashboard student-portal-view student-portal-view--profile ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
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
											placeholder="09XXXXXXXXX or 9XXXXXXXXX"
											value={formData.cpNumber}
											onChange={(e) => setFormData((prev) => ({ ...prev, cpNumber: sanitizeContactNumber(e.target.value) }))}
											inputMode="numeric"
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
										<CustomSelect
											buttonClassName="student-profile-input"
											value={formData.province}
											onChange={(nextProvince) =>
												setFormData((prev) => ({
													...prev,
													province: nextProvince,
													city: "",
													barangay: "",
												}))
											}
											options={PROVINCES}
											placeholder="Select province"
										/>
									</label>
									<label className="student-profile-label">
										City / Municipality
										<CustomSelect
											buttonClassName="student-profile-input"
											value={formData.city}
											onChange={(nextCity) =>
												setFormData((prev) => ({
													...prev,
													city: nextCity,
													barangay: "",
												}))
											}
											disabled={!formData.province}
											options={formData.province ? getCitiesByProvince(formData.province) : []}
											placeholder={formData.province ? "Select city" : "Select province first"}
										/>
									</label>
									<label className="student-profile-label">
										Barangay
										<CustomSelect
											buttonClassName="student-profile-input"
											value={formData.barangay}
											onChange={(nextBarangay) =>
												setFormData((prev) => ({
													...prev,
													barangay: nextBarangay,
												}))
											}
											disabled={!formData.city || barangayLoading || (barangayOptions.length === 0 && !formData.barangay)}
											options={[
												...(formData.barangay && !barangayOptions.includes(formData.barangay)
													? [formData.barangay]
													: []),
												...barangayOptions,
											]}
											placeholder={
												!formData.city
													? "Select city first"
													: barangayLoading
														? "Loading barangays..."
														: "Select barangay"
											}
										/>
										{barangayError && !formData.barangay ? <span className="student-profile-help-text">{barangayError}</span> : null}
									</label>
									<label className="student-profile-label student-profile-label--street">
										Street / Subdivision
										<input
											type="text"
											className="student-profile-input"
											value={formData.street}
											onChange={(e) => setFormData((prev) => ({ ...prev, street: e.target.value }))}
										/>
									</label>
									<label className="student-profile-label student-profile-label--postal">
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
									Upload and review COR, ROG, Student ID, and Student Application Profile records.
								</p>
								<div className="student-vault-grid">
									<article className="student-vault-card">
										<div>
											<h4>COR</h4>
											<p>{documentStatus(user?.corFile, currentSemesterTag)}</p>
										</div>
										<div className="student-vault-actions">
											{user?.corFile?.url ? (
												<button
													type="button"
													className="student-vault-link"
													onClick={() => openDocumentPreview("Certificate of Registration (COR)", user.corFile)}
												>
													<HiOutlineDocumentText aria-hidden /> View COR
												</button>
											) : null}
											{user?.corFile?.url || canUploadCor ? (
												<button
													type="button"
													className="student-vault-upload-btn student-mini-btn student-mini-btn--primary"
													onClick={() => triggerDocumentUpload("cor")}
													disabled={isDocumentUploading.cor}
												>
													{isDocumentUploading.cor
														? "Uploading..."
														: user?.corFile?.url
															? "Update COR"
															: "Upload COR"}
												</button>
											) : null}
											<input
												ref={corFileInputRef}
												type="file"
												accept=".png,.jpg,.jpeg,.pdf,image/*,application/pdf"
												className="student-profile-file-input"
												onChange={(e) => {
													const file = e.target.files?.[0]
													handleDocumentUpload("cor", file)
													e.target.value = ""
												}}
											/>
										</div>
									</article>
									<article className="student-vault-card">
										<div>
											<h4>ROG</h4>
											<p>{documentStatus(user?.cogFile, currentSemesterTag)}</p>
										</div>
										<div className="student-vault-actions">
											{user?.cogFile?.url ? (
												<button
													type="button"
													className="student-vault-link"
													onClick={() => openDocumentPreview("Report of Grades (ROG)", user.cogFile)}
												>
													<HiOutlineDocumentText aria-hidden /> View ROG
												</button>
											) : null}
											{user?.cogFile?.url || canUploadCog ? (
												<button
													type="button"
													className="student-vault-upload-btn student-mini-btn student-mini-btn--primary"
													onClick={() => triggerDocumentUpload("cog")}
													disabled={isDocumentUploading.cog}
												>
													{isDocumentUploading.cog
														? "Uploading..."
														: user?.cogFile?.url
															? "Update ROG"
															: "Upload ROG"}
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
												<button
													type="button"
													className="student-vault-link"
													onClick={() => openDocumentPreview("Student ID", user.schoolIdFile)}
												>
													<HiOutlineDocumentText aria-hidden /> View Student ID
												</button>
											) : null}
											{user?.schoolIdFile?.url || canUploadSchoolId ? (
												<button
													type="button"
													className="student-vault-upload-btn student-mini-btn student-mini-btn--primary"
													onClick={() => triggerDocumentUpload("schoolId")}
													disabled={isDocumentUploading.schoolId}
												>
													{isDocumentUploading.schoolId
														? "Uploading..."
														: user?.schoolIdFile?.url
															? "Update Student ID"
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
									<article className="student-vault-card student-vault-card--application">
										<div>
											<h4>Student Application Profile</h4>
											<p>{documentStatus(user?.scholarshipApplicationFile, currentSemesterTag)}</p>
										</div>
										<div className="student-vault-actions">
											{user?.scholarshipApplicationFile?.url ? (
												<button
													type="button"
													className="student-vault-link"
													onClick={() =>
														openDocumentPreview(
															"Student Application Profile",
															user.scholarshipApplicationFile,
														)
													}
												>
													<HiOutlineEye aria-hidden /> View Form
												</button>
											) : null}
											<button
												type="button"
												className="student-vault-link"
												onClick={handleDownloadApplicationForm}
												disabled={!canDownloadApplicationForm || isDownloadingApplicationForm}
												title={
													canDownloadApplicationForm
														? "Download your Student Application Profile"
														: "Download your Student Application Profile"
												}
											>
												<HiOutlineDownload aria-hidden />
												{isDownloadingApplicationForm
													? "Preparing..."
													: canDownloadApplicationForm
														? "Download Form"
														: "Download Locked"}
											</button>
											<button
												type="button"
												className="student-vault-upload-btn student-mini-btn student-mini-btn--primary"
												onClick={() => triggerDocumentUpload("applicationForm")}
												disabled={!canUploadApplicationForm || isDocumentUploading.applicationForm}
												title={
													canUploadApplicationForm
															? "Upload your completed PDF Student Application Profile"
															: "Download the Student Application Profile first before uploading."
												}
											>
												{isDocumentUploading.applicationForm
													? "Uploading..."
													: user?.scholarshipApplicationFile?.url
																? "Update Profile Document"
																: "Upload Profile Document"}
											</button>
											<input
												ref={applicationFormFileInputRef}
												type="file"
												accept=".pdf,application/pdf"
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

					{previewDocument && (
						<div
							className="student-document-preview-backdrop"
							role="dialog"
							aria-modal="true"
							aria-label={`${previewDocument.title} preview`}
							onClick={closeDocumentPreview}
						>
							<div
								className="student-document-preview-modal"
								onClick={(e) => e.stopPropagation()}
							>
								<header className="student-document-preview-head">
									<div>
										<span>Document Preview</span>
										<h3>{previewDocument.title}</h3>
										<p>{previewDocument.name}</p>
									</div>
									<div className="student-document-preview-actions">
										<button
											type="button"
											className="student-document-preview-open"
											onClick={downloadPreviewDocument}
										>
											<HiOutlineDownload aria-hidden /> Download
										</button>
										<button
											type="button"
											className="student-document-preview-close"
											onClick={closeDocumentPreview}
											aria-label="Close document preview"
										>
											<HiOutlineX aria-hidden />
										</button>
									</div>
								</header>
								<div className="student-document-preview-body">
									{isPreviewLoading ? (
										<div className="student-document-preview-state">
											<HiOutlineDocumentText aria-hidden />
											<span>Loading preview...</span>
										</div>
									) : !previewBlobUrl ? (
										<div className="student-document-preview-state">
											<HiOutlineDocumentText aria-hidden />
											<span>Preview is unavailable.</span>
										</div>
									) : (
										<ZoomableImagePreview
											src={previewBlobUrl}
											alt={`${previewDocument.title} preview`}
											className="student-document-zoom-preview"
											stageClassName="student-document-preview-body-stage"
											imageClassName="student-document-preview-image"
										/>
									)}
								</div>
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
