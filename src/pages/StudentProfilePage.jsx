import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
	HiOutlineArrowLeft,
	HiOutlineCamera,
	HiOutlineCheckCircle,
	HiOutlineDocumentText,
	HiOutlineDownload,
	HiOutlineEye,
	HiOutlineRefresh,
	HiOutlineSave,
	HiOutlineUpload,
	HiOutlineXCircle,
} from "react-icons/hi"
import { toast } from "react-toastify"
import StudentTopbar from "../components/StudentTopbar"
import StudentFooter from "../components/StudentFooter"
import StudentDatePicker from "../components/StudentDatePicker"
import CustomSelect from "../components/CustomSelect"
import {
	OTHER_PROVINCE_VALUE,
	REGION_III_PROVINCE_OPTIONS,
	getBarangaysByLocation,
	getCitiesByProvince,
	getRegionProvinceSelection,
} from "../data/philippineLocations"
import useThemeMode from "../hooks/useThemeMode"
import useStudentProfilePhoto from "../hooks/useStudentProfilePhoto"
import {
	getStudentProfileWorkspace,
	getStudentVerificationDocumentBlob,
	previewStudentProfileDraft,
	saveStudentProfileDraft,
	submitStudentProfile,
	uploadStudentProfilePhoto,
	uploadStudentVerificationDocument,
} from "../services/studentProfileService"
import { CONTACT_NUMBER_RULE_MESSAGE, isValidContactNumber, normalizeContactNumber, sanitizeContactNumber } from "../utils/contactNumber"
import "../css/StudentDashboard.css"
import "../css/StudentPortalRefresh.css"

const EMPTY_ADDRESS = { street: "", barangay: "", city: "", province: "", postalCode: "" }
const EMPTY_PROFILE = {
	fname: "", mname: "", lname: "", extension: "", email: "", cpNumber: "", birthDate: "",
	guardianName: "", guardianContact: "", college: "", course: "", year: "", section: "",
	profileImageUrl: "", permanentAddress: EMPTY_ADDRESS,
}

const COLLEGE_OPTIONS = ["CBA", "COE", "CICS", "COED", "CIT"]

const DOCUMENT_LABELS = {
	cor: "Certificate of Registration",
	rog: "Report of Grades",
	identity: "Identity Document",
	profile: "Student Application Profile",
}

function FieldLabel({ children, required = false }) {
	return (
		<span className="student-profile-label-text">
			{children}{required ? <span className="student-required-marker" aria-hidden="true">*</span> : null}
		</span>
	)
}

function statusLabel(entry = {}) {
	if (entry.status === "approved") return "Approved"
	if (entry.status === "rejected") return "Needs correction"
	if (entry.status === "pending") return "Pending review"
	if (entry.status === "exempt") return "Not required for this semester"
	return "Not submitted"
}

function SignaturePad({ value, onChange }) {
	const canvasRef = useRef(null)
	const drawingRef = useRef(false)

	const prepareCanvas = useCallback(() => {
		const canvas = canvasRef.current
		if (!canvas) return null
		const rect = canvas.getBoundingClientRect()
		const ratio = window.devicePixelRatio || 1
		if (canvas.width !== Math.round(rect.width * ratio) || canvas.height !== Math.round(rect.height * ratio)) {
			canvas.width = Math.max(1, Math.round(rect.width * ratio))
			canvas.height = Math.max(1, Math.round(rect.height * ratio))
			const context = canvas.getContext("2d")
			context.scale(ratio, ratio)
			context.lineWidth = 2.2
			context.lineCap = "round"
			context.strokeStyle = "#102a22"
			if (value) {
				const image = new Image()
				image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height)
				image.src = value
			}
		}
		return canvas
	}, [value])

	useEffect(() => { prepareCanvas() }, [prepareCanvas])

	const point = (event) => {
		const rect = canvasRef.current.getBoundingClientRect()
		return { x: event.clientX - rect.left, y: event.clientY - rect.top }
	}
	const start = (event) => {
		const canvas = prepareCanvas()
		if (!canvas) return
		drawingRef.current = true
		canvas.setPointerCapture?.(event.pointerId)
		const current = point(event)
		const context = canvas.getContext("2d")
		context.beginPath()
		context.moveTo(current.x, current.y)
	}
	const move = (event) => {
		if (!drawingRef.current) return
		const current = point(event)
		const context = canvasRef.current.getContext("2d")
		context.lineTo(current.x, current.y)
		context.stroke()
	}
	const finish = () => {
		if (!drawingRef.current) return
		drawingRef.current = false
		onChange(canvasRef.current.toDataURL("image/png"))
	}
	const clear = () => {
		const canvas = canvasRef.current
		canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height)
		onChange("")
	}
	const upload = (event) => {
		const file = event.target.files?.[0]
		event.target.value = ""
		if (!file) return
		if (!/^image\/(png|jpeg)$/.test(file.type) || file.size > 2 * 1024 * 1024) {
			toast.error("Signature must be a PNG or JPG image no larger than 2 MB.")
			return
		}
		const reader = new FileReader()
		reader.onload = () => onChange(String(reader.result || ""))
		reader.readAsDataURL(file)
	}

	return (
		<div className="student-profile-signature">
			<canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} aria-label="Draw your signature" />
			<div className="student-profile-signature-actions">
				<label className="student-profile-signature-button student-profile-signature-button--upload"><HiOutlineUpload aria-hidden="true" /> Upload signature<input type="file" accept="image/png,image/jpeg" onChange={upload} /></label>
				<button type="button" className="student-profile-signature-button student-profile-signature-button--clear" onClick={clear}><HiOutlineRefresh aria-hidden="true" /> Clear</button>
			</div>
			<small>Draw with a mouse or finger, or upload a cropped PNG/JPG. A fresh signature is required each time you submit the form.</small>
		</div>
	)
}

function AddressFields({ title, value, onChange, required = false }) {
	const [provinceSelection, setProvinceSelection] = useState(() => getRegionProvinceSelection(value?.province))
	const [barangayOptions, setBarangayOptions] = useState([])
	const [barangayLoading, setBarangayLoading] = useState(false)
	const [barangayError, setBarangayError] = useState("")
	const address = { ...EMPTY_ADDRESS, ...(value || {}) }
	const update = (key, next) => onChange({ ...address, [key]: next })
	const updateMany = (next) => onChange({ ...address, ...next })

	useEffect(() => {
		let cancelled = false
		const resetError = window.setTimeout(() => setBarangayError(""), 0)
		if (provinceSelection === OTHER_PROVINCE_VALUE || !address.province || !address.city) {
			const resetState = window.setTimeout(() => {
				setBarangayOptions([])
				setBarangayLoading(false)
			}, 0)
			return () => {
				cancelled = true
				window.clearTimeout(resetError)
				window.clearTimeout(resetState)
			}
		}

		const startLoading = window.setTimeout(() => setBarangayLoading(true), 0)
		getBarangaysByLocation(address.province, address.city)
			.then((options) => {
				if (cancelled) return
				setBarangayOptions(options)
				if (options.length === 0) setBarangayError("Barangays could not be found for the selected city or municipality.")
			})
			.catch((error) => {
				if (cancelled) return
				console.error("Profile barangay lookup failed:", error)
				setBarangayOptions([])
				setBarangayError("Unable to load barangays. Please check your connection and try again.")
			})
			.finally(() => { if (!cancelled) setBarangayLoading(false) })

		return () => {
			cancelled = true
			window.clearTimeout(resetError)
			window.clearTimeout(startLoading)
		}
	}, [address.city, address.province, provinceSelection])

	const availableBarangays = address.barangay && !barangayOptions.includes(address.barangay)
		? [address.barangay, ...barangayOptions]
		: barangayOptions

	return (
		<fieldset className="student-profile-address-group">
			<legend><FieldLabel required={required}>{title}</FieldLabel></legend>
			<label>
				<FieldLabel required={required}>Province</FieldLabel>
				<CustomSelect
					id="student-profile-province"
					className="student-profile-custom-select"
					buttonClassName="student-profile-control"
					value={provinceSelection}
					onChange={(nextProvince) => {
						setProvinceSelection(nextProvince)
						updateMany({ province: nextProvince === OTHER_PROVINCE_VALUE ? "" : nextProvince, city: "", barangay: "" })
					}}
					options={REGION_III_PROVINCE_OPTIONS}
					placeholder="Select province"
				/>
			</label>
			{provinceSelection === OTHER_PROVINCE_VALUE ? (
				<label>
					<FieldLabel required={required}>Province name</FieldLabel>
					<input value={address.province} onChange={(event) => update("province", event.target.value)} placeholder="Enter province" />
				</label>
			) : null}
			<label>
				<FieldLabel required={required}>City / Municipality</FieldLabel>
				{provinceSelection === OTHER_PROVINCE_VALUE ? (
					<input value={address.city} onChange={(event) => updateMany({ city: event.target.value, barangay: "" })} placeholder="Enter city or municipality" />
				) : (
					<CustomSelect
						id="student-profile-city"
						className="student-profile-custom-select"
						buttonClassName="student-profile-control"
						value={address.city}
						onChange={(nextCity) => updateMany({ city: nextCity, barangay: "" })}
						disabled={!address.province}
						options={address.province ? getCitiesByProvince(address.province) : []}
						placeholder={address.province ? "Select city" : "Select province first"}
					/>
				)}
			</label>
			<label>
				<FieldLabel required={required}>Barangay</FieldLabel>
				{provinceSelection === OTHER_PROVINCE_VALUE ? (
					<input value={address.barangay} onChange={(event) => update("barangay", event.target.value)} placeholder="Enter barangay" />
				) : (
					<CustomSelect
						id="student-profile-barangay"
						className="student-profile-custom-select"
						buttonClassName="student-profile-control"
						value={address.barangay}
						onChange={(nextBarangay) => update("barangay", nextBarangay)}
						disabled={!address.city || barangayLoading || availableBarangays.length === 0}
						options={availableBarangays}
						placeholder={!address.city ? "Select city first" : barangayLoading ? "Loading barangays..." : "Select barangay"}
					/>
				)}
				{barangayError ? <small className="student-profile-address-error">{barangayError}</small> : null}
			</label>
			<label className="student-profile-address-street"><FieldLabel>Street / Subdivision <span className="student-label-optional">(Optional)</span></FieldLabel><input value={address.street} onChange={(event) => update("street", event.target.value)} placeholder="Street name / Subdivision" /></label>
			<label><FieldLabel>Postal Code <span className="student-label-optional">(Optional)</span></FieldLabel><input value={address.postalCode} onChange={(event) => update("postalCode", event.target.value)} inputMode="numeric" placeholder="XXXX" /></label>
		</fieldset>
	)
}

export default function StudentProfilePage({ formMode = false }) {
	const navigate = useNavigate()
	const { theme, setTheme } = useThemeMode()
	const [workspace, setWorkspace] = useState(null)
	const [profile, setProfile] = useState(EMPTY_PROFILE)
	const [signature, setSignature] = useState("")
	const [busy, setBusy] = useState("")
	const [identityKind, setIdentityKind] = useState("student_id")
	const { photoUrl: profilePhotoUrl } = useStudentProfilePhoto()

	const load = useCallback(async () => {
		try {
			const result = await getStudentProfileWorkspace()
			setWorkspace(result)
			setProfile({ ...EMPTY_PROFILE, ...(result.draft || {}), permanentAddress: { ...EMPTY_ADDRESS, ...(result.draft?.permanentAddress || {}) } })
		} catch (error) {
			console.error("Unable to load student profile workspace.", error)
			toast.error(error.message || "Unable to load your profile.")
		}
	}, [])

	useEffect(() => { load() }, [load])
	const latestSubmissions = useMemo(() => {
		const result = {}
		for (const item of workspace?.submissions || []) if (!result[item.documentType]) result[item.documentType] = item
		return result
	}, [workspace?.submissions])
	const submittedIdentityLabel = latestSubmissions.identity?.documentKind === "previous_school_id"
		? "Previous-school Photo ID"
		: latestSubmissions.identity?.documentKind === "government_id"
			? "Government Photo ID"
			: "Student ID"
	useEffect(() => {
		if (latestSubmissions.identity?.documentKind) setIdentityKind(latestSubmissions.identity.documentKind)
	}, [latestSubmissions.identity?.documentKind])
	const profileCompleteness = useMemo(() => {
		const required = ["fname", "lname", "email", "cpNumber", "birthDate", "guardianName", "guardianContact", "college", "course", "year", "section"]
		const addressFields = ["barangay", "city", "province"]
		const hasPhoto = Boolean(workspace?.student?.profileImage?.path || workspace?.draft?.profileImage?.path || profilePhotoUrl)
		const completed = required.filter((key) => String(profile[key] || "").trim()).length + addressFields.filter((key) => String(profile.permanentAddress?.[key] || "").trim()).length + (hasPhoto ? 1 : 0)
		const total = required.length + addressFields.length + 1
		return { completed, total, percent: Math.round((completed / total) * 100) }
	}, [profile, profilePhotoUrl, workspace?.draft?.profileImage?.path, workspace?.student?.profileImage?.path])

	const update = (key, value) => setProfile((current) => ({ ...current, [key]: value }))
	const saveDraft = async () => {
		if (profile.cpNumber && !isValidContactNumber(profile.cpNumber)) return toast.error(CONTACT_NUMBER_RULE_MESSAGE)
		setBusy("save")
		try {
			const normalized = { ...profile, cpNumber: profile.cpNumber ? normalizeContactNumber(profile.cpNumber) : "" }
			await saveStudentProfileDraft(normalized)
			setProfile(normalized)
			toast.success("Profile draft saved.")
			await load()
		} catch (error) {
			toast.error(error.message || "Unable to save the draft.")
		} finally { setBusy("") }
	}
	const submitProfile = async () => {
		if (!hasProfilePhoto) return toast.error("Upload a profile photo from the Document Vault before submitting this form.")
		if (!signature) return toast.error("Draw or upload your signature before submitting.")
		setBusy("submit")
		try {
			await saveStudentProfileDraft(profile)
			const result = await submitStudentProfile(signature)
			setSignature("")
			toast.success(result.submission?.status === "approved" ? "Profile submitted and approved automatically." : "Profile submitted for review.")
			await load()
		} catch (error) {
			const fields = error.data?.detail?.fields
			toast.error(fields?.length ? `Complete: ${fields.join(", ")}` : error.message || "Unable to submit the profile.")
		} finally { setBusy("") }
	}
	const previewDraft = async () => {
		setBusy("preview")
		try {
			const blob = await previewStudentProfileDraft(profile)
			const url = URL.createObjectURL(blob)
			window.open(url, "_blank", "noopener,noreferrer")
			setTimeout(() => URL.revokeObjectURL(url), 60000)
		} catch (error) {
			toast.error(error.message || "Unable to preview the draft.")
		} finally { setBusy("") }
	}
	const uploadDocument = async (type, file, kind = "") => {
		if (!file) return
		setBusy(type)
		try {
			await uploadStudentVerificationDocument(type, file, kind)
			toast.success(`${DOCUMENT_LABELS[type]} submitted for review.`)
			await load()
		} catch (error) {
			toast.error(error.message || "Unable to upload the document.")
		} finally { setBusy("") }
	}
	const preview = async (submission) => {
		try {
			const blob = await getStudentVerificationDocumentBlob(submission.id)
			const url = URL.createObjectURL(blob)
			window.open(url, "_blank", "noopener,noreferrer")
			setTimeout(() => URL.revokeObjectURL(url), 60000)
		} catch (error) { toast.error(error.message || "Unable to open the document.") }
	}
	const download = async (submission) => {
		try {
			const blob = await getStudentVerificationDocumentBlob(submission.id)
			const url = URL.createObjectURL(blob)
			const anchor = document.createElement("a")
			anchor.href = url
			anchor.download = submission.name || "Student_Application_Profile.pdf"
			anchor.click()
			setTimeout(() => URL.revokeObjectURL(url), 1000)
		} catch (error) { toast.error(error.message || "Unable to download the document.") }
	}
	const uploadPhoto = async (file) => {
		if (!file) return
		setBusy("photo")
		try {
			await uploadStudentProfilePhoto(file)
			toast.success("Profile photo updated.")
			await load()
		} catch (error) { toast.error(error.message || "Unable to upload your profile photo.") }
		finally { setBusy("") }
	}

	if (!workspace) return <div className="student-profile-loading">Loading profile workspace...</div>
	const user = workspace.student || profile
	const requirements = workspace.requirements || {}
	const hasProfilePhoto = Boolean(workspace.student?.profileImage?.path || workspace.draft?.profileImage?.path || profilePhotoUrl)
	const studentName = [profile.fname, profile.mname, profile.lname].filter(Boolean).join(" ") || "Student"
	const studentNumber = user.id || user.studentId || user.studentnumber || "Student number unavailable"
	const yearSection = [profile.year, profile.section].filter(Boolean).join(" - ") || "Not set"
	const cycleDocumentText = (submission, verification, exempt = false) => {
		if (exempt) return "Not required this semester"
		if (!submission) return "Not uploaded"
		return `Current (${submission.academicCycle || workspace.academicCycle}) - ${statusLabel(verification)}`
	}

	if (!formMode) return (
		<div className={`student-portal student-dashboard student-portal-view student-portal-view--profile student-profile-workspace ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
			<StudentTopbar user={user} theme={theme} setTheme={setTheme} />
			<main className="student-shell student-profile-account-page">
				<div className="student-profile-page-title">
					<button type="button" className="student-back-button" onClick={() => navigate("/student-dashboard")}><HiOutlineArrowLeft aria-hidden /> Back to Dashboard</button>
					<div>
						<span className="student-profile-page-kicker">Student records</span>
						<h1 className="student-page-heading">My Profile</h1>
						<p className="student-page-sub">Manage your account information and current-cycle documents.</p>
					</div>
					<span className="student-profile-cycle">{workspace.academicCycle}</span>
				</div>

				<section className="student-profile-modern-wrap">
					<aside className="student-profile-cover" aria-label="Student summary">
						<div className="student-profile-cover-content student-profile-cover-content--centered">
							<div className="student-profile-cover-avatar-wrap">
								<div className="student-profile-photo-shell">
									{profilePhotoUrl ? <img className="student-profile-avatar-image" src={profilePhotoUrl} alt={`${studentName} profile`} /> : <span className="student-profile-avatar-fallback" aria-hidden>{`${profile.fname?.[0] || ""}${profile.lname?.[0] || ""}` || "ST"}</span>}
									<span className="student-profile-photo-overlay">
										<label className={`student-profile-photo-edit ${busy === "photo" ? "is-busy" : ""}`} title={hasProfilePhoto ? "Change profile photo" : "Upload profile photo"} aria-label={hasProfilePhoto ? "Change profile photo" : "Upload profile photo"}>
											<HiOutlineCamera aria-hidden />
											<input type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; uploadPhoto(file) }} />
										</label>
									</span>
								</div>
							</div>
							<div className="student-profile-cover-text">
								<h2>{studentName}</h2>
								<p>{studentNumber}</p>
							</div>
							<div className="student-profile-summary-chips">
								<span>{workspace.academicCycle || "Not set"}</span>
								<span>{yearSection}</span>
								<span>{profile.course || "Not set"}</span>
							</div>
						</div>
					</aside>

					<div className="student-profile-section-grid">
						<section className="student-profile-section-card">
							<header><div><h2>Personal Information</h2><p>Locked account and academic fields can only change through an authorized workflow.</p></div></header>
							<div className="student-profile-form-grid">
								<label className="student-profile-label">First Name *<input className="student-profile-input" value={profile.fname} onChange={(event) => update("fname", event.target.value)} /></label>
								<label className="student-profile-label">Middle Name<input className="student-profile-input" value={profile.mname} onChange={(event) => update("mname", event.target.value)} /></label>
								<label className="student-profile-label">Last Name *<input className="student-profile-input" value={profile.lname} onChange={(event) => update("lname", event.target.value)} /></label>
								<label className="student-profile-label">Email *<input className="student-profile-input student-profile-input--locked" type="email" value={profile.email} readOnly aria-readonly="true" title="Email changes require the account recovery workflow." /></label>
								<label className="student-profile-label">Contact Number *<input className="student-profile-input student-profile-input--locked" value={profile.cpNumber} readOnly aria-readonly="true" /></label>
								<label className="student-profile-label">Course *<input className="student-profile-input student-profile-input--locked" value={profile.course} readOnly aria-readonly="true" /></label>
								<label className="student-profile-label">Year Level *<select className="student-profile-input student-profile-input--locked" value={profile.year} disabled aria-disabled="true"><option value="">Select year</option>{[1,2,3,4].map((year) => <option key={year} value={String(year)}>Year {year}</option>)}</select></label>
								<label className="student-profile-label">Section *<input className="student-profile-input student-profile-input--locked" value={profile.section} readOnly aria-readonly="true" /></label>
							</div>
							<div className="student-profile-editor-actions"><button type="button" className="student-profile-action student-profile-action--primary" disabled={Boolean(busy)} onClick={saveDraft}><HiOutlineSave aria-hidden /> {busy === "save" ? "Saving..." : "Save"}</button></div>
						</section>

						<section className="student-profile-section-card student-profile-section-card--full student-document-vault">
							<h2>Document Vault</h2>
							<p className="student-profile-vault-sub">Upload and review COR, ROG, {submittedIdentityLabel}, and Student Application Profile records.</p>
							<div className="student-vault-grid">
								<article className="student-vault-card" id="cor">
									<div><h3>COR</h3><p>{cycleDocumentText(latestSubmissions.cor, workspace.verification?.cor)}</p>{workspace.verification?.cor?.reason ? <small className="student-vault-reason">{workspace.verification.cor.reason}</small> : null}</div>
									<div className="student-vault-actions">{latestSubmissions.cor ? <button type="button" className="student-vault-link" onClick={() => preview(latestSubmissions.cor)}><HiOutlineDocumentText /> View COR</button> : null}<label className="student-vault-upload-btn" aria-disabled={Boolean(busy)}><HiOutlineUpload /> {latestSubmissions.cor ? "Update COR" : "Upload COR"}<input type="file" accept="application/pdf" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; uploadDocument("cor", file) }} /></label></div>
								</article>
								<article className="student-vault-card" id="rog">
									<div><h3>ROG</h3><p>{cycleDocumentText(latestSubmissions.rog, workspace.verification?.rog, !requirements.rogRequired)}</p>{workspace.verification?.rog?.reason ? <small className="student-vault-reason">{workspace.verification.rog.reason}</small> : null}</div>
									{requirements.rogRequired ? <div className="student-vault-actions">{latestSubmissions.rog ? <button type="button" className="student-vault-link" onClick={() => preview(latestSubmissions.rog)}><HiOutlineDocumentText /> View ROG</button> : null}<label className="student-vault-upload-btn" aria-disabled={Boolean(busy)}><HiOutlineUpload /> {latestSubmissions.rog ? "Update ROG" : "Upload ROG"}<input type="file" accept="application/pdf" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; uploadDocument("rog", file) }} /></label></div> : <div className="student-vault-exempt"><HiOutlineCheckCircle /> Exempt</div>}
								</article>
								<article className="student-vault-card" id="identity">
									<div><h3>{latestSubmissions.identity ? submittedIdentityLabel : requirements.identityRule === "alternative_photo_id_allowed" ? "Identity Document" : "Student ID"}</h3><p>{cycleDocumentText(latestSubmissions.identity, workspace.verification?.identity)}</p>{workspace.verification?.identity?.reason ? <small className="student-vault-reason">{workspace.verification.identity.reason}</small> : null}</div>
									<div className="student-vault-actions">{requirements.identityRule === "alternative_photo_id_allowed" ? <select className="student-vault-kind-select" value={identityKind} onChange={(event) => setIdentityKind(event.target.value)} aria-label="Identity document type"><option value="student_id">Student ID</option><option value="previous_school_id">Previous-school ID</option><option value="government_id">Government ID</option></select> : null}{latestSubmissions.identity ? <button type="button" className="student-vault-link" onClick={() => preview(latestSubmissions.identity)}><HiOutlineDocumentText /> View {submittedIdentityLabel}</button> : null}<label className="student-vault-upload-btn" aria-disabled={Boolean(busy)}><HiOutlineUpload /> {latestSubmissions.identity ? `Update ${submittedIdentityLabel}` : "Upload ID"}<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; uploadDocument("identity", file, identityKind) }} /></label></div>
								</article>
								<article className="student-vault-card student-vault-card--application" id="profile">
									<div><h3>Student Application Profile</h3><p>{cycleDocumentText(latestSubmissions.profile, workspace.verification?.profile)}</p>{workspace.verification?.profile?.reason ? <small className="student-vault-reason">{workspace.verification.profile.reason}</small> : null}{!hasProfilePhoto ? <small className="student-document-disabled-reason">Upload a profile photo first to enable profile creation.</small> : null}</div>
									<div className="student-vault-actions">{latestSubmissions.profile ? <><button type="button" className="student-vault-link" onClick={() => preview(latestSubmissions.profile)}><HiOutlineEye /> View</button><button type="button" className="student-vault-link" onClick={() => download(latestSubmissions.profile)}><HiOutlineDownload /> Download PDF</button></> : null}<button type="button" className="student-vault-upload-btn" disabled={!hasProfilePhoto || Boolean(busy)} onClick={() => navigate("/student-dashboard/profile/form")}><HiOutlineDocumentText /> Create Student Profile Form</button></div>
								</article>
							</div>
						</section>
					</div>
				</section>
			</main>
			<StudentFooter />
		</div>
	)

	return (
		<div className={`student-portal student-dashboard student-portal-view student-profile-workspace ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
			<StudentTopbar user={user} theme={theme} setTheme={setTheme} />
			<main className="student-shell">
				<div className="student-profile-page-head">
					<button type="button" className="student-back-button" onClick={() => navigate("/student-dashboard/profile")}><HiOutlineArrowLeft aria-hidden /> Back to Document Vault</button>
					<div><span>Student records</span><h1>Create Student Profile Form</h1><p>Complete the official profile, preview the filled template, then submit a signed revision.</p></div>
					<span className="student-profile-cycle">{workspace.academicCycle}</span>
				</div>

				<section className="student-profile-editor" id="application-profile">
					<header><div className="student-profile-editor-title">{profilePhotoUrl ? <img src={profilePhotoUrl} alt={`${profile.fname || "Student"} profile`} /> : <span className="student-profile-photo-fallback" aria-hidden>{`${profile.fname?.[0] || ""}${profile.lname?.[0] || ""}` || "ST"}</span>}<div><h2>Student Application Profile</h2><p>Your approved revision can be reused by scholarship applications in this academic cycle.</p></div></div><span className={`student-review-status student-review-status--${workspace.verification?.profile?.status || "missing"}`}>{statusLabel(workspace.verification?.profile)}</span></header>
					<div className="student-profile-completeness"><div><strong>Required information</strong><span>{profileCompleteness.completed} of {profileCompleteness.total} complete</span></div><progress value={profileCompleteness.completed} max={profileCompleteness.total}>{profileCompleteness.percent}%</progress></div>
					<div className="student-profile-photo-field">
						<div className="student-profile-photo-preview">
							{profilePhotoUrl ? <img src={profilePhotoUrl} alt={`${studentName} 2x2 profile`} /> : <span aria-hidden>{`${profile.fname?.[0] || ""}${profile.lname?.[0] || ""}` || "ST"}</span>}
						</div>
						<div><h3>Profile Picture</h3><p>Use a clear, front-facing PNG, JPG, or WebP photo. It will be center-cropped to the official 2x2 frame.</p></div>
						<label className={`student-profile-photo-upload ${busy === "photo" ? "is-busy" : ""}`}><HiOutlineCamera aria-hidden /> {hasProfilePhoto ? "Change Photo" : "Upload Photo"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; uploadPhoto(file) }} /></label>
					</div>
					<div className="student-profile-form-grid student-profile-form-grid--new">
						<label><FieldLabel required>First Name</FieldLabel><input value={profile.fname} onChange={(event) => update("fname", event.target.value)} /></label>
						<label><FieldLabel>Middle Name</FieldLabel><input value={profile.mname} onChange={(event) => update("mname", event.target.value)} /></label>
						<label><FieldLabel required>Last Name</FieldLabel><input value={profile.lname} onChange={(event) => update("lname", event.target.value)} /></label>
						<label><FieldLabel>Extension</FieldLabel><input value={profile.extension} onChange={(event) => update("extension", event.target.value)} placeholder="Jr., III" /></label>
						<label><FieldLabel required>Email Address</FieldLabel><input className="student-profile-input--locked" type="email" value={profile.email} readOnly aria-readonly="true" title="Email changes require the account recovery workflow." /></label>
						<label><FieldLabel required>Contact Number</FieldLabel><input className="student-profile-input--locked" value={profile.cpNumber} readOnly aria-readonly="true" /></label>
						<div className="student-profile-form-field"><FieldLabel required>Date of Birth</FieldLabel><StudentDatePicker value={profile.birthDate} onChange={(value) => update("birthDate", value)} /></div>
						<div className="student-profile-form-field"><FieldLabel required>College</FieldLabel><CustomSelect id="student-profile-college" className="student-profile-custom-select" buttonClassName="student-profile-control" value={profile.college} onChange={(college) => update("college", college)} options={COLLEGE_OPTIONS} placeholder="Select college" ariaLabel="College" /></div>
						<label className="student-profile-wide"><FieldLabel required>Academic Program Enrolled In</FieldLabel><input className="student-profile-input--locked" value={profile.course} readOnly aria-readonly="true" /></label>
						<label><FieldLabel required>Year Level</FieldLabel><select className="student-profile-input--locked" value={profile.year} disabled aria-disabled="true"><option value="">Select year</option>{[1,2,3,4].map((year) => <option key={year} value={String(year)}>Year {year}</option>)}</select></label>
						<label><FieldLabel required>Section</FieldLabel><input className="student-profile-input--locked" value={profile.section} readOnly aria-readonly="true" /></label>
						<label className="student-profile-wide"><FieldLabel required>Legal Guardian&apos;s Full Name</FieldLabel><input value={profile.guardianName} onChange={(event) => update("guardianName", event.target.value)} /></label>
						<label><FieldLabel required>Legal Guardian Contact Number</FieldLabel><input value={profile.guardianContact} onChange={(event) => update("guardianContact", sanitizeContactNumber(event.target.value))} inputMode="numeric" maxLength={11} /></label>
					</div>
					<AddressFields title="Permanent Address" required value={profile.permanentAddress} onChange={(value) => update("permanentAddress", value)} />
					<div className="student-profile-attestation"><h3>Applicant signature</h3><p>I attest that the information supplied in this profile is true and complete.</p><SignaturePad value={signature} onChange={setSignature} /></div>
					<div className="student-profile-editor-actions">
						<div className="student-profile-editor-actions__primary">
							<button type="button" className="student-profile-action student-profile-action--secondary" disabled={Boolean(busy)} onClick={saveDraft}><HiOutlineSave aria-hidden /> {busy === "save" ? "Saving..." : "Save Draft"}</button>
							<button type="button" className="student-profile-action student-profile-action--secondary" disabled={Boolean(busy)} onClick={previewDraft}><HiOutlineEye aria-hidden /> {busy === "preview" ? "Preparing..." : "Preview"}</button>
							<button type="button" className="student-profile-action student-profile-action--primary" disabled={!hasProfilePhoto || Boolean(busy)} onClick={submitProfile}><HiOutlineCheckCircle aria-hidden /> {busy === "submit" ? "Submitting..." : "Submit for Review"}</button>
						</div>
						{latestSubmissions.profile ? <div className="student-profile-editor-actions__pdf"><button type="button" className="student-profile-action student-profile-action--quiet" onClick={() => preview(latestSubmissions.profile)}><HiOutlineEye aria-hidden /> View PDF</button><button type="button" className="student-profile-action student-profile-action--quiet" onClick={() => download(latestSubmissions.profile)}><HiOutlineDownload aria-hidden /> Download PDF</button></div> : null}
					</div>
					{!hasProfilePhoto ? <p className="student-document-disabled-reason">Upload a profile photo before submitting.</p> : null}
					{workspace.verification?.profile?.reason ? <p className="student-profile-rejection"><HiOutlineXCircle /> {workspace.verification.profile.reason}</p> : null}
					{Object.keys(workspace.verification?.profile?.fieldErrors || {}).length ? <ul className="student-profile-field-errors">{Object.entries(workspace.verification.profile.fieldErrors).map(([field, message]) => <li key={field}><strong>{field}:</strong> {message}</li>)}</ul> : null}
				</section>

				<StudentFooter description="Manage your student profile and verification records." />
			</main>
		</div>
	)
}
