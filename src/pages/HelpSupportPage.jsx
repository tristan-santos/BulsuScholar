import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "react-toastify"
import {
	HiOutlineBookOpen,
	HiOutlineChatAlt2,
	HiOutlineChevronDown,
	HiOutlineClock,
	HiOutlineDocumentText,
	HiOutlinePaperAirplane,
	HiOutlinePlus,
	HiOutlineRefresh,
	HiOutlineShieldCheck,
	HiOutlineTrash,
	HiOutlineUpload,
	HiOutlineUserCircle,
} from "react-icons/hi"
import { MdSupportAgent } from "react-icons/md"
import PortalInfoHeader from "../components/PortalInfoHeader"
import {
	createSupportTicket,
	deleteSupportTicket,
	getSupportTickets,
	sendSupportTicketMessage,
} from "../services/priorityOneService"
import { confirmLostEmail, createLostEmailTicket, deleteLostEmailTicket, getLostEmailTicket, sendLostEmailMessage, uploadLostEmailAttachment } from "../services/securityHistoryService"
import "../css/PortalSupport.css"

const SUPPORT_TOPICS = [
	{ title: "Getting Started", copy: "Account verification, sign-in, and portal access.", category: "account", icon: HiOutlineBookOpen },
	{ title: "Documents & Applications", copy: "COR, ROG, uploads, and scholarship applications.", category: "documents", icon: HiOutlineDocumentText },
	{ title: "Account & Security", copy: "Password requests, account access, and profile details.", category: "account", icon: HiOutlineUserCircle },
]

const SUPPORT_FAQS = [
	{ question: "Why can I not apply for another scholarship?", answer: "You may apply to multiple eligible grantors before commitment. Requesting materials commits you to one scholarship and closes competing applications. A grantor-specific cooldown, archive restriction, full offering, or eligibility rule may still block an application." },
	{ question: "What files can I upload for COR and ROG?", answer: "Student signup accepts PDF documents. The COR must be a current Certificate of Registration or Advising Slip, while the ROG must be the required previous-cycle Report of Grades." },
	{ question: "Where can I check my application progress?", answer: "Open Scholarships from the student menu. Your current application, required action, documents, and completed stages appear in the Scholarship Control Center." },
	{ question: "How do I request a password change?", answer: "Students can use Forgot Password on the login page. Grantors request a password change from their profile and can change it after an administrator approves the request." },
	{ question: "How will I receive a support reply?", answer: "Open this Help and Support page and select your ticket. Root support replies appear directly in the conversation, so no reply email is required." },
]

function formatDate(value) {
	if (!value) return ""
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export default function HelpSupportPage() {
	const [tickets, setTickets] = useState([])
	const [selectedId, setSelectedId] = useState("")
	const [draft, setDraft] = useState({ category: "general", subject: "", reason: "" })
	const [message, setMessage] = useState("")
	const [loading, setLoading] = useState(false)
	const [sending, setSending] = useState(false)
	const [confirmDelete, setConfirmDelete] = useState(false)
	const [recoveryDraft, setRecoveryDraft] = useState({ userId: "", reason: "" })
	const [recoveryTicket, setRecoveryTicket] = useState(null)
	const [recoverySecret, setRecoverySecret] = useState("")
	const [recoveryMessage, setRecoveryMessage] = useState("")
	const [recoveryCode, setRecoveryCode] = useState("")
	const threadEndRef = useRef(null)
	const formRef = useRef(null)
	const userId = sessionStorage.getItem("bulsuscholar_userId") || ""
	const userType = sessionStorage.getItem("bulsuscholar_userType") || ""
	const isAuthenticated = Boolean(userId) && ["student", "grantor", "admin", "provider"].includes(userType)
	const selectedTicket = useMemo(() => tickets.find((ticket) => ticket.id === selectedId || ticket.ticketId === selectedId) || null, [selectedId, tickets])

	useEffect(() => {
		if (isAuthenticated) return
		const query = new URLSearchParams(window.location.search)
		const ticketId = query.get("recovery") || ""
		const secret = query.get("secret") || ""
		if (!ticketId || !secret) return
		setRecoverySecret(secret)
		getLostEmailTicket(ticketId, secret).then((result) => setRecoveryTicket(result.ticket)).catch(() => toast.error("This recovery link is invalid or expired."))
	}, [isAuthenticated])

	const refreshTickets = useCallback(async ({ quiet = false } = {}) => {
		if (!isAuthenticated) return
		if (!quiet) setLoading(true)
		try {
			const result = await getSupportTickets()
			const nextTickets = result.tickets || []
			setTickets(nextTickets)
			setSelectedId((current) => nextTickets.some((ticket) => ticket.id === current || ticket.ticketId === current) ? current : nextTickets[0]?.id || "")
		} catch (error) {
			if (!quiet) toast.error(error.message || "Support tickets could not be loaded.")
		} finally {
			if (!quiet) setLoading(false)
		}
	}, [isAuthenticated])

	useEffect(() => {
		refreshTickets()
		if (!isAuthenticated) return undefined
		const timer = window.setInterval(() => refreshTickets({ quiet: true }), 15000)
		return () => window.clearInterval(timer)
	}, [isAuthenticated, refreshTickets])

	useEffect(() => {
		threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
	}, [selectedTicket?.messages?.length])

	const createTicket = async (event) => {
		event.preventDefault()
		if (!isAuthenticated) return toast.info("Sign in to create and track a support ticket.")
		if (!draft.subject.trim() || !draft.reason.trim()) return toast.info("Enter a subject and describe your concern.")
		setSending(true)
		try {
			const result = await createSupportTicket(draft)
			const ticket = result.ticket
			setTickets((current) => [ticket, ...current])
			setSelectedId(ticket.id)
			setDraft({ category: "general", subject: "", reason: "" })
			toast.success(`Support ticket ${ticket.ticketId} was created.`)
		} catch (error) {
			toast.error(error.message || "Support ticket could not be created.")
		} finally {
			setSending(false)
		}
	}

	const sendMessage = async (event) => {
		event.preventDefault()
		const body = message.trim()
		if (!selectedTicket || !body || sending) return
		setSending(true)
		try {
			const result = await sendSupportTicketMessage(selectedTicket.id, body)
			setTickets((current) => current.map((ticket) => ticket.id === result.ticket.id ? result.ticket : ticket))
			setMessage("")
		} catch (error) {
			toast.error(error.message || "Message could not be sent.")
		} finally {
			setSending(false)
		}
	}

	const removeTicket = async () => {
		if (!selectedTicket) return
		setSending(true)
		try {
			await deleteSupportTicket(selectedTicket.id)
			setTickets((current) => current.filter((ticket) => ticket.id !== selectedTicket.id))
			setSelectedId("")
			setConfirmDelete(false)
			toast.success("Support ticket deleted.")
		} catch (error) {
			toast.error(error.message || "Support ticket could not be deleted.")
		} finally {
			setSending(false)
		}
	}

	const chooseTopic = (topic) => {
		setDraft((current) => ({ ...current, category: topic.category, subject: topic.title }))
		formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
	}

	const createRecovery = async (event) => {
		event.preventDefault()
		if (!recoveryDraft.userId.trim() || !recoveryDraft.reason.trim()) return
		setSending(true)
		try {
			const result = await createLostEmailTicket(recoveryDraft.userId, recoveryDraft.reason)
			const link = new URL(result.accessUrl)
			setRecoverySecret(link.searchParams.get("secret") || "")
			setRecoveryTicket(result.ticket)
			window.history.replaceState({}, "", `${link.pathname}${link.search}`)
			toast.success(`Recovery ticket ${result.ticketId} was created. Keep this page link private.`)
		} catch (error) { toast.error(error.message || "Recovery ticket could not be created.") } finally { setSending(false) }
	}

	const refreshRecovery = async () => {
		if (!recoveryTicket || !recoverySecret) return
		const result = await getLostEmailTicket(recoveryTicket.id, recoverySecret)
		setRecoveryTicket(result.ticket)
	}

	const sendRecoveryMessage = async (event) => {
		event.preventDefault()
		if (!recoveryMessage.trim()) return
		setSending(true)
		try { const result = await sendLostEmailMessage(recoveryTicket.id, recoverySecret, recoveryMessage); setRecoveryTicket(result.ticket); setRecoveryMessage("") } catch (error) { toast.error(error.message) } finally { setSending(false) }
	}

	const uploadRecoveryFile = async (file) => {
		if (!file) return
		setSending(true)
		try { await uploadLostEmailAttachment(recoveryTicket.id, recoverySecret, file); await refreshRecovery(); toast.success("Evidence attached privately.") } catch (error) { toast.error(error.message) } finally { setSending(false) }
	}

	const submitRecoveryCode = async (event) => {
		event.preventDefault()
		setSending(true)
		try { await confirmLostEmail(recoveryTicket.id, recoverySecret, recoveryCode); await refreshRecovery(); toast.success("Email access restored. You can now sign in.") } catch (error) { toast.error(error.message) } finally { setSending(false) }
	}

	const removeRecoveryTicket = async () => {
		if (!recoveryTicket || !window.confirm("Delete this recovery conversation and its attachments?")) return
		setSending(true)
		try {
			await deleteLostEmailTicket(recoveryTicket.id, recoverySecret)
			setRecoveryTicket(null)
			setRecoverySecret("")
			window.history.replaceState({}, "", "/help")
			toast.success("Recovery conversation deleted.")
		} catch (error) { toast.error(error.message) } finally { setSending(false) }
	}

	return <div className="portal-support-page"><PortalInfoHeader /><main className="portal-support-main support-center-main">
		<section className="support-center-hero" aria-labelledby="support-page-title">
			<div className="support-center-hero-icon"><MdSupportAgent aria-hidden /></div>
			<span>Help &amp; Support</span>
			<h1 id="support-page-title">How can we help?</h1>
			<p>Review common guidance or open a secure support ticket. Replies stay in one conversation between you and root support.</p>
		</section>

		<section className="support-topic-grid" aria-label="Support topics">
			{SUPPORT_TOPICS.map((topic) => {
				const Icon = topic.icon
				return <article className="support-topic-card" key={topic.title}><span><Icon aria-hidden /></span><h2>{topic.title}</h2><p>{topic.copy}</p><button type="button" onClick={() => chooseTopic(topic)}>Create ticket</button></article>
			})}
		</section>

		{!isAuthenticated ? <section className="support-recovery-workspace" aria-labelledby="lost-email-title">
			<header><span>Signed-out recovery</span><h2 id="lost-email-title">Lost email access</h2><p>Create a private conversation with root support. Do not include your password.</p></header>
			{!recoveryTicket ? <form onSubmit={createRecovery}><label>User ID<input value={recoveryDraft.userId} onChange={(event) => setRecoveryDraft((current) => ({ ...current, userId: event.target.value }))} required /></label><label>Reason<textarea value={recoveryDraft.reason} onChange={(event) => setRecoveryDraft((current) => ({ ...current, reason: event.target.value }))} maxLength={4000} required placeholder="Explain why you cannot access the registered email." /></label><button type="submit" data-button-variant="positive" disabled={sending}>Create Recovery Ticket</button></form> : <div className="support-recovery-thread"><div className="support-recovery-ticket-head"><div><strong>{recoveryTicket.ticketId}</strong><span>{String(recoveryTicket.status).replaceAll("_", " ")}</span></div><div><button type="button" data-button-variant="neutral" onClick={refreshRecovery} disabled={sending}><HiOutlineRefresh /> Refresh</button><button type="button" data-button-variant="danger" onClick={removeRecoveryTicket} disabled={sending} aria-label="Delete recovery ticket" title="Delete recovery ticket"><HiOutlineTrash /></button></div></div><div className="support-ticket-messages">{(recoveryTicket.messages || []).map((item) => <article key={item.id || `${item.created_at}-${item.body}`} className={item.sender_type === "root" ? "root" : "user"}><div><strong>{item.sender_type === "root" ? "Root Support" : "You"}</strong><time>{formatDate(item.created_at)}</time></div><p>{item.body}</p></article>)}</div><div className="support-recovery-attachments">{(recoveryTicket.attachments || []).map((item) => <span key={item.id}><HiOutlineDocumentText /> {item.file_name}</span>)}</div>{!["resolved", "rejected", "deleted"].includes(recoveryTicket.status) ? <><form className="support-ticket-composer" onSubmit={sendRecoveryMessage}><textarea value={recoveryMessage} onChange={(event) => setRecoveryMessage(event.target.value)} maxLength={4000} placeholder="Add information for root support..." /><button type="submit" data-button-variant="positive" disabled={sending || !recoveryMessage.trim()}><HiOutlinePaperAirplane /> Send</button></form><label className="support-recovery-upload"><HiOutlineUpload /> Attach evidence<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={sending || (recoveryTicket.attachments || []).length >= 5} onChange={(event) => uploadRecoveryFile(event.target.files?.[0])} /></label></> : null}{recoveryTicket.status === "awaiting_email_confirmation" ? <form className="support-recovery-confirm" onSubmit={submitRecoveryCode}><label>Code sent to the proposed email<input inputMode="numeric" maxLength={6} value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label><button type="submit" data-button-variant="positive" disabled={sending || recoveryCode.length !== 6}>Confirm New Email</button></form> : null}</div>}
		</section> : null}

		<section className="support-ticket-workspace" aria-label="Support ticket conversations">
			<aside className="support-ticket-sidebar">
				<header><div><span>My Tickets</span><h2>Support conversations</h2></div><button type="button" data-button-variant="none" onClick={() => refreshTickets()} aria-label="Refresh tickets" title="Refresh tickets"><HiOutlineRefresh /></button></header>
				{!isAuthenticated ? <div className="support-ticket-auth"><HiOutlineShieldCheck /><strong>Sign in required</strong><p>Sign in to create a private ticket and continue the conversation with root support.</p></div> : null}
				<div className="support-ticket-list">
					{tickets.map((ticket) => <button type="button" data-button-variant="none" className={selectedTicket?.id === ticket.id ? "active" : ""} key={ticket.id} onClick={() => { setSelectedId(ticket.id); setConfirmDelete(false) }}><span className={`support-ticket-status support-ticket-status--${ticket.status}`}>{String(ticket.status || "open").replaceAll("_", " ")}</span><strong>{ticket.subject}</strong><small>{ticket.ticketId} | {formatDate(ticket.lastMessageAt || ticket.createdAt)}</small></button>)}
					{isAuthenticated && !loading && tickets.length === 0 ? <p className="support-ticket-empty">No support tickets yet.</p> : null}
				</div>
				<form ref={formRef} className="support-ticket-create" onSubmit={createTicket}>
					<header><HiOutlinePlus /><strong>New support ticket</strong></header>
					<label>Category<select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}><option value="general">General support</option><option value="account">Account access</option><option value="documents">Documents</option><option value="scholarship">Scholarship record</option></select></label>
					<label>Subject<input maxLength={120} value={draft.subject} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} placeholder="Brief summary of the concern" /></label>
					<label>Reason<textarea required maxLength={4000} value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} placeholder="Describe what happened and include the exact error message. Never include your password." /></label>
					<button type="submit" data-button-variant="positive" disabled={!isAuthenticated || sending}><HiOutlinePlus /> Create Ticket</button>
				</form>
			</aside>

			<section className="support-ticket-thread">
				{selectedTicket ? <>
					<header><div><span>{selectedTicket.ticketId}</span><h2>{selectedTicket.subject}</h2><p><HiOutlineClock /> Opened {formatDate(selectedTicket.createdAt)}</p></div><div className="support-ticket-thread-actions"><span className={`support-ticket-status support-ticket-status--${selectedTicket.status}`}>{String(selectedTicket.status || "open").replaceAll("_", " ")}</span>{confirmDelete ? <><button type="button" data-button-variant="neutral" onClick={() => setConfirmDelete(false)}>Keep Ticket</button><button type="button" data-button-variant="danger" onClick={removeTicket} disabled={sending}><HiOutlineTrash /> Confirm Delete</button></> : <button type="button" data-button-variant="danger" onClick={() => setConfirmDelete(true)} aria-label="Delete support ticket" title="Delete support ticket"><HiOutlineTrash /></button>}</div></header>
					<div className="support-ticket-messages" aria-live="polite">
						{(selectedTicket.messages || []).map((item) => <article key={item.id} className={item.senderType === "root" ? "root" : "user"}><div><strong>{item.senderType === "root" ? "Root Support" : "You"}</strong><time>{formatDate(item.createdAt)}</time></div><p>{item.body}</p></article>)}
						<div ref={threadEndRef} />
					</div>
					<form className="support-ticket-composer" onSubmit={sendMessage}><textarea maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a message to root support..." aria-label="Support message" /><button type="submit" data-button-variant="positive" disabled={!message.trim() || sending}><HiOutlinePaperAirplane /> Send</button></form>
				</> : <div className="support-ticket-thread-empty"><HiOutlineChatAlt2 /><strong>Select a ticket</strong><p>Choose an existing ticket or create a new one to start a conversation.</p></div>}
			</section>
		</section>

		<section className="support-faq-section" aria-labelledby="support-faq-title">
			<header><span>Frequently Asked Questions</span><h2 id="support-faq-title">Answers to common concerns</h2><p>Review the most common account, document, and scholarship questions before creating a ticket.</p></header>
			<div className="support-faq-list">{SUPPORT_FAQS.map((faq, index) => <details key={faq.question} open={index === 0}><summary>{faq.question}<HiOutlineChevronDown aria-hidden /></summary><p>{faq.answer}</p></details>)}</div>
		</section>
	</main></div>
}
