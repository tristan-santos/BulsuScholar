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
	findStudentAccountByUniqueField,
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
import { scanStudentDocument } from "../services/documentScanService"
import { finalizeStudentSignupWorkflow, validateStudentSignupWorkflow } from "../services/workflowService"
import { PROVINCES, getCitiesByProvince, getBarangaysByLocation } from "../data/philippineLocations"
import { isPdf, convertPdfToImage } from "../utils/pdfConverter"
import "../css/LoginPage.css"
import "../css/SignupPage.css"
import loginBackground from "../assets/LoginBackground.jpg"
import logo from "../assets/logo.png"
import logo2 from "../assets/logo2.png"

const APP_URL = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, "")

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
				? "Requires COR and ROG"
				: "Requires COR and ROG",
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
			? "Requires COR and ROG"
			: "Requires COR and ROG",
	}))
}

function normalizeScannedSemester(value = "") {
	const normalized = String(value || "").trim().toLowerCase()
	if (["1", "1st", "first"].includes(normalized)) return "1ST"
	if (["2", "2nd", "second"].includes(normalized)) return "2ND"
	return ""
}

function buildSemesterTagFromScan(scan = {}) {
	const rawText = String(scan?.rawTextPreview || "")
	const normalizedRawText = rawText.replace(/\s+/g, " ").trim()
	const combinedTermMatch = normalizedRawText.match(/(20\d{2}\s*[-/]\s*20\d{2})\s*(1st|2nd|first|second)\s*(?:semester)?/i)
	const academicYear = String(scan?.academicYear || combinedTermMatch?.[1] || "").replace(/\s+/g, "").replace("/", "-")
	const yearPattern = academicYear
		? new RegExp(`${academicYear.replace("-", "\\s*[-/]\\s*")}\\s*(1st|2nd|first|second)\\s*(?:semester)?`, "i")
		: null
	const nearbyYearMatch = yearPattern ? normalizedRawText.match(yearPattern) : null
	const explicitSemesterMatch = normalizedRawText.match(/\b(1st|2nd|first|second)\s+semester\b/i)
	const semester = normalizeScannedSemester(scan?.semester || combinedTermMatch?.[2] || nearbyYearMatch?.[1] || explicitSemesterMatch?.[1] || "")
	if (!academicYear || !semester) return ""
	return `${academicYear}-${semester}`
}

function parseSemesterTag(tag = "") {
	const match = String(tag || "").match(/^(20\d{2})-(20\d{2})-(1ST|2ND)$/i)
	if (!match) return null
	return {
		startYear: Number(match[1]),
		endYear: Number(match[2]),
		semester: match[3].toUpperCase(),
	}
}

function getPreviousSemesterTag(currentTag = getCurrentSemesterTag()) {
	const parsed = parseSemesterTag(currentTag)
	if (!parsed) return ""
	if (parsed.semester === "2ND") return `${parsed.startYear}-${parsed.endYear}-1ST`
	return `${parsed.startYear - 1}-${parsed.endYear - 1}-2ND`
}

function getExpectedPreviousRogYearLevel(corYear = "", currentTag = getCurrentSemesterTag()) {
	const parsed = parseSemesterTag(currentTag)
	const normalizedCorYear = String(corYear || "").replace(/\D/g, "").slice(0, 1)
	if (!parsed || !normalizedCorYear) return ""
	if (parsed.semester === "2ND") return normalizedCorYear
	return String(Math.max(1, Number(normalizedCorYear) - 1))
}

function getSignupWorkflowErrorMessage(error = {}) {
	const rawMessage = String(error?.message || "")
	const reasonMatchers = [
		["invalid_cor_document_title", "Please upload a valid COR: Advising Slip or Certificate of Registration."],
		["missing_cor_cycle", "The COR/Advising Slip semester was not detected. Please upload a clear current-semester document."],
		["cor_cycle_mismatch", `COR/Advising Slip must be for the current cycle: ${getCurrentSemesterTag()}.`],
		["missing_rog_scan", `Please upload your ROG for the previous cycle: ${getPreviousSemesterTag()}.`],
		["invalid_rog_document_title", "Please upload a valid ROG: Report of Grades."],
		["missing_rog_cycle", "The ROG semester was not detected. Please upload a clear Report of Grades for the previous cycle."],
		["rog_cycle_mismatch", `ROG must be from the previous cycle only: ${getPreviousSemesterTag()}.`],
		["rog_year_level_mismatch", "ROG year level must match the previous cycle year level."],
	]
	const match = reasonMatchers.find(([reason]) => rawMessage.includes(reason))
	return match?.[1] || rawMessage || "Failed to create account. Please try again."
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
	const [barangay, setBarangay] = useState("")
	const [barangayOptions, setBarangayOptions] = useState([])
	const [barangayLoading, setBarangayLoading] = useState(false)
	const [barangayError, setBarangayError] = useState("")
	const [postalCode, setPostalCode] = useState("")
	const [course, setCourse] = useState("")
	const [major, setMajor] = useState("")
	const [year, setYear] = useState("")
	const [section, setSection] = useState("")
	const [gwa, setGwa] = useState("")
	const [corFile, setCorFile] = useState(null)
	const [cogFile, setCogFile] = useState(null)
	const [documentScanState, setDocumentScanState] = useState({ cor: "idle", cog: "idle" })
	const [documentScanResult, setDocumentScanResult] = useState({ cor: null, cog: null })
	const [documentUploadErrors, setDocumentUploadErrors] = useState({ cor: "", cog: "" })
	const [documentPreviewUrls, setDocumentPreviewUrls] = useState({ cor: "", cog: "" })
	const [academicConcernTerms, setAcademicConcernTerms] = useState([])
	const [showTermsModal, setShowTermsModal] = useState(false)
	const [termsChecked, setTermsChecked] = useState(false)
	const [termsAccepted, setTermsAccepted] = useState(false)
	const [showImagePreview, setShowImagePreview] = useState(false)
	const [previewFile, setPreviewFile] = useState(null)
	const [isPending, setIsPending] = useState(false)

	const isFirstCycle = useMemo(() => {
		const month = new Date().getMonth() + 1
		return month >= 7 && month <= 12
	}, [])

	const isCogOptional = useMemo(() => {
		return year === "1" && isFirstCycle
	}, [isFirstCycle, year])
	const isCogRequired = !isCogOptional
	const canUploadCog = Boolean(corFile)

	useEffect(() => {
		let isCancelled = false
		setBarangay("")
		setBarangayOptions([])
		setBarangayError("")

		if (!province || !city) {
			setBarangayLoading(false)
			return undefined
		}

		setBarangayLoading(true)
		getBarangaysByLocation(province, city)
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
	}, [province, city])

	useEffect(() => {
		let isMounted = true
		const createdUrls = []

		const buildPreviewUrl = async (file) => {
			if (!file) return ""
			if (isPdf(file)) {
				const previewBlob = await convertPdfToImage(file)
				const previewUrl = URL.createObjectURL(previewBlob)
				createdUrls.push(previewUrl)
				return previewUrl
			}
			const previewUrl = URL.createObjectURL(file)
			createdUrls.push(previewUrl)
			return previewUrl
		}

		Promise.all([buildPreviewUrl(corFile), buildPreviewUrl(cogFile)])
			.then(([corPreviewUrl, cogPreviewUrl]) => {
				if (isMounted) {
					setDocumentPreviewUrls({ cor: corPreviewUrl, cog: cogPreviewUrl })
				}
			})
			.catch((error) => {
				console.error("Document preview generation failed:", error)
				if (isMounted) {
					setDocumentPreviewUrls({ cor: "", cog: "" })
				}
			})

		return () => {
			isMounted = false
			createdUrls.forEach((url) => URL.revokeObjectURL(url))
		}
	}, [corFile, cogFile])

	const hasAcademicConcern = useMemo(() => {
		return academicConcernTerms.length > 0
	}, [academicConcernTerms])

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

	const normalizeIdentityText = (value = "") =>
		String(value)
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9\s]/g, " ")
			.replace(/\s+/g, " ")
			.trim()

	const normalizeStudentNumber = (value = "") => String(value).replace(/\D/g, "")
	const normalizeEmail = (value = "") => String(value || "").trim().toLowerCase()
	const normalizeCpNumber = (value = "") => String(value || "").replace(/\D/g, "")
	const isValidCpNumber = (value = "") => /^09\d{9}$/.test(normalizeCpNumber(value))
	const getFileSha256 = async (file) => {
		if (!file) return ""
		const buffer = await file.arrayBuffer()
		const digest = await crypto.subtle.digest("SHA-256", buffer)
		return Array.from(new Uint8Array(digest))
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("")
	}

	const getTokenSortedName = (value = "") =>
		normalizeIdentityText(value).split(" ").filter(Boolean).sort().join(" ")

	const getNameTokens = (value = "") =>
		normalizeIdentityText(value).split(" ").filter(Boolean)

	const getTokenOverlapSimilarity = (left = "", right = "") => {
		const leftTokens = new Set(getNameTokens(left))
		const rightTokens = new Set(getNameTokens(right))
		const tokenCount = Math.max(leftTokens.size, rightTokens.size)
		if (!tokenCount) return 0
		let matches = 0
		leftTokens.forEach((token) => {
			if (rightTokens.has(token)) matches += 1
		})
		return Number((matches / tokenCount).toFixed(4))
	}

	const getLevenshteinDistance = (left = "", right = "") => {
		const a = normalizeIdentityText(left)
		const b = normalizeIdentityText(right)
		if (a === b) return 0
		if (!a.length) return b.length
		if (!b.length) return a.length

		const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
		const current = Array(b.length + 1).fill(0)

		for (let i = 1; i <= a.length; i += 1) {
			current[0] = i
			for (let j = 1; j <= b.length; j += 1) {
				const cost = a[i - 1] === b[j - 1] ? 0 : 1
				current[j] = Math.min(
					current[j - 1] + 1,
					previous[j] + 1,
					previous[j - 1] + cost,
				)
			}
			for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]
		}

		return previous[b.length]
	}

	const getLevenshteinSimilarity = (left = "", right = "") => {
		const a = normalizeIdentityText(left)
		const b = normalizeIdentityText(right)
		const maxLength = Math.max(a.length, b.length)
		if (!maxLength) return 0
		return Number((1 - getLevenshteinDistance(a, b) / maxLength).toFixed(4))
	}

	const buildScannedFullName = (extracted = {}) =>
		normalizeSpace([
			extracted.firstName,
			extracted.lastName,
		].filter(Boolean).join(" ")) || extracted.fullName || ""

	const normalizeSpace = (value = "") => String(value).replace(/\s+/g, " ").trim()

	const isUsableIdentityName = (value = "") => {
		const normalized = normalizeIdentityText(value)
		if (!normalized) return false
		const tokens = normalized.split(" ").filter(Boolean)
		if (tokens.length < 2) return false
		return !/\b(registration|certificate|program|course|student|number|semester|section|final|remarks|average)\b/.test(normalized)
	}

	const resolveExpectedCogIdentity = () => {
		const corExtracted = documentScanResult.cor || {}
		const corFullName = buildScannedFullName(corExtracted) || corExtracted.fullName || ""
		const formFullName = normalizeSpace([fname, mname, lname].filter(Boolean).join(" "))
		const expectedName = isUsableIdentityName(corFullName) ? corFullName : formFullName
		const expectedStudentNumber =
			normalizeStudentNumber(corExtracted.studentId) ||
			normalizeStudentNumber(userId)

		return {
			studentNumber: expectedStudentNumber,
			name: expectedName,
			source: {
				studentNumber: corExtracted.studentId ? "COR scanned student number" : "student form ID",
				name: isUsableIdentityName(corFullName) ? "COR scanned full name" : "student form fields",
				corExtracted,
				form: {
					studentNumber: userId,
					firstName: fname,
					middleName: mname,
					lastName: lname,
				},
			},
		}
	}

	const splitNameParts = (name = "") => {
		const cleaned = normalizeSpace(name)
		if (!cleaned) return { firstName: "", middleName: "", lastName: "" }

		if (cleaned.includes(",")) {
			const [lastPart, restPart] = cleaned.split(",", 2).map((part) => normalizeSpace(part))
			const rest = restPart.split(" ").filter(Boolean)
			return {
				firstName: rest[0] || "",
				middleName: rest.slice(1).join(" "),
				lastName: lastPart || "",
			}
		}

		const parts = cleaned.split(" ").filter(Boolean)
		if (parts.length < 2) return { firstName: "", middleName: "", lastName: "" }
		return {
			firstName: parts[0] || "",
			middleName: parts.slice(1, -1).join(" "),
			lastName: parts[parts.length - 1] || "",
		}
	}

	const validateCogIdentity = (extracted = {}) => {
		const expectedIdentity = resolveExpectedCogIdentity()
		const expectedStudentNumber = expectedIdentity.studentNumber
		const scannedStudentNumber = normalizeStudentNumber(extracted.studentId)
		const expectedName = expectedIdentity.name
		const scannedName = buildScannedFullName(extracted)
		const sortedExpectedName = getTokenSortedName(expectedName)
		const sortedScannedName = getTokenSortedName(scannedName)
		const nameSimilarity = Math.max(
			getLevenshteinSimilarity(sortedExpectedName, sortedScannedName),
			getTokenOverlapSimilarity(expectedName, scannedName),
		)
		const studentNumberSimilarity = expectedStudentNumber && scannedStudentNumber && expectedStudentNumber === scannedStudentNumber ? 1 : 0
		const score = Number(((studentNumberSimilarity * 0.75) + (nameSimilarity * 0.25)).toFixed(4))
		const canValidate = Boolean(expectedStudentNumber && scannedStudentNumber && expectedName && scannedName)
		const hasExactStudentNumberMatch = studentNumberSimilarity === 1
		const canUseNameRule = Boolean(expectedName && scannedName)
		const passed = hasExactStudentNumberMatch && (
			canUseNameRule
				? score >= 0.85 && nameSimilarity >= 0.7
				: true
		)
		const failedRules = []
		const skippedRules = []

		if (!expectedStudentNumber) failedRules.push("Missing expected student number from COR/form.")
		if (!scannedStudentNumber) failedRules.push("Missing scanned student number from ROG.")
		if (!expectedName) skippedRules.push("Expected student name was not extracted from COR/form, so name matching was skipped.")
		if (!scannedName) skippedRules.push("Scanned student name was not extracted from ROG, so name matching was skipped.")
		if (expectedStudentNumber && scannedStudentNumber && expectedStudentNumber !== scannedStudentNumber) {
			failedRules.push(`Student number mismatch: expected ${expectedStudentNumber}, scanned ${scannedStudentNumber}.`)
		}
		if (canUseNameRule && nameSimilarity < 0.7) {
			failedRules.push(`Name similarity too low: ${nameSimilarity}. Required at least 0.70.`)
		}
		if (canUseNameRule && score < 0.85) {
			failedRules.push(`Overall identity score too low: ${score}. Required at least 0.85.`)
		}
		const blockingReason =
			failedRules[0] ||
			(!canUseNameRule && hasExactStudentNumberMatch
				? "Name check skipped because one side has no readable name."
				: "No blocking rule failed.")

		return {
			algorithm: "Weighted Record Linkage with Levenshtein Similarity",
			threshold: 0.85,
			passed,
			canValidate,
			score,
			studentNumberSimilarity,
			nameSimilarity,
			nameSource: expectedIdentity.source.name,
			studentNumberSource: expectedIdentity.source.studentNumber,
			blockingReason,
			failedRules,
			skippedRules,
			sourceFields: expectedIdentity.source,
			comparisonSteps: [
				{
					rule: "Student number exact match",
					expected: expectedStudentNumber,
					scanned: scannedStudentNumber,
					passed: hasExactStudentNumberMatch,
				},
				{
					rule: "Readable name available",
					expected: expectedName,
					scanned: scannedName,
					passed: canUseNameRule,
				},
				{
					rule: "Name similarity >= 0.70",
					expected: ">= 0.70",
					scanned: nameSimilarity,
					passed: !canUseNameRule || nameSimilarity >= 0.7,
				},
				{
					rule: "Weighted score >= 0.85",
					expected: ">= 0.85",
					scanned: score,
					passed: !canUseNameRule || score >= 0.85,
				},
			],
			normalized: {
				expectedName: normalizeIdentityText(expectedName),
				scannedName: normalizeIdentityText(scannedName),
				sortedExpectedName,
				sortedScannedName,
				expectedStudentNumber,
				scannedStudentNumber,
			},
			rules: {
				studentNumber: "Must match exactly.",
				nameSimilarity: "Must be at least 0.70.",
				overallScore: "Must be at least 0.85.",
				weights: "Student number 75%, name similarity 25%.",
			},
			expected: {
				studentNumber: expectedStudentNumber,
				name: expectedName,
			},
			scanned: {
				studentNumber: scannedStudentNumber,
				name: scannedName,
			},
			explanation: passed
				? canUseNameRule
					? "The ROG identity matches the COR/form identity."
					: "The ROG student number matches exactly. Name matching was skipped because one document did not expose a readable name."
				: "The ROG identity does not match the COR/form identity closely enough, so GWA autofill is blocked.",
		}
	}

	const applyScannedStudentData = (extracted = {}) => {
		if (!extracted || typeof extracted !== "object") return

		const isCorScan = extracted.documentType === "cor"
		const isCogScan = extracted.documentType === "cog"
		const fallbackName = splitNameParts(extracted.fullName)
		const scannedFirstName = extracted.firstName || fallbackName.firstName
		const scannedLastName = extracted.lastName || fallbackName.lastName
		const scannedYearIsReliable = /\b(?:Year\s*(?:Level)?\s*(?:\/|&|and)?\s*Section|Yr\s*\/\s*Sec|[1-6](?:st|nd|rd|th)\s+Year)\b/i.test(
			String(extracted.rawTextPreview || ""),
		)

		if (extracted.studentId && (!userId.trim() || isCorScan)) setUserId(extracted.studentId)
		if (scannedFirstName && (!fname.trim() || isCorScan)) setFname(scannedFirstName)
		if (scannedLastName && (!lname.trim() || isCorScan)) setLname(scannedLastName)
		if (extracted.course && (!course || isCorScan)) setCourse(extracted.course)
		if (isCorScan && extracted.year && scannedYearIsReliable) setYear(String(extracted.year))
		if (extracted.gwa && (!gwa.trim() || isCogScan)) setGwa(extracted.gwa)

		if (isCorScan && Array.isArray(extracted.academicConcernTerms) && extracted.academicConcernTerms.length > 0) {
			setAcademicConcernTerms((current) =>
				Array.from(new Set([...current, ...extracted.academicConcernTerms])),
			)
		}
	}

	const logDocumentScanResult = (documentType, extracted = {}, identityCheck = null) => {
		const label = `${documentType === "cog" ? "ROG" : documentType.toUpperCase()} document scan`
		const gradeDebug = extracted?.gradeDebug || {}
		const gwaDebug = extracted?.gwaDebug || {}

		console.groupCollapsed(`[BulsuScholar] ${label}`)
		console.log("Autofill fields gathered:", {
			documentTitle: extracted?.documentTitle || "",
			isValidCorDocument: extracted?.isValidCorDocument,
			isValidCogDocument: extracted?.isValidCogDocument,
			studentId: extracted?.studentId || "",
			firstName: extracted?.firstName || "",
			middleName: extracted?.middleName || "",
			lastName: extracted?.lastName || "",
			fullName: extracted?.fullName || "",
			course: extracted?.course || "",
			year: extracted?.year || "",
			section: extracted?.section || "",
			gwa: extracted?.gwa || "",
			academicYear: extracted?.academicYear || "",
			semester: extracted?.semester || "",
		})
		if (documentType === "cor") {
			console.log("COR title validation:", {
				isValidCorDocument: extracted?.isValidCorDocument,
				documentTitle: extracted?.documentTitle || "",
				acceptedCorTitles: extracted?.acceptedCorTitles || ["Advising Slip", "Certificate of Registration"],
				documentTitleCandidates: extracted?.documentTitleCandidates || [],
				rule: extracted?.documentTitleRule || "COR must contain Advising Slip or Certificate of Registration.",
			})
		}
		if (documentType === "cog") {
			console.log("ROG title validation:", {
				isValidCogDocument: extracted?.isValidCogDocument,
				documentTitle: extracted?.documentTitle || "",
				acceptedCogTitles: extracted?.acceptedCogTitles || ["Report of Grades"],
				documentTitleCandidates: extracted?.documentTitleCandidates || [],
				rule: extracted?.documentTitleRule || "ROG must contain Report of Grades.",
			})
		}
		console.log("Raw OCR preview:", extracted?.rawTextPreview || "")
		console.log(
			"ROG reading rule:",
			gradeDebug.explanation ||
				"ROG scanning extracts only identity fields and the printed GWA.",
		)
		console.log(
			"GWA extraction method:",
			gradeDebug.extractionMethod || "header-anchored Final Grade column extraction",
		)
		if (documentType === "cog") {
			console.log("[BulsuScholar] PYTHON ROG CHECK RESULT:", {
				hasAcademicConcern: extracted?.hasAcademicConcern,
				academicConcernTerms: extracted?.academicConcernTerms || [],
				extractionMethod: gradeDebug.extractionMethod || "",
				finalGradesChecked: gradeDebug.grades || [],
				concernMatches: gradeDebug.concernMatches || [],
				rowDebug: gradeDebug.rowDebug || [],
			})
			console.log("Collected ROG Final Grades:", gradeDebug.grades || [])
			console.log("ROG Final Grade row debug:", gradeDebug.rowDebug || [])
			if (gradeDebug.concernMatches?.length) {
				console.warn("ROG Final Grade concerns detected:", gradeDebug.concernMatches)
			} else {
				console.info("No ROG Final Grade concerns detected.")
			}
		}
		console.log("Printed GWA detected:", extracted?.gwa || "Not detected")
		console.log("GWA extraction debug:", {
			value: gwaDebug.value || extracted?.gwa || "",
			matchedRule: gwaDebug.matchedRule || "No GWA rule matched",
			matchedText: gwaDebug.matchedText || "",
			nearbyText: gwaDebug.nearbyText || "",
			attemptedRules: gwaDebug.attemptedRules || [],
		})
		if (identityCheck) {
			console.log("Identity matching algorithm:", identityCheck.algorithm)
			console.table([{
				score: identityCheck.score,
				threshold: identityCheck.threshold,
				studentNumberSimilarity: identityCheck.studentNumberSimilarity,
				nameSimilarity: identityCheck.nameSimilarity,
				passed: identityCheck.passed,
				nameSource: identityCheck.nameSource,
				studentNumberSource: identityCheck.studentNumberSource,
				blockingReason: identityCheck.blockingReason,
			}])
			console.log("Identity matching rules:", identityCheck.rules)
			console.table(identityCheck.comparisonSteps || [])
			console.log("Identity source fields:", identityCheck.sourceFields)
			console.log("Identity comparison:", {
				expected: identityCheck.expected,
				scanned: identityCheck.scanned,
				normalized: identityCheck.normalized,
				explanation: identityCheck.explanation,
			})
			if (identityCheck.failedRules?.length) {
				console.warn("ROG identity mismatch reason:")
				console.table(identityCheck.failedRules.map((reason, index) => ({
					check: index + 1,
					reason,
				})))
			}
			if (identityCheck.skippedRules?.length) {
				console.info("ROG identity skipped checks:")
				console.table(identityCheck.skippedRules.map((reason, index) => ({
					check: index + 1,
					reason,
				})))
			}
			if (!identityCheck.failedRules?.length) {
				console.info("ROG identity matched required rules.")
			} else {
				console.info("ROG identity did not match required rules.")
			}
		}
		console.groupEnd()
	}

	const getPreviewUrlForFile = (file) => {
		if (!file) return ""
		if (file === corFile) return documentPreviewUrls.cor
		if (file === cogFile) return documentPreviewUrls.cog
		return ""
	}

	const getScannedCorStudentNumber = () => normalizeStudentNumber(documentScanResult.cor?.studentId)

	const validateCorStudentNumberLock = () => {
		const scannedCorStudentNumber = getScannedCorStudentNumber()
		const submittedStudentNumber = normalizeStudentNumber(userId)
		if (!scannedCorStudentNumber) {
			toast.error("Please wait for the COR scan to detect the student number before continuing.")
			scrollToSection("section-cor")
			return false
		}
		if (scannedCorStudentNumber !== submittedStudentNumber) {
			toast.error("Student ID must match the uploaded COR. Please upload your own COR.")
			console.warn("Signup blocked: COR student number mismatch.", {
				scannedCorStudentNumber,
				submittedStudentNumber,
				corScan: documentScanResult.cor,
			})
			scrollToSection("section-account")
			return false
		}
		return true
	}

	const validateCorCycle = (extracted = {}) => {
		const currentSemesterTag = getCurrentSemesterTag()
		const scannedSemesterTag = buildSemesterTagFromScan(extracted)
		if (!scannedSemesterTag) {
			const message = "Invalid COR. The semester was not detected; upload a clear current-semester COR/Advising Slip."
			setDocumentUploadError("cor", message)
			toast.error(message)
			console.warn("Signup blocked: COR cycle missing.", {
				expectedCurrentCycle: currentSemesterTag,
				scanned: {
					academicYear: extracted?.academicYear || "",
					semester: extracted?.semester || "",
					semesterTag: scannedSemesterTag,
					rawTextPreview: extracted?.rawTextPreview || "",
				},
				corScan: extracted,
			})
			return false
		}
		if (scannedSemesterTag !== currentSemesterTag) {
			const message = `Invalid COR. It must be for the current cycle: ${currentSemesterTag}.`
			setDocumentUploadError("cor", message)
			toast.error(message)
			console.warn("Signup blocked: COR cycle mismatch.", {
				expectedCurrentCycle: currentSemesterTag,
				scannedSemesterTag,
				corScan: extracted,
			})
			return false
		}
		return true
	}

	const validateRogCycle = (extracted = {}) => {
		const currentSemesterTag = getCurrentSemesterTag()
		const expectedPreviousSemesterTag = getPreviousSemesterTag(currentSemesterTag)
		const scannedSemesterTag = buildSemesterTagFromScan(extracted)
		const corYear = documentScanResult.cor?.year || year
		const corYearSource = documentScanResult.cor?.year ? "COR scan" : year ? "form field" : ""
		const expectedRogYear = getExpectedPreviousRogYearLevel(corYear, currentSemesterTag)
		const scannedRogYear = String(extracted?.year || "").replace(/\D/g, "").slice(0, 1)
		const parsedCurrentSemester = parseSemesterTag(currentSemesterTag)
		const corYearNumber = Number(String(corYear || "").replace(/\D/g, "").slice(0, 1))
		const scannedRogYearNumber = Number(scannedRogYear)
		const hasImpossibleYearProgression = Boolean(
			corYearNumber &&
			scannedRogYearNumber &&
			(
				(parsedCurrentSemester?.semester === "1ST" && scannedRogYearNumber >= corYearNumber) ||
				(parsedCurrentSemester?.semester === "2ND" && scannedRogYearNumber > corYearNumber)
			),
		)

		if (!scannedSemesterTag) {
			const message = "Invalid ROG. The semester was not detected; upload a clear Report of Grades for the previous cycle."
			setDocumentUploadError("cog", message)
			toast.error(message)
			console.warn("Signup blocked: ROG cycle missing.", {
				currentSemesterTag,
				expectedPreviousSemesterTag,
				scanned: {
					academicYear: extracted?.academicYear || "",
					semester: extracted?.semester || "",
					semesterTag: scannedSemesterTag,
				},
				rogScan: extracted,
			})
			return false
		}

		if (scannedSemesterTag !== expectedPreviousSemesterTag) {
			const message = `Invalid ROG. It must be from the previous cycle only: ${expectedPreviousSemesterTag}.`
			setDocumentUploadError("cog", message)
			toast.error(message)
			console.warn("Signup blocked: ROG cycle mismatch.", {
				currentSemesterTag,
				expectedPreviousSemesterTag,
				scannedSemesterTag,
				rogScan: extracted,
			})
			return false
		}

		if (expectedRogYear && scannedRogYear && expectedRogYear !== scannedRogYear && hasImpossibleYearProgression) {
			console.warn("ROG year level mismatch skipped because the COR/form year appears unreliable.", {
				currentSemesterTag,
				expectedPreviousSemesterTag,
				corYear,
				corYearSource,
				expectedRogYear,
				scannedRogYear,
				reason: "A previous-cycle ROG year cannot be ahead of, or equal to, the current COR year in this cycle.",
				corScan: documentScanResult.cor,
				rogScan: extracted,
			})
			return true
		}

		if (expectedRogYear && scannedRogYear && expectedRogYear !== scannedRogYear) {
			const message = `Invalid ROG. Year level must match the previous cycle year level: Year ${expectedRogYear}.`
			setDocumentUploadError("cog", message)
			toast.error(message)
			console.warn("Signup blocked: ROG year level mismatch.", {
				currentSemesterTag,
				expectedPreviousSemesterTag,
				corYear,
				corYearSource,
				expectedRogYear,
				scannedRogYear,
				rogScan: extracted,
			})
			return false
		}

		if (expectedRogYear && !scannedRogYear) {
			console.warn("ROG year level was not detected. Cycle was validated by academic year and semester only.", {
				currentSemesterTag,
				expectedPreviousSemesterTag,
				expectedRogYear,
				rogScan: extracted,
			})
		}

		return true
	}

	const validateUniqueSignupFields = async () => {
		const normalizedEmail = normalizeEmail(email)
		const normalizedCpNumber = normalizeCpNumber(cpNumber)

		const [emailOwner, cpOwner] = await Promise.all([
			findStudentAccountByUniqueField("email", normalizedEmail),
			findStudentAccountByUniqueField("cpNumber", normalizedCpNumber),
		])

		if (emailOwner) {
			toast.error("This email is already used by another student account.")
			console.warn("Signup blocked: duplicate student email.", {
				email: normalizedEmail,
				existingStudentId: emailOwner.record?.id,
				table: emailOwner.table,
			})
			scrollToSection("section-account")
			return false
		}

		if (cpOwner) {
			toast.error("This CP number is already used by another student account.")
			console.warn("Signup blocked: duplicate student CP number.", {
				cpNumber: normalizedCpNumber,
				existingStudentId: cpOwner.record?.id,
				table: cpOwner.table,
			})
			scrollToSection("section-personal")
			return false
		}

		return true
	}

	const setDocumentUploadError = (documentType, message = "") => {
		setDocumentUploadErrors((current) => ({ ...current, [documentType]: message }))
	}

	const clearDocumentUploadError = (documentType) => {
		setDocumentUploadError(documentType, "")
	}

	const scanUploadedDocument = async (file, documentType) => {
		if (!file) return

		setDocumentScanState((current) => ({ ...current, [documentType]: "scanning" }))
		clearDocumentUploadError(documentType)
		try {
			const result = await scanStudentDocument(file, documentType)
			const extracted = result?.extracted || null
			const identityCheck = documentType === "cog" ? validateCogIdentity(extracted) : null
			setDocumentScanResult((current) => ({ ...current, [documentType]: extracted }))
			logDocumentScanResult(documentType, extracted, identityCheck)

			if (documentType === "cor" && extracted?.isValidCorDocument === false) {
				const message = "Invalid COR. Upload an Advising Slip or Certificate of Registration."
				setCorFile(null)
				setCogFile(null)
				setGwa("")
				setDocumentScanResult((current) => ({ ...current, cor: null, cog: null }))
				setDocumentUploadError("cor", message)
				toast.error(message)
				setDocumentScanState((current) => ({ ...current, cor: "error", cog: "idle" }))
				return
			}

			if (documentType === "cor" && !validateCorCycle(extracted)) {
				setCorFile(null)
				setCogFile(null)
				setGwa("")
				setDocumentScanResult((current) => ({ ...current, cor: null, cog: null }))
				setDocumentScanState((current) => ({ ...current, cor: "error", cog: "idle" }))
				return
			}

			if (documentType === "cog" && extracted?.isValidCogDocument === false) {
				const message = "Invalid ROG. Upload a Report of Grades."
				setCogFile(null)
				setGwa("")
				setDocumentScanResult((current) => ({ ...current, cog: null }))
				setDocumentUploadError("cog", message)
				toast.error(message)
				setDocumentScanState((current) => ({ ...current, cog: "error" }))
				return
			}

			if (documentType === "cog" && !validateRogCycle(extracted)) {
				setCogFile(null)
				setGwa("")
				setDocumentScanResult((current) => ({ ...current, cog: null }))
				setDocumentScanState((current) => ({ ...current, cog: "error" }))
				return
			}

			if (identityCheck && !identityCheck.passed) {
				const message = "ROG identity does not match your COR/student information. Upload the correct ROG."
				setCogFile(null)
				setGwa("")
				setDocumentScanResult((current) => ({ ...current, cog: null }))
				setDocumentUploadError("cog", message)
				toast.error(message)
				setDocumentScanState((current) => ({ ...current, [documentType]: "error" }))
				return
			}

			if (documentType === "cog" && extracted?.hasAcademicConcern) {
				const concerns = Array.isArray(extracted.academicConcernTerms)
					? extracted.academicConcernTerms.join(", ")
					: "5.0, 4.0, INC, UD, or OD"
				const message = `Invalid ROG. Final grades include ${concerns}.`
				setCogFile(null)
				setGwa("")
				setDocumentScanResult((current) => ({ ...current, cog: null }))
				setAcademicConcernTerms(Array.isArray(extracted.academicConcernTerms) ? extracted.academicConcernTerms : [])
				setDocumentUploadError("cog", message)
				toast.error(`${message} Students with these final grades cannot create an account through this signup.`)
				setDocumentScanState((current) => ({ ...current, [documentType]: "error" }))
				return
			}

			applyScannedStudentData(extracted)
			toast.success(`${documentType === "cog" ? "ROG" : documentType.toUpperCase()} scanned. Review the autofilled data before submitting.`)
			setDocumentScanState((current) => ({ ...current, [documentType]: "done" }))
		} catch (error) {
			console.error(`${documentType.toUpperCase()} scan failed:`, error)
			const message = `${documentType === "cog" ? "ROG" : "COR"} scanner is unavailable. Upload cannot continue until the document is scanned.`
			if (documentType === "cor") {
				setCorFile(null)
				setCogFile(null)
				setGwa("")
				setDocumentScanResult((current) => ({ ...current, cor: null, cog: null }))
				setDocumentUploadError("cor", message)
				setDocumentScanState((current) => ({ ...current, cor: "error", cog: "idle" }))
			} else {
				setCogFile(null)
				setGwa("")
				setDocumentScanResult((current) => ({ ...current, cog: null }))
				setDocumentUploadError("cog", message)
				setDocumentScanState((current) => ({ ...current, cog: "error" }))
			}
			toast.error(message)
		}
	}

	const processSignupDocumentFile = (file, documentType, resetInput) => {
		if (!file) {
			if (documentType === "cor") {
				setCorFile(null)
				setDocumentScanResult((current) => ({ ...current, cor: null }))
				clearDocumentUploadError("cor")
			}
			if (documentType === "cog") {
				setCogFile(null)
				setDocumentScanResult((current) => ({ ...current, cog: null }))
				clearDocumentUploadError("cog")
			}
			return
		}

		if (documentType === "cog" && !corFile) {
			const message = "Upload your COR/Advising Slip first before uploading your ROG."
			setDocumentUploadError("cog", message)
			toast.error(message)
			if (resetInput) resetInput.value = ""
			setCogFile(null)
			return
		}

		const validExtensions = ["pdf"]
		const fileExtension = file.name.split(".").pop()?.toLowerCase()

		if (!validExtensions.includes(fileExtension)) {
			const message = `Invalid ${documentType === "cog" ? "ROG" : "COR"}. Only PDF files are allowed.`
			setDocumentUploadError(documentType, message)
			toast.error(message)
			if (resetInput) resetInput.value = ""
			if (documentType === "cor") setCorFile(null)
			if (documentType === "cog") setCogFile(null)
			return
		}

		clearDocumentUploadError(documentType)
		const setDocumentFile = documentType === "cor" ? setCorFile : setCogFile
		setDocumentFile(file)
		scanUploadedDocument(file, documentType)
	}

	const handleReviewSubmit = async (e) => {
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
		if (!isValidCpNumber(cpNumber)) {
			toast.error("CP Number must be 11 digits and start with 09")
			scrollToSection("section-personal")
			return
		}

		// Validate Address components
		if (
			!street.trim() ||
			!city.trim() ||
			!province.trim() ||
			!barangay.trim() ||
			!postalCode.trim()
		) {
			toast.error("Please complete your home address details")
			scrollToSection("section-personal")
			return
		}

		// Validate School Info
		if (!course || !year || !section.trim() || (isCogRequired && !gwa.trim())) {
			toast.error(
				isCogRequired
					? "Please complete your school information including GWA"
					: "Please complete your school information",
			)
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
			const message = "Please upload your Certificate of Registration or Advising Slip."
			setDocumentUploadError("cor", message)
			toast.error(message)
			scrollToSection("section-cor")
			return
		}

		if (isCogRequired && !cogFile) {
			const message = "Please upload your Report of Grades (ROG)."
			setDocumentUploadError("cog", message)
			toast.error(message)
			scrollToSection("section-cor")
			return
		}

		if (!validateCorStudentNumberLock()) return
		if (!validateCorCycle(documentScanResult.cor)) {
			scrollToSection("section-cor")
			return
		}
		if (isCogRequired && !validateRogCycle(documentScanResult.cog)) {
			scrollToSection("section-cor")
			return
		}

		try {
			const uniqueFieldsAreValid = await validateUniqueSignupFields()
			if (!uniqueFieldsAreValid) return
		} catch (error) {
			console.error("Signup uniqueness validation failed:", error)
			toast.error("Unable to verify email or CP number uniqueness. Please try again.")
			return
		}

		if (documentScanResult.cog?.hasAcademicConcern) {
			toast.error("Your ROG contains a restricted Final Grade value. Please contact the scholarship office for manual assistance.")
			scrollToSection("section-cor")
			return
		}

		if (!termsAccepted) {
			setTermsChecked(false)
			setShowTermsModal(true)
			return
		}

		// All validations passed, show review
		setHasStartedReview(true)
		setShowReview(true)
	}

	const handleAcceptTermsAndPreview = () => {
		if (!termsChecked) {
			toast.error("Please read and accept the terms and conditions before continuing.")
			return
		}

		setTermsAccepted(true)
		setShowTermsModal(false)
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
			isValidCpNumber(cpNumber) &&
			!!street.trim() &&
			!!city.trim() &&
			!!province.trim() &&
			!!barangay.trim() &&
			!!postalCode.trim()
		)
	}, [fname, lname, cpNumber, street, city, province, barangay, postalCode])

	const isDocumentStageComplete = useMemo(() => {
		return Boolean(corFile && (isCogOptional || (cogFile && gwa.trim())))
	}, [cogFile, corFile, gwa, isCogOptional])
	const showStudentFormStage = isDocumentStageComplete

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
		if (!isValidCpNumber(cpNumber)) {
			toast.error("CP Number must be 11 digits and start with 09")
			scrollToSection("section-personal")
			return
		}

		// Validate Address components
		if (
			!street.trim() ||
			!city.trim() ||
			!province.trim() ||
			!barangay.trim() ||
			!postalCode.trim()
		) {
			toast.error("Please complete your home address details")
			scrollToSection("section-personal")
			return
		}

		// Validate School Info
		if (!course || !year || !section.trim() || (isCogRequired && !gwa.trim())) {
			toast.error(
				isCogRequired
					? "Please complete your school information including GWA"
					: "Please complete your school information",
			)
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
			const message = "Please upload your Certificate of Registration or Advising Slip."
			setDocumentUploadError("cor", message)
			toast.error(message)
			scrollToSection("section-cor")
			return
		}

		if (isCogRequired && !cogFile) {
			const message = "Please upload your Report of Grades (ROG)."
			setDocumentUploadError("cog", message)
			toast.error(message)
			scrollToSection("section-cor")
			return
		}

		if (!validateCorCycle(documentScanResult.cor)) {
			scrollToSection("section-cor")
			return
		}
		if (isCogRequired && !validateRogCycle(documentScanResult.cog)) {
			scrollToSection("section-cor")
			return
		}

		if (documentScanResult.cog?.hasAcademicConcern) {
			toast.error("Your ROG contains a restricted Final Grade value. Please contact the scholarship office for manual assistance.")
			scrollToSection("section-cor")
			return
		}

		if (!termsAccepted) {
			toast.error("Please accept the terms and conditions before creating your account.")
			setTermsChecked(false)
			setShowTermsModal(true)
			return
		}

		if (!validateCorStudentNumberLock()) return

		// Check if user ID exists in Supabase
		const studentId = userId.trim()
		const normalizedSignupEmail = normalizeEmail(email)
		const normalizedSignupCpNumber = normalizeCpNumber(cpNumber)
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

			const uniqueFieldsAreValid = await validateUniqueSignupFields()
			if (!uniqueFieldsAreValid) return

			const corHash = await getFileSha256(corFile)
			await validateStudentSignupWorkflow({
				studentId,
				auth: {
					email: normalizedSignupEmail,
				},
				cor: {
					hash: corHash,
					studentId: documentScanResult.cor?.studentId || studentId,
					academicYear: documentScanResult.cor?.academicYear || "",
					semester: documentScanResult.cor?.semester || "",
				},
				student: {
					email: normalizedSignupEmail,
					cpNumber: normalizedSignupCpNumber,
					year,
					documentScan: documentScanResult,
				},
			})

			console.log(
				"SignupPage: Starting Supabase Auth signUp for email:",
				normalizedSignupEmail,
			)
			const { data: authData, error: authError } = await supabase.auth.signUp({
				email: normalizedSignupEmail,
				password,
				options: {
					emailRedirectTo: `${APP_URL}/confirm-email`,
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
					console.log("SignupPage: Uploading ROG file...")
					const imageData = await uploadToStorage(cogFile, { folder: "ROG" })
					const cogFileId = `${cogFile.name.replace(/\.[^/.]+$/, "")}_${studentId}`
					cogFilePayload = {
						id: cogFileId,
						name: imageData.name,
						type: imageData.type,
						size: imageData.size,
						url: imageData.url,
						semesterTag,
					}
					console.log("SignupPage: ROG upload SUCCESS:", cogFilePayload.url, "ID:", cogFileId)
				} catch (uploadErr) {
					console.error("SignupPage: ROG upload ERROR:", uploadErr)
					toast.error("Failed to upload ROG file: " + uploadErr.message)
					return
				}
			}

			const registrationDraft = {
				course,
				major: major.trim(),
				email: normalizedSignupEmail,
				fname: fname.trim(),
				lname: lname.trim(),
				mname: mname.trim(),
				cpNumber: normalizedSignupCpNumber,
				street: street.trim(),
				city: city.trim(),
				province: province.trim(),
				barangay: barangay.trim(),
				postalCode: postalCode.trim(),
				studentnumber: studentId,
				userType: "student",
				authUserId: authData?.user?.id || "",
				year,
				section: section.trim(),
				gwa: gwa.trim(),
				corFile: corFilePayload,
				cogFile: cogFilePayload,
				documentScan: documentScanResult,
				academicStatus: {
					hasAcademicConcern,
					concernTerms: academicConcernTerms,
					reason: "",
					preferredSupport: "",
				},
			}
			console.log(
				"SignupPage: Saving student record to database...",
				registrationDraft,
			)
			const matchedGrantors = await findMatchingGrantorScholars(
				db,
				registrationDraft,
			)
			console.info("SignupPage: Grantor roster matches found:", {
				count: matchedGrantors.length,
				matches: matchedGrantors.map((match) => ({
					id: match.id || "",
					studentId: match.studentId || match.studentnumber || match.studentNumber || "",
					grantorId: match.grantorId || "",
					grantorName: match.grantorName || "",
					scholarshipName: match.scholarshipName || match.scholarshipTitle || "",
					matchReason: match.matchReason || "",
				})),
			})
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

			const finalizeResult = await finalizeStudentSignupWorkflow({
				studentId,
				isAutoVerified,
				auth: {
					userId: authData?.user?.id || "",
					email: authData?.user?.email || normalizedSignupEmail,
				},
				cor: {
					hash: corHash,
					studentId: documentScanResult.cor?.studentId || studentId,
					academicYear: documentScanResult.cor?.academicYear || "",
					semester: documentScanResult.cor?.semester || "",
				},
				student: {
					...baseData,
					isValidated: isAutoVerified,
					isPending: !isAutoVerified,
					validatedAt: isAutoVerified ? serverTimestamp() : null,
					createdAt: serverTimestamp(),
				},
			})

			console.log("SignupPage: Student document saved through Python workflow", finalizeResult)

			sendEmailNotification(
				email.trim(),
				`${fname.trim()} ${lname.trim()}`,
				"Welcome to BulsuScholar!",
				getWelcomeEmailBody(`${fname.trim()} ${lname.trim()}`, {
					isAutoVerified,
					dashboardUrl: `${APP_URL}/student/dashboard`,
				}),
			).catch((err) => console.error("Welcome email failed:", err))

			toast.success(
				isAutoVerified
					? "Congratulations! Your account has been successfully created."
					: "Your application has been submitted for review.",
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

			setVerificationStatus(isAutoVerified ? "auto-verified" : "pending-review")
			setIsPending(true)
			return

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
					getWelcomeEmailBody(`${fname.trim()} ${lname.trim()}`, {
						isAutoVerified,
						dashboardUrl: `${APP_URL}/student/dashboard`,
					}),
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
			const message = getSignupWorkflowErrorMessage(err)
			toast.error(message.length > 220 ? `${message.slice(0, 217)}...` : message)
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
								<span>Step 1</span>
								<strong>Submit Required Documents</strong>
								<p>Upload your COR and ROG first before completing the student account form.</p>
							</div>

							{/* Document Upload Section */}
							<div id="section-cor" className="signup-form-section signup-form-section--documents">
								<div className="signup-section-header">
									<div className="signup-section-icon">
										<HiOutlineCloudUpload />
									</div>
									<h3 className="signup-section-title">Required Documents</h3>
								</div>

								{/* Certificate of Registration / Advising Slip Upload */}
								<label className="login-label" htmlFor="signup-cor-upload">
									1. Certificate of Registration or Advising Slip{" "}
									<span className="required">*</span>
								</label>
								<label
									className={`signup-upload-wrap ${documentUploadErrors.cor ? "signup-upload-wrap--error" : ""}`}
									htmlFor="signup-cor-upload"
								>
									<input
										id="signup-cor-upload"
										type="file"
										className="signup-file-input"
										accept=".pdf,application/pdf"
										onChange={(e) => processSignupDocumentFile(e.target.files?.[0] ?? null, "cor", e.target)}
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
											<span className={`signup-upload-scan signup-upload-scan--${documentScanState.cor}`}>
												{documentScanState.cor === "scanning"
													? "Scanning COR..."
													: documentScanState.cor === "done"
														? "COR data scanned"
														: documentScanState.cor === "error"
															? "COR scan unavailable"
															: ""}
											</span>
										</>
									) : (
										<>
											<HiOutlineCloudUpload
												className="signup-upload-icon"
												aria-hidden
											/>
											<span className="signup-upload-hint">
												Drop Certificate of Registration or Advising Slip here
											</span>
										</>
									)}
								</label>
								{documentUploadErrors.cor && (
									<p className="signup-upload-error-message">{documentUploadErrors.cor}</p>
								)}

								<label
									className="login-label"
									htmlFor="signup-cog-upload"
									style={{ marginTop: "1rem", display: "block" }}
								>
									2. Report of Grades (ROG){" "}
									{isCogOptional ? (
										<span className="signup-optional-label">(Optional for 1st year, 1st cycle)</span>
									) : (
										<span className="required">*</span>
									)}
								</label>
								<label
									className={`signup-upload-wrap ${!canUploadCog ? "signup-upload-wrap--disabled" : ""} ${documentUploadErrors.cog ? "signup-upload-wrap--error" : ""}`}
									htmlFor={canUploadCog ? "signup-cog-upload" : undefined}
									aria-disabled={!canUploadCog}
								>
									<input
										id="signup-cog-upload"
										type="file"
										className="signup-file-input"
										accept=".pdf,application/pdf"
										disabled={!canUploadCog}
										onChange={(e) => processSignupDocumentFile(e.target.files?.[0] ?? null, "cog", e.target)}
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
											<span className={`signup-upload-scan signup-upload-scan--${documentScanState.cog}`}>
												{documentScanState.cog === "scanning"
													? "Scanning ROG..."
													: documentScanState.cog === "done"
														? "ROG data scanned"
														: documentScanState.cog === "error"
															? "ROG scan unavailable"
															: ""}
											</span>
										</>
									) : (
										<>
											<HiOutlineCloudUpload
												className="signup-upload-icon"
												aria-hidden
											/>
											<span className="signup-upload-hint">
												{!canUploadCog
													? "Upload COR first to enable ROG upload"
													: isCogOptional
													? "Optional: Drop ROG here or click to browse"
													: "Drop ROG here or click to browse"}
											</span>
										</>
									)}
								</label>
								{documentUploadErrors.cog && (
									<p className="signup-upload-error-message">{documentUploadErrors.cog}</p>
								)}

								<label
									className="login-label"
									htmlFor="signup-gwa"
									style={{ marginTop: "1rem", display: "block" }}
								>
									GWA (General Weighted Average){" "}
									{isCogRequired ? <span className="required">*</span> : <span className="signup-optional-label">(Optional)</span>}
								</label>
								<div
									className={`login-input-wrap ${!cogFile && isCogRequired ? "login-input-wrap--disabled" : ""}`}
								>
									<input
										id="signup-gwa"
										type="number"
										step="0.01"
										min="1.0"
										max="5.0"
										className="login-input"
										placeholder={
											cogFile
												? "e.g., 1.25"
												: isCogOptional
													? "Optional for first year, first cycle"
													: "Upload ROG first to enter GWA"
										}
										value={gwa}
										onChange={(e) => setGwa(e.target.value)}
										disabled={!cogFile && isCogRequired}
									/>
								</div>

								<div
									className="signup-cor-note"
									style={{ marginTop: "1.5rem" }}
								>
									{isCogOptional
										? "Step 1 requires COR. ROG is optional because first-year students in the first cycle may not have grades yet."
										: "Step 1 requires both COR and ROG to verify your enrollment and academic status."}
								</div>
							</div>

							{!showStudentFormStage ? (
								<div className="signup-stage-locked">
									<HiOutlineClock aria-hidden />
									<div>
										<strong>Complete Step 1 to continue</strong>
										<p>
											Upload your COR
											{isCogOptional ? "" : " and ROG with GWA"} before the student form appears.
										</p>
									</div>
								</div>
							) : (
								<>
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
									<HiOutlineIdentification className="login-input-icon" aria-hidden />
									<input
										id="signup-user-id"
										type="text"
										className="login-input"
										placeholder="Upload COR to detect your Student ID"
										value={userId}
										onChange={(e) =>
											setUserId(e.target.value.replace(/\D/g, ""))
										}
										readOnly={Boolean(getScannedCorStudentNumber())}
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
													setCpNumber(normalizeCpNumber(e.target.value).slice(0, 11))
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
										setBarangay("")
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
											onChange={(e) => {
												setCity(e.target.value)
												setBarangay("")
											}}
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
									<div className="signup-field">
										<label className="login-label" htmlFor="signup-barangay">
											Barangay <span className="required">*</span>
										</label>
										<select
											id="signup-barangay"
											className="login-select"
											value={barangay}
											onChange={(e) => setBarangay(e.target.value)}
											disabled={!city || barangayLoading || barangayOptions.length === 0}
										>
											<option value="" disabled>
												{!city
													? "Select city first"
													: barangayLoading
														? "Loading barangays..."
														: "Select barangay"}
											</option>
											{barangayOptions.map((item) => (
												<option key={item} value={item}>
													{item}
												</option>
											))}
										</select>
										{barangayError ? (
											<p className="signup-upload-error-message">{barangayError}</p>
										) : null}
									</div>
								</div>

								<div className="signup-row signup-row--address-detail">
									<div className="signup-field signup-field--street">
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
									<div className="signup-field signup-field--postal">
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
							</div>

							{/* School Information Section */}
							<div id="section-school" className="signup-form-section">
								<div className="signup-section-header">
									<div className="signup-section-icon">
										<HiOutlineAcademicCap />
									</div>
									<h3 className="signup-section-title">Course, Year, and Section</h3>
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
								</>
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
											{street}, {barangay}, {city}, {province} {postalCode}
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
														<span>Certificate of Registration / Advising Slip:</span>
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
													{documentPreviewUrls.cor ? (
														<img
															src={documentPreviewUrls.cor}
															alt="COR Preview"
															className="signup-review-document-image"
															onClick={() => {
																setPreviewFile(corFile)
																setShowImagePreview(true)
															}}
														/>
													) : (
														<button type="button" className="signup-review-document-image signup-review-document-placeholder">
															Preview
														</button>
													)}
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
														<span>Report of Grades (ROG):</span>
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
													{documentPreviewUrls.cog ? (
														<img
															src={documentPreviewUrls.cog}
															alt="ROG Preview"
															className="signup-review-document-image"
															onClick={() => {
																setPreviewFile(cogFile)
																setShowImagePreview(true)
															}}
														/>
													) : (
														<button type="button" className="signup-review-document-image signup-review-document-placeholder">
															Preview
														</button>
													)}
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

			{showImagePreview && previewFile && getPreviewUrlForFile(previewFile) && (
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
							src={getPreviewUrlForFile(previewFile)}
							alt="Document Preview"
							className="signup-preview-image"
						/>
					</div>
				</div>
			)}

			{showTermsModal && (
				<div
					className="signup-terms-modal-overlay"
					onClick={() => setShowTermsModal(false)}
				>
					<div
						className="signup-terms-modal"
						role="dialog"
						aria-modal="true"
						aria-labelledby="signup-terms-title"
						onClick={(e) => e.stopPropagation()}
					>
						<button
							type="button"
							className="signup-terms-close"
							aria-label="Close terms and conditions"
							onClick={() => setShowTermsModal(false)}
						>
							X
						</button>
						<div className="signup-terms-header">
							<span className="signup-terms-icon" aria-hidden>
								<HiOutlineCheckCircle />
							</span>
							<div>
								<p className="signup-terms-kicker">Account Consent</p>
								<h2 id="signup-terms-title">Terms and Conditions</h2>
							</div>
						</div>
						<div className="signup-terms-body">
							<p>
								Before creating your BulsuScholar account, please confirm that
								the information and documents you submitted are accurate,
								complete, and belong to you.
							</p>
							<ul>
								<li>
									I understand that my COR, ROG, personal information, contact
									details, and academic records will be used to verify my
									scholarship eligibility.
								</li>
								<li>
									I agree that BulsuScholar may compare my submitted documents
									with existing student and grantor records to prevent duplicate
									accounts or duplicate scholarship applications.
								</li>
								<li>
									I confirm that I am not using another student's documents,
									email address, CP number, or student number.
								</li>
								<li>
									I understand that false or mismatched information may cause my
									account request or scholarship application to be rejected,
									archived, or reviewed manually.
								</li>
							</ul>
						</div>
						<label className="signup-terms-check">
							<input
								type="checkbox"
								checked={termsChecked}
								onChange={(e) => setTermsChecked(e.target.checked)}
							/>
							<span>
								I have read and agree to the terms and conditions for creating
								my BulsuScholar account.
							</span>
						</label>
						<div className="signup-terms-actions">
							<button
								type="button"
								className="signup-terms-cancel"
								onClick={() => setShowTermsModal(false)}
							>
								Cancel
							</button>
							<button
								type="button"
								className="signup-terms-continue"
								disabled={!termsChecked}
								onClick={handleAcceptTermsAndPreview}
							>
								Continue to Preview
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
