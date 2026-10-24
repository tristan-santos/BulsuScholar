import { HiOutlineCheckCircle, HiOutlineExclamation } from "react-icons/hi"

export default function RosterConflictReview({ conflicts, busy, reasons, onReasonChange, onResolve }) {
	if (!conflicts.length) return null
	return <section className="admin-scholar-conflicts" aria-label="Roster conflicts requiring verification">
		<header>
			<HiOutlineExclamation aria-hidden="true" />
			<div><h4>Roster conflicts requiring verification</h4><p>Verify identity and award records before resolving a conflict.</p></div>
		</header>
		{conflicts.map((conflict) => {
			const reason = reasons[conflict.id] || ""
			const disabled = Boolean(busy) || reason.trim().length < 10
			return <article key={conflict.id} className="admin-scholar-conflict-row" aria-busy={busy === conflict.id}>
				<div><strong>{conflict.fullName || conflict.studentId || "Student"}</strong><span>{conflict.studentId} | {conflict.academicCycle}</span><span>{conflict.reason}</span></div>
				<label className="admin-roster-resolution-reason"><span>Verification reason</span><textarea value={reason} onChange={(event) => onReasonChange(conflict.id, event.target.value)} minLength={10} maxLength={2000} rows={2} placeholder="Record the identity and award verification performed" disabled={Boolean(busy)} /></label>
				<div className="admin-scholar-conflict-actions">
					{conflict.protectedAward ? <button type="button" data-button-variant="positive" disabled={disabled} onClick={() => onResolve(conflict, "keep_current")}><HiOutlineCheckCircle /> Keep Current Award</button> : <>
						{conflict.candidate?.scholarshipTitle ? <button type="button" data-button-variant="positive" disabled={disabled} onClick={() => onResolve(conflict, "candidate")}><HiOutlineCheckCircle /> Select {conflict.candidate.scholarshipTitle}</button> : null}
						{(conflict.activeRosterOptions || []).map((option) => <button key={option.rosterId} type="button" data-button-variant="neutral" disabled={disabled} onClick={() => onResolve(conflict, "existing", option.rosterId)}><HiOutlineCheckCircle /> Keep {option.scholarshipTitle}</button>)}
					</>}
				</div>
			</article>
		})}
	</section>
}
