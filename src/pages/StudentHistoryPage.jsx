import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { HiOutlineArrowLeft, HiOutlineClock, HiOutlineExternalLink } from "react-icons/hi"
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
	const navigate = useNavigate()
	const { theme, setTheme } = useThemeMode()
	const [events, setEvents] = useState([])
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
			<section className="student-announcement-page-hero">
				<div className="student-page-title"><p className="student-bento-eyebrow">Student record</p><h2 className="student-page-heading">History</h2><p className="student-page-sub">Review application, document, scholarship, and academic-cycle activity recorded for your account.</p></div>
				<button type="button" className="student-mini-btn student-mini-btn--secondary" data-button-variant="neutral" onClick={() => navigate("/student-dashboard")}><HiOutlineArrowLeft /> Back to Dashboard</button>
			</section>
			<section className="student-history-panel">
				<div className="student-history-filters">
					<label>Activity<select value={eventType} onChange={(event) => { setEventType(event.target.value); setPage(1) }}>{EVENT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
					<label>Academic cycle<input value={cycle} onChange={(event) => { setCycle(event.target.value); setPage(1) }} placeholder="All cycles" /></label>
				</div>
				{loading ? <p className="dashboard-placeholder">Loading history...</p> : null}
				{error ? <p className="student-history-error" role="alert">{error}</p> : null}
				{!loading && !error && !events.length ? <p className="dashboard-placeholder">No matching history yet.</p> : null}
				<div className="student-history-list">{events.map((event) => <article key={event.id} className="student-history-entry"><span className="student-history-icon"><HiOutlineClock /></span><div><time>{formatDate(event.occurred_at)}</time><h3>{event.description}</h3>{event.academic_cycle ? <p>{event.academic_cycle}</p> : null}</div>{event.route ? <button type="button" data-button-variant="none" onClick={() => navigate(event.route)} aria-label="Open related page" title="Open related page"><HiOutlineExternalLink /></button> : null}</article>)}</div>
				<div className="student-history-pagination"><button type="button" data-button-variant="neutral" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span><button type="button" data-button-variant="neutral" disabled={!hasMore} onClick={() => setPage((value) => value + 1)}>Next</button></div>
			</section>
		</div></main>
	</div>
}
