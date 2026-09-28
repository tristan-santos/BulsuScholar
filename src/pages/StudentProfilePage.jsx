import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
	HiOutlineArrowLeft,
	HiOutlineCheckCircle,
	HiOutlineDocumentText,
	HiOutlineEye,
	HiOutlineRefresh,
	HiOutlineSave,
	HiOutlineUpload,
	HiOutlineXCircle,
} from "react-icons/hi"
import { toast } from "react-toastify"
import StudentTopbar from "../components/StudentTopbar"
import StudentFooter from "../components/StudentFooter"
import useThemeMode from "../hooks/useThemeMode"
import {
	getStudentProfileWorkspace,
	getStudentVerificationDocumentBlob,
	previewStudentProfileDraft,
	saveStudentProfileDraft,
	submitStudentProfile,
	uploadStudentVerificationDocument,
} from "../services/studentProfileService"
import { CONTACT_NUMBER_RULE_MESSAGE, isValidContactNumber, normalizeContactNumber, sanitizeContactNumber } from "../utils/contactNumber"
import "../css/StudentDashboard.css"
import "../css/StudentPortalRefresh.css"

const EMPTY_ADDRESS = { street: "", barangay: "", city: "", province: "", postalCode: "" }
const EMPTY_PROFILE = {
	fname: "", mname: "", lname: "", extension: "", email: "", cpNumber: "", birthDate: "",
	guardianName: "", guardianContact: "", college: "", course: "", major: "", year: "", section: "",
	profileImageUrl: "", permanentAddress: EMPTY_ADDRESS, currentAddress: EMPTY_ADDRESS,
}

const DOCUMENT_LABELS = {
	cor: "Certificate of Registration",
	rog: "Report of Grades",
	identity: "Identity Document",
	profile: "Student Application Profile",
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
			<div>
				<label className="student-profile-file-action"><HiOutlineUpload /> Upload signature<input type="file" accept="image/png,image/jpeg" onChange={upload} /></label>
				<button type="button" data-button-variant="neutral" onClick={clear}><HiOutlineRefresh /> Clear</button>
			</div>
			<small>Draw with a mouse or finger, or upload a cropped PNG/JPG. A new signature is required for each submitted revision.</small>
		</div>
	)
}

function AddressFields({ title, value, onChange, required = false }) {
	const update = (key, next) => onChange({ ...(value || EMPTY_ADDRESS), [key]: next })
	return (
		<fieldset className="student-profile-address-group">
			<legend>{title}{required ? " *" : ""}</legend>
			<label>House / Street<input value={value?.street || ""} onChange={(event) => update("street", event.target.value)} /></label>
			<label>Barangay<input value={value?.barangay || ""} onChange={(event) => update("barangay", event.target.value)} /></label>
			<label>City / Municipality<input value={value?.city || ""} onChange={(event) => update("city", event.target.value)} /></label>
			<label>Province<input value={value?.province || ""} onChange={(event) => update("province", event.target.value)} /></label>
			<label>Postal Code<input value={value?.postalCode || ""} onChange={(event) => update("postalCode", event.target.value)} inputMode="numeric" /></label>
		</fieldset>
	)
}

export default function StudentProfilePage() {
	const navigate = useNavigate()
	const { theme, setTheme } = useThemeMode()
	const [workspace, setWorkspace] = useState(null)
	const [profile, setProfile] = useState(EMPTY_PROFILE)
	const [signature, setSignature] = useState("")
	const [busy, setBusy] = useState("")
	const [identityKind, setIdentityKind] = useState("student_id")
	const [showCurrentAddress, setShowCurrentAddress] = useState(false)

	const load = useCallback(async () => {
		try {
			const result = await getStudentProfileWorkspace()
			setWorkspace(result)
			setProfile({ ...EMPTY_PROFILE, ...(result.draft || {}), permanentAddress: { ...EMPTY_ADDRESS, ...(result.draft?.permanentAddress || {}) }, currentAddress: { ...EMPTY_ADDRESS, ...(result.draft?.currentAddress || {}) } })
			setShowCurrentAddress(Boolean(Object.values(result.draft?.currentAddress || {}).some(Boolean)))
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
	const profileCompleteness = useMemo(() => {
		const required = ["fname", "lname", "email", "cpNumber", "birthDate", "guardianName", "guardianContact", "course", "year", "section"]
		const addressFields = ["street", "barangay", "city", "province", "postalCode"]
		const completed = required.filter((key) => String(profile[key] || "").trim()).length + addressFields.filter((key) => String(profile.permanentAddress?.[key] || "").trim()).length
		return { completed, total: required.length + addressFields.length, percent: Math.round((completed / (required.length + addressFields.length)) * 100) }
	}, [profile])

	const update = (key, value) => setProfile((current) => ({ ...current, [key]: value }))
	const saveDraft = async () => {
		if (profile.cpNumber && !isValidContactNumber(profile.cpNumber)) return toast.error(CONTACT_NUMBER_RULE_MESSAGE)
		setBusy("save")
		try {
			const normalized = { ...profile, cpNumber: profile.cpNumber ? normalizeContactNumber(profile.cpNumber) : "", currentAddress: showCurrentAddress ? profile.currentAddress : EMPTY_ADDRESS }
			await saveStudentProfileDraft(normalized)
			setProfile(normalized)
			toast.success("Profile draft saved.")
			await load()
		} catch (error) {
			toast.error(error.message || "Unable to save the draft.")
		} finally { setBusy("") }
	}
	const submitProfile = async () => {
		if (!signature) return toast.error("Draw or upload your signature before submitting.")
		setBusy("submit")
		try {
			await saveStudentProfileDraft({ ...profile, currentAddress: showCurrentAddress ? profile.currentAddress : EMPTY_ADDRESS })
			await submitStudentProfile(signature)
			setSignature("")
			toast.success("Profile submitted for review.")
			await load()
		} catch (error) {
			const fields = error.data?.detail?.fields
			toast.error(fields?.length ? `Complete: ${fields.join(", ")}` : error.message || "Unable to submit the profile.")
		} finally { setBusy("") }
	}
	const previewDraft = async () => {
		setBusy("preview")
		try {
			const blob = await previewStudentProfileDraft({ ...profile, currentAddress: showCurrentAddress ? profile.currentAddress : EMPTY_ADDRESS })
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

	if (!workspace) return <div className="student-profile-loading">Loading profile workspace...</div>
	const user = workspace.student || profile
	const requirements = workspace.requirements || {}

	return (
		<div className={`student-portal student-dashboard student-portal-view student-profile-workspace ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
			<StudentTopbar user={user} theme={theme} setTheme={setTheme} />
			<main className="student-shell">
				<div className="student-profile-page-head">
					<button type="button" data-button-variant="neutral" onClick={() => navigate("/student-dashboard")}><HiOutlineArrowLeft /> Back to Dashboard</button>
					<div><span>Student records</span><h1>Profile and document verification</h1><p>Save your information as a draft, then submit one signed revision for staff review.</p></div>
					<span className="student-profile-cycle">{workspace.academicCycle}</span>
				</div>

				<section className="student-profile-editor" id="application-profile">
					<header><div className="student-profile-editor-title">{profile.profileImageUrl ? <img src={profile.profileImageUrl} alt={`${profile.fname || "Student"} profile`} /> : <span className="student-profile-photo-fallback" aria-hidden>{`${profile.fname?.[0] || ""}${profile.lname?.[0] || ""}` || "ST"}</span>}<div><h2>Student Application Profile</h2><p>Your approved revision can be reused by scholarship applications in this academic cycle.</p></div></div><span className={`student-review-status student-review-status--${workspace.verification?.profile?.status || "missing"}`}>{statusLabel(workspace.verification?.profile)}</span></header>
					<div className="student-profile-completeness"><div><strong>Required information</strong><span>{profileCompleteness.completed} of {profileCompleteness.total} complete</span></div><progress value={profileCompleteness.completed} max={profileCompleteness.total}>{profileCompleteness.percent}%</progress></div>
					<div className="student-profile-form-grid student-profile-form-grid--new">
						<label>First Name *<input value={profile.fname} onChange={(event) => update("fname", event.target.value)} /></label>
						<label>Middle Name<input value={profile.mname} onChange={(event) => update("mname", event.target.value)} /></label>
						<label>Last Name *<input value={profile.lname} onChange={(event) => update("lname", event.target.value)} /></label>
						<label>Extension<input value={profile.extension} onChange={(event) => update("extension", event.target.value)} placeholder="Jr., III" /></label>
						<label>Email *<input type="email" value={profile.email} onChange={(event) => update("email", event.target.value)} /></label>
						<label>Contact Number *<input value={profile.cpNumber} onChange={(event) => update("cpNumber", sanitizeContactNumber(event.target.value))} inputMode="numeric" maxLength={11} /></label>
						<label>Date of Birth *<input type="date" value={profile.birthDate} onChange={(event) => update("birthDate", event.target.value)} /></label>
						<label>College<input value={profile.college} onChange={(event) => update("college", event.target.value)} /></label>
						<label className="student-profile-wide">Course *<input value={profile.course} onChange={(event) => update("course", event.target.value)} /></label>
						<label>Major<input value={profile.major} onChange={(event) => update("major", event.target.value)} /></label>
						<label>Year Level *<select value={profile.year} onChange={(event) => update("year", event.target.value)}><option value="">Select year</option>{[1,2,3,4,5].map((year) => <option key={year} value={String(year)}>Year {year}</option>)}</select></label>
						<label>Section *<input value={profile.section} onChange={(event) => update("section", event.target.value)} /></label>
						<label>Legal Guardian *<input value={profile.guardianName} onChange={(event) => update("guardianName", event.target.value)} /></label>
						<label>Guardian Contact *<input value={profile.guardianContact} onChange={(event) => update("guardianContact", sanitizeContactNumber(event.target.value))} inputMode="numeric" maxLength={11} /></label>
					</div>
					<AddressFields title="Permanent Address" required value={profile.permanentAddress} onChange={(value) => update("permanentAddress", value)} />
					<label className="student-profile-address-toggle"><input type="checkbox" checked={showCurrentAddress} onChange={(event) => setShowCurrentAddress(event.target.checked)} /> Add a different current address</label>
					{showCurrentAddress ? <AddressFields title="Current Address (optional)" value={profile.currentAddress} onChange={(value) => update("currentAddress", value)} /> : null}
					<div className="student-profile-attestation"><h3>Applicant signature</h3><p>I attest that the information supplied in this profile is true and complete.</p><SignaturePad value={signature} onChange={setSignature} /></div>
					<div className="student-profile-editor-actions">
						<button type="button" data-button-variant="neutral" disabled={Boolean(busy)} onClick={saveDraft}><HiOutlineSave /> {busy === "save" ? "Saving..." : "Save Draft"}</button>
						<button type="button" data-button-variant="neutral" disabled={Boolean(busy)} onClick={previewDraft}><HiOutlineEye /> {busy === "preview" ? "Preparing..." : "Preview"}</button>
						<button type="button" data-button-variant="positive" disabled={Boolean(busy)} onClick={submitProfile}><HiOutlineCheckCircle /> {busy === "submit" ? "Submitting..." : "Submit for Review"}</button>
						{latestSubmissions.profile ? <button type="button" data-button-variant="none" onClick={() => preview(latestSubmissions.profile)}><HiOutlineEye /> Preview latest submission</button> : null}
					</div>
					{workspace.verification?.profile?.reason ? <p className="student-profile-rejection"><HiOutlineXCircle /> {workspace.verification.profile.reason}</p> : null}
					{Object.keys(workspace.verification?.profile?.fieldErrors || {}).length ? <ul className="student-profile-field-errors">{Object.entries(workspace.verification.profile.fieldErrors).map(([field, message]) => <li key={field}><strong>{field}:</strong> {message}</li>)}</ul> : null}
				</section>

				<section className="student-verification-documents">
					<header><div><h2>Required Documents</h2><p>Uploads stay pending until an authorized reviewer approves the exact version.</p></div></header>
					<div className="student-document-review-grid">
						<article id="cor"><HiOutlineDocumentText /><div><h3>Certificate of Registration</h3><p>Upload your university-issued Certificate of Registration generated by the university portal for the current academic cycle.</p><strong>{statusLabel(workspace.verification?.cor)}</strong>{workspace.verification?.cor?.reason ? <small>{workspace.verification.cor.reason}</small> : null}</div><div className="student-document-actions">{latestSubmissions.cor ? <button type="button" data-button-variant="none" onClick={() => preview(latestSubmissions.cor)}><HiOutlineEye /> View</button> : null}<label><HiOutlineUpload /> {busy === "cor" ? "Uploading..." : "Upload PDF"}<input type="file" accept="application/pdf" disabled={Boolean(busy)} onChange={(event) => uploadDocument("cor", event.target.files?.[0])} /></label></div></article>
						<article id="rog" className={!requirements.rogRequired ? "student-document-review-card--optional" : ""}><HiOutlineDocumentText /><div><h3>Report of Grades</h3><p>{requirements.rogRequired ? "Upload your Report of Grades from the immediately previous semester." : "ROG is not required because you are a first-year, first-semester student."}</p><strong>{statusLabel(workspace.verification?.rog)}</strong>{workspace.verification?.rog?.reason ? <small>{workspace.verification.rog.reason}</small> : null}</div>{requirements.rogRequired ? <div className="student-document-actions">{latestSubmissions.rog ? <button type="button" data-button-variant="none" onClick={() => preview(latestSubmissions.rog)}><HiOutlineEye /> View</button> : null}<label><HiOutlineUpload /> {busy === "rog" ? "Uploading..." : "Upload PDF"}<input type="file" accept="application/pdf" disabled={Boolean(busy)} onChange={(event) => uploadDocument("rog", event.target.files?.[0])} /></label></div> : <HiOutlineCheckCircle className="student-document-exempt-icon" />}</article>
						<article id="identity"><HiOutlineDocumentText /><div><h3>Identity Document</h3><p>{requirements.identityRule === "alternative_photo_id_allowed" ? "First-year students may use a Student ID, previous-school photo ID, or government photo ID." : "Second-year and higher students must submit their Student ID."}</p><strong>{statusLabel(workspace.verification?.identity)}</strong>{workspace.verification?.identity?.reason ? <small>{workspace.verification.identity.reason}</small> : null}</div><div className="student-document-actions"><select value={identityKind} onChange={(event) => setIdentityKind(event.target.value)}><option value="student_id">Student ID</option>{requirements.identityRule === "alternative_photo_id_allowed" ? <><option value="previous_school_id">Previous-school ID</option><option value="government_id">Government ID</option></> : null}</select>{latestSubmissions.identity ? <button type="button" data-button-variant="none" onClick={() => preview(latestSubmissions.identity)}><HiOutlineEye /> View</button> : null}<label><HiOutlineUpload /> {busy === "identity" ? "Uploading..." : "Upload file"}<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={Boolean(busy)} onChange={(event) => uploadDocument("identity", event.target.files?.[0], identityKind)} /></label></div></article>
					</div>
				</section>

				<section className="student-profile-version-history"><h2>Submitted Profile Revisions</h2>{workspace.revisions?.length ? <div>{workspace.revisions.map((revision) => <article key={revision.id}><span>Version {revision.version}</span><strong className={`student-review-status student-review-status--${revision.status}`}>{statusLabel(revision)}</strong><small>{revision.submittedAt ? new Date(revision.submittedAt).toLocaleString() : ""}</small>{revision.rejectionReason ? <p>{revision.rejectionReason}</p> : null}</article>)}</div> : <p>No profile revision has been submitted yet.</p>}</section>
				<StudentFooter description="Manage your student profile and verification records." />
			</main>
		</div>
	)
}
