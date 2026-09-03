import { useEffect, useMemo, useState } from "react"
import { toast } from "react-toastify"
import {
	HiOutlineCheck,
	HiOutlineClock,
	HiOutlineDocumentText,
	HiOutlineEye,
	HiOutlineX,
} from "react-icons/hi"
import { listPriorityRecords, reviewLeaveRequest } from "../services/priorityOneService"

const LEAVE_TABS = ["pending", "approved", "rejected", "all"]

function formatRequestType(type = "") {
	return type === "loa" ? "Leave of Absence" : "Return to Study"
}

function formatLeaveDate(value) {
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString()
}

export default function AdminLeaveManagement() {
	const [records, setRecords] = useState([])
	const [tab, setTab] = useState("pending")
	const [selected, setSelected] = useState(null)
	const [reason, setReason] = useState("")
	const [saving, setSaving] = useState(false)

	const load = async () => {
		const result = await listPriorityRecords("leave_requests")
		setRecords(result.records || [])
	}

	useEffect(() => {
		load().catch(() => toast.error("LOA records could not be loaded."))
	}, [])

	const rows = useMemo(
		() => records.filter((item) => tab === "all" || item.status === tab),
		[records, tab],
	)

	const closeModal = () => {
		setSelected(null)
		setReason("")
	}

	const decide = async (decision) => {
		if (!selected || saving) return
		setSaving(true)
		try {
			await reviewLeaveRequest({
				requestId: selected.id,
				decision,
				reason,
				actorId: sessionStorage.getItem("bulsuscholar_userId") || "admin",
			})
			toast.success(`Request ${decision}.`)
			closeModal()
			await load()
		} catch (error) {
			toast.error(error.message)
		} finally {
			setSaving(false)
		}
	}

	return (
		<section className="admin-feature-page">
			<header className="admin-feature-header">
				<span><HiOutlineClock /></span>
				<div>
					<h2>Leave and Return Requests</h2>
					<p>Review LOA freezes and returning-student reactivation requests.</p>
				</div>
			</header>

			<div className="admin-feature-stats">
				<div><span>Pending</span><strong>{records.filter((item) => item.status === "pending").length}</strong></div>
				<div><span>Approved</span><strong>{records.filter((item) => item.status === "approved").length}</strong></div>
				<div><span>Rejected</span><strong>{records.filter((item) => item.status === "rejected").length}</strong></div>
			</div>

			<div className="admin-feature-tabs">
				{LEAVE_TABS.map((item) => (
					<button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
						{item}
					</button>
				))}
			</div>

			<div className="admin-feature-table-wrap">
				<table className="admin-feature-table">
					<thead>
						<tr>
							<th>Student ID</th>
							<th>Student Name</th>
							<th>Request</th>
							<th>Reason</th>
							<th>Status</th>
							<th>Submitted</th>
							<th>Action</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((item) => (
							<tr key={item.id}>
								<td>{item.studentId}</td>
								<td>{item.studentName || "-"}</td>
								<td>{formatRequestType(item.requestType)}</td>
								<td title={item.reason}>{item.reason || "-"}</td>
								<td><span className={`leave-status ${item.status}`}>{item.status}</span></td>
								<td>{formatLeaveDate(item.createdAt)}</td>
								<td>
									<button type="button" className="admin-table-view" onClick={() => setSelected(item)}>
										<HiOutlineEye /> View
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{!rows.length ? <div className="portal-empty">No {tab === "all" ? "" : tab} requests.</div> : null}
			</div>

			{selected ? (
				<div className="admin-detail-backdrop admin-leave-review-backdrop" role="presentation" onMouseDown={(event) => {
					if (event.target === event.currentTarget) closeModal()
				}}>
					<div className="admin-detail-shell admin-detail-shell--review admin-leave-review-shell" onMouseDown={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={closeModal} aria-label="Close leave request review">
							<HiOutlineX />
						</button>
						<section className="admin-detail-modal admin-detail-modal--review admin-leave-review-modal" role="dialog" aria-modal="true" aria-label="Leave request review">
							<div className="admin-soe-review-head admin-leave-review-head">
								<span aria-hidden="true"><HiOutlineClock /></span>
								<div>
									<span>{selected.requestType === "loa" ? "Leave Request" : "Return Request"}</span>
									<h3>{selected.studentName || selected.studentId || "Student Request"}</h3>
									<p className="admin-detail-meta">Review the student request details and record your decision.</p>
								</div>
								<span className={`leave-status ${selected.status}`}>{selected.status || "pending"}</span>
							</div>

							<div className="admin-leave-review-grid">
								<p><span>Student ID</span><strong>{selected.studentId || "-"}</strong></p>
								<p><span>Request Type</span><strong>{formatRequestType(selected.requestType)}</strong></p>
								<p><span>Submitted</span><strong>{formatLeaveDate(selected.createdAt)}</strong></p>
								<p><span>Status</span><strong>{selected.status || "-"}</strong></p>
								<p className="admin-leave-review-wide"><span>Reason</span><strong>{selected.reason || "-"}</strong></p>
								{selected.notes ? (
									<p className="admin-leave-review-wide"><span>Student Notes</span><strong>{selected.notes}</strong></p>
								) : null}
							</div>

							<div className="admin-leave-review-document">
								<div>
									<HiOutlineDocumentText aria-hidden="true" />
									<div>
										<strong>Supporting Document</strong>
										<span>{selected.document?.name || "PDF attachment"}</span>
									</div>
								</div>
								{selected.document?.url ? (
									<a href={selected.document.url} target="_blank" rel="noreferrer">View supporting PDF</a>
								) : (
									<span>No document attached</span>
								)}
							</div>

							{selected.status === "pending" ? (
								<>
									<label className="admin-leave-review-decision">
										<span>Decision reason / notes</span>
										<textarea
											value={reason}
											onChange={(event) => setReason(event.target.value)}
											placeholder="Add optional notes for this decision."
											rows={4}
										/>
									</label>
									<footer className="admin-soe-review-actions admin-soe-review-actions--split admin-leave-review-actions">
										<button type="button" className="admin-danger-btn" onClick={() => decide("rejected")} disabled={saving}>
											<HiOutlineX /> Reject
										</button>
										<button type="button" className="admin-safe-btn" onClick={() => decide("approved")} disabled={saving}>
											<HiOutlineCheck /> Approve
										</button>
									</footer>
								</>
							) : null}
						</section>
					</div>
				</div>
			) : null}
		</section>
	)
}
