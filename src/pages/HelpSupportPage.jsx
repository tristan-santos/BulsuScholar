import { useRef, useState } from "react"
import { toast } from "react-toastify"
import {
	HiOutlineBookOpen,
	HiOutlineChatAlt2,
	HiOutlineChevronDown,
	HiOutlineDocumentText,
	HiOutlineMail,
	HiOutlinePaperAirplane,
	HiOutlineSearch,
	HiOutlineShieldCheck,
	HiOutlineUserCircle,
} from "react-icons/hi"
import { MdSupportAgent } from "react-icons/md"
import PortalInfoHeader from "../components/PortalInfoHeader"
import { askHelpAssistant, submitSupportFeedback } from "../services/priorityOneService"
import "../css/PortalSupport.css"

const START = { role: "assistant", text: "Hello. Ask me about BulsuScholar accounts, COR/ROG rules, scholarship applications, SOE, LOA, or common portal errors." }

const SUPPORT_TOPICS = [
	{
		title: "Getting Started",
		copy: "Learn how to create an account, verify your email, and access your portal.",
		prompt: "How do I create and verify my BulsuScholar account?",
		icon: HiOutlineBookOpen,
	},
	{
		title: "Documents & Applications",
		copy: "Get guidance for COR, ROG, document uploads, and scholarship applications.",
		prompt: "What documents do I need and how do I apply for a scholarship?",
		icon: HiOutlineDocumentText,
	},
	{
		title: "Account & Security",
		copy: "Find help for sign-in, password requests, account access, and profile details.",
		prompt: "How do I resolve an account access or password problem?",
		icon: HiOutlineUserCircle,
	},
]

const SUPPORT_FAQS = [
	{
		question: "Why can I not apply for another scholarship?",
		answer: "BulsuScholar prevents overlapping active applications and scholarships. Finish the current application, wait for any rejection cooldown, or contact the Office of the Scholarship if the system reports a conflict.",
	},
	{
		question: "What files can I upload for COR and ROG?",
		answer: "Student signup accepts PDF documents. The COR must be a current Certificate of Registration or Advising Slip, while the ROG must be the required previous-cycle Report of Grades.",
	},
	{
		question: "Where can I check my application progress?",
		answer: "Open Scholarships from the student menu. Your current application, required action, documents, and completed stages appear in the Scholarship Control Center.",
	},
	{
		question: "How do I request a password change?",
		answer: "Students can use Forgot Password on the login page. Grantors request a password change from their profile and can change it after an administrator approves the request.",
	},
	{
		question: "What should I do when the assistant cannot resolve my concern?",
		answer: "Send a support request using the form on this page. Include the affected page, what you attempted, and the exact error message, but never include your password.",
	},
]

export default function HelpSupportPage() {
	const [messages, setMessages] = useState([START])
	const [input, setInput] = useState("")
	const [loading, setLoading] = useState(false)
	const [feedback, setFeedback] = useState({ category: "general", email: "", message: "" })
	const searchInputRef = useRef(null)
	const userId = sessionStorage.getItem("bulsuscholar_userId") || "guest"
	const userType = sessionStorage.getItem("bulsuscholar_userType") || "guest"
	const send = async (event) => {
		event.preventDefault(); const text = input.trim(); if (!text || loading) return
		setMessages((rows) => [...rows, { role: "user", text }]); setInput(""); setLoading(true)
		try { const result = await askHelpAssistant(text); setMessages((rows) => [...rows, { role: "assistant", text: result.answer, fallback: result.needsSupport }]) }
		catch { setMessages((rows) => [...rows, { role: "assistant", text: "The assistant is temporarily unavailable. Review the FAQ or submit a support request below.", fallback: true }]) }
		finally { setLoading(false) }
	}
	const submitFeedback = async (event) => {
		event.preventDefault()
		try { await submitSupportFeedback({ ...feedback, userId, userType }); setFeedback({ category: "general", email: "", message: "" }); toast.success("Your help request was sent to the administrator inbox.") }
		catch (error) { toast.error(error.message || "Support request could not be submitted.") }
	}
	const chooseTopic = (prompt) => {
		setInput(prompt)
		searchInputRef.current?.focus()
	}

	return <div className="portal-support-page"><PortalInfoHeader /><main className="portal-support-main support-center-main">
		<section className="support-center-hero" aria-labelledby="support-page-title">
			<div className="support-center-hero-icon"><MdSupportAgent aria-hidden /></div>
			<span>Help &amp; Support</span>
			<h1 id="support-page-title">Need Assistance?</h1>
			<p>Search for guidance or ask the BulsuScholar assistant about your account, documents, scholarship application, and portal access.</p>
			<form className="support-center-search" onSubmit={send}>
				<label className="support-center-search-field"><HiOutlineSearch aria-hidden /><input ref={searchInputRef} value={input} onChange={(event) => setInput(event.target.value)} maxLength={1200} placeholder="Ask a question about BulsuScholar..." aria-label="Ask a support question" /></label>
				<button type="submit" disabled={!input.trim() || loading}><HiOutlinePaperAirplane aria-hidden /> Send</button>
			</form>
		</section>

		<section className="support-topic-grid" aria-label="Support topics">
			{SUPPORT_TOPICS.map((topic) => {
				const Icon = topic.icon
				return <article className="support-topic-card" key={topic.title}>
					<span><Icon aria-hidden /></span><h2>{topic.title}</h2><p>{topic.copy}</p>
					<button type="button" onClick={() => chooseTopic(topic.prompt)}>Ask about this topic</button>
				</article>
			})}
		</section>

		<section className="support-center-workspace" aria-label="Help assistant and support request">
			<div className="help-conversation support-assistant-panel"><header><span><HiOutlineChatAlt2 /></span><div><h2>BulsuScholar Assistant</h2><p>Guidance based on portal processes</p></div><i><HiOutlineShieldCheck /> Privacy-aware</i></header><div className="help-messages" aria-live="polite">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`help-message ${message.role}`}>{message.text}{message.fallback ? <a href="#support-form">Contact support</a> : null}</div>)}{loading ? <div className="help-message assistant loading">Checking the knowledge base...</div> : null}</div><form onSubmit={send}><textarea value={input} onChange={(event) => setInput(event.target.value)} maxLength={1200} placeholder="Continue the conversation" aria-label="Continue the support conversation" /><button type="submit" disabled={!input.trim() || loading} title="Send question"><HiOutlinePaperAirplane /></button></form></div>
			<aside id="support-form" className="help-feedback support-request-panel"><span>Contact Support</span><h2>Send a support request</h2><p>Your request will be delivered to the administrator inbox. Never include your password.</p><form onSubmit={submitFeedback}><label>Category<select value={feedback.category} onChange={(event) => setFeedback((value) => ({ ...value, category: event.target.value }))}><option value="general">General support</option><option value="account">Account access</option><option value="documents">Documents</option><option value="scholarship">Scholarship record</option></select></label><label>Reply email<input type="email" value={feedback.email} onChange={(event) => setFeedback((value) => ({ ...value, email: event.target.value }))} placeholder="name@example.com" /></label><label>Message<textarea required value={feedback.message} onChange={(event) => setFeedback((value) => ({ ...value, message: event.target.value }))} placeholder="Describe what happened and include the exact error message." /></label><button type="submit"><HiOutlineMail aria-hidden /> Submit Request</button></form></aside>
		</section>

		<section className="support-faq-section" aria-labelledby="support-faq-title">
			<header><span>Frequently Asked Questions</span><h2 id="support-faq-title">Answers to common concerns</h2><p>Review the most common account, document, and scholarship questions before submitting a support request.</p><a href="#support-form"><HiOutlineMail aria-hidden /> Contact support</a></header>
			<div className="support-faq-list">{SUPPORT_FAQS.map((faq, index) => <details key={faq.question} open={index === 0}><summary>{faq.question}<HiOutlineChevronDown aria-hidden /></summary><p>{faq.answer}</p></details>)}</div>
		</section>
	</main></div>
}
