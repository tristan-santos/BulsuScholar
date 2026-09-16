import { useEffect, useMemo, useState } from "react"
import { HiOutlineAcademicCap, HiOutlineExclamation, HiX } from "react-icons/hi"
import { toast } from "react-toastify"
import { db, doc, onSnapshot } from "../services/supabaseDataService"
import { resolveRosterScholarshipWorkflow } from "../services/workflowService"
import { closeFromModalBackdrop } from "../services/modalLayerService"

function matchKey(match = {}) {
	return `${match.grantorId || ""}:${match.rosterId || ""}`
}

export default function StudentRosterDecisionGate({ children }) {
	const studentId = sessionStorage.getItem("bulsuscholar_userId") || ""
	const userType = sessionStorage.getItem("bulsuscholar_userType") || ""
	const [student, setStudent] = useState(null)
	const [dismissed, setDismissed] = useState(false)
	const [selectedKey, setSelectedKey] = useState("")
	const [confirmAction, setConfirmAction] = useState("")
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		if (!studentId || userType !== "student") return undefined
		return onSnapshot(doc(db, "students", studentId), (snapshot) => {
			setStudent(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null)
		})
	}, [studentId, userType])

	const choice = student?.rosterScholarshipChoice || {}
	const matches = useMemo(() => Array.isArray(choice.matches) ? choice.matches : [], [choice.matches])
	const pending = student?.rosterDecisionPending === true && choice.status === "pending" && matches.length > 0
	const selected = matches.find((match) => matchKey(match) === selectedKey) || matches[0] || null

	useEffect(() => {
		if (matches.length > 0 && !matches.some((match) => matchKey(match) === selectedKey)) {
			setSelectedKey(matchKey(matches[0]))
		}
	}, [matches, selectedKey])

	const submitDecision = async () => {
		if (!selected || !confirmAction || busy) return
		setBusy(true)
		try {
			const result = await resolveRosterScholarshipWorkflow({
				actorType: "student",
				actorId: studentId,
				studentId,
				grantorId: selected.grantorId,
				rosterId: selected.rosterId,
				action: confirmAction,
				confirmed: true,
			})
			if (result.student) setStudent({ id: studentId, ...result.student })
			setConfirmAction("")
			setDismissed(false)
			toast.success(confirmAction === "confirm" ? "Scholarship record confirmed." : "Roster record disputed and sent for review.")
		} catch (error) {
			toast.error(error?.message || "Unable to save your roster decision.")
		} finally {
			setBusy(false)
		}
	}

	return (
		<>
			{children}
			{pending && dismissed ? (
				<div className="student-roster-persistent" role="status">
					<HiOutlineExclamation aria-hidden />
					<span>Resolve your listed scholarship record before using scholarship features.</span>
					<button type="button" onClick={() => setDismissed(false)}>Review Record</button>
				</div>
			) : null}
			{pending && !dismissed ? (
				<div className="modal-overlay student-roster-modal-layer" onMouseDown={(event) => closeFromModalBackdrop(event, () => setDismissed(true))}>
					<section className="admin-confirmation-modal student-roster-modal" role="dialog" aria-modal="true" aria-labelledby="roster-decision-title" onMouseDown={(event) => event.stopPropagation()}>
						<button type="button" className="admin-modal-close" aria-label="Close" onClick={() => setDismissed(true)}><HiX /></button>
						<div className="student-roster-modal-icon"><HiOutlineAcademicCap aria-hidden /></div>
						<h2 id="roster-decision-title">Confirm Your Scholarship Record</h2>
						<p>Your account matches the scholarship roster record{matches.length === 1 ? "" : "s"} below. Confirming one record makes it your active scholarship commitment and prevents applications to other scholarships.</p>
						<div className="student-roster-options" role="radiogroup" aria-label="Matched scholarship records">
							{matches.map((match) => (
								<label key={matchKey(match)} className={selectedKey === matchKey(match) ? "is-selected" : ""}>
									<input type="radio" name="roster-record" value={matchKey(match)} checked={selectedKey === matchKey(match)} onChange={() => setSelectedKey(matchKey(match))} />
									<span><strong>{match.scholarshipName || "Scholarship"}</strong><small>{match.grantorName || "Grantor"}</small></span>
								</label>
							))}
						</div>
						<div className="admin-confirmation-actions">
							<button type="button" className="admin-confirmation-cancel" disabled={busy} onClick={() => setConfirmAction("decline")}>This Is Not My Record</button>
							<button type="button" className="admin-confirmation-confirm" disabled={busy || !selected} onClick={() => setConfirmAction("confirm")}>Confirm Record</button>
						</div>
					</section>
				</div>
			) : null}
			{pending && confirmAction ? (
				<div className="modal-overlay modal-overlay--nested" onMouseDown={(event) => closeFromModalBackdrop(event, () => setConfirmAction(""))}>
					<section className="admin-confirmation-modal" role="alertdialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
						<h2>{confirmAction === "confirm" ? "Confirm Scholarship Record" : "Dispute Scholarship Record"}</h2>
						<p>{confirmAction === "confirm"
							? `Confirm that ${selected?.scholarshipName || "this scholarship"} from ${selected?.grantorName || "this grantor"} belongs to you? This becomes your locked active scholarship.`
							: "Confirm that this record does not belong to you? It will be archived as disputed history and sent to the administrator and grantor for review."}</p>
						<div className="admin-confirmation-actions">
							<button type="button" className="admin-confirmation-cancel" data-button-variant="neutral" disabled={busy} onClick={() => setConfirmAction("")}>Cancel</button>
							<button type="button" className={confirmAction === "decline" ? "admin-confirmation-danger" : "admin-confirmation-confirm"} data-button-variant={confirmAction === "decline" ? "danger" : "positive"} disabled={busy} onClick={submitDecision}>{busy ? "Saving..." : "Confirm"}</button>
						</div>
					</section>
				</div>
			) : null}
		</>
	)
}
