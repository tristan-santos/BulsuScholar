import { Fragment, useEffect, useState } from "react"
import { HiOutlineChevronDown, HiOutlineChevronUp, HiOutlineEye } from "react-icons/hi"
import StudentTopbar from "../components/StudentTopbar"
import useThemeMode from "../hooks/useThemeMode"
import { listStudentHistory } from "../services/securityHistoryService"
import "../css/StudentDashboard.css"
import "../css/StudentPortalRefresh.css"

const EVENT_OPTIONS = [
	["", "All activity"],
	["application_created", "Applications"],
	["document_approved", "Approved documents"],
	["document_rejected", "Document corrections"],
	["signed_soe_submitted", "Signed SOE"],
	["signed_soe_reopened", "SOE corrections"],
]

function formatDate(value) {
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
}

export default function StudentHistoryPage() {
	const { theme, setTheme } = useThemeMode()
	const [events, setEvents] = useState([])
	const [cycles, setCycles] = useState([])
	const [expandedId, setExpandedId] = useState("")
	const [page, setPage] = useState(1)
	const [hasMore, setHasMore] = useState(false)
	const [eventType, setEventType] = useState("")
	const [cycle, setCycle] = useState("")
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState("")

	useEffect(() => {
		let active = true
		Promise.resolve().then(() => {
			if (active) setLoading(true)
			return listStudentHistory({ page, eventType, cycle })
		}).then((result) => {
			if (!active) return
			setEvents(result.events || [])
			setCycles(result.cycles || [])
			setHasMore(result.hasMore === true)
			setError("")
		}).catch((reason) => {
			if (active) setError(reason?.message || "History could not be loaded.")
		}).finally(() => { if (active) setLoading(false) })
		return () => { active = false }
	}, [cycle, eventType, page])

	return <div className={`student-portal student-dashboard student-portal-view ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
		<StudentTopbar user={{}} theme={theme} setTheme={setTheme} />
		<main className="student-shell"><div className="student-shell-content student-dashboard-surface">
			<section className="student-announcement-page-hero student-history-hero">
				<div className="student-page-title"><p className="student-bento-eyebrow">Student record</p><h2 className="student-page-heading">History</h2><p className="student-page-sub">Review application, document, scholarship, and academic-cycle activity recorded for your account.</p></div>
			</section>
			<section className="student-history-panel">
				<div className="student-history-filters">
					<label>Activity<select value={eventType} onChange={(event) => { setEventType(event.target.value); setPage(1) }}>{EVENT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
					<label>Academic cycle<select value={cycle} onChange={(event) => { setCycle(event.target.value); setPage(1) }}><option value="">All cycles</option>{cycles.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
				</div>
				{loading ? <p className="dashboard-placeholder">Loading history...</p> : null}
				{error ? <p className="student-history-error" role="alert">{error}</p> : null}
				{!loading && !error && !events.length ? <p className="dashboard-placeholder">No matching history yet.</p> : null}
				{!loading && !error && events.length ? <div className="student-history-table-wrap"><table className="student-history-table"><thead><tr><th>Date</th><th>Activity</th><th>Academic Cycle</th><th>Type</th><th>Action</th></tr></thead><tbody>{events.map((event) => {
					const expanded = expandedId === event.id
					const safeDetails = Object.entries(event.safe_data || {}).filter(([, value]) => value !== null && value !== "")
					return <Fragment key={event.id}><tr><td><time>{formatDate(event.occurred_at)}</time></td><td>{event.description}</td><td>{event.academic_cycle || "Not recorded"}</td><td>{String(event.event_type || "activity").replaceAll("_", " ")}</td><td><button type="button" className="student-history-view" data-button-variant="neutral" onClick={() => setExpandedId(expanded ? "" : event.id)} aria-expanded={expanded}><HiOutlineEye /> View {expanded ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}</button></td></tr>{expanded ? <tr className="student-history-detail-row"><td colSpan="5"><div><strong>History details</strong><dl><div><dt>Recorded</dt><dd>{formatDate(event.occurred_at)}</dd></div><div><dt>Record type</dt><dd>{event.related_type || "Activity"}</dd></div>{event.related_id ? <div><dt>Reference</dt><dd>{event.related_id}</dd></div> : null}{safeDetails.map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></div></td></tr> : null}</Fragment>
				})}</tbody></table></div> : null}
				<div className="student-history-pagination"><button type="button" data-button-variant="neutral" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span><button type="button" data-button-variant="neutral" disabled={!hasMore} onClick={() => setPage((value) => value + 1)}>Next</button></div>
			</section>
		</div></main>
	</div>
}
