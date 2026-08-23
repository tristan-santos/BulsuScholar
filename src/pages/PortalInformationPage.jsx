import { useMemo, useState } from "react"
import { HiOutlineAcademicCap, HiOutlineChevronDown, HiOutlineDocumentText, HiOutlineShieldCheck, HiOutlineUsers } from "react-icons/hi"
import PortalInfoHeader from "../components/PortalInfoHeader"
import "../css/PortalSupport.css"

const FAQS = [
	{ roles: ["guest", "student"], category: "Account", question: "How do I create and confirm my account?", answer: "Create the account using your official student identity, current COR or Advising Slip, and required previous-semester ROG. Follow the confirmation link sent to your registered email unless your roster match is verified automatically." },
	{ roles: ["guest", "student"], category: "Documents", question: "Which COR and ROG should I upload?", answer: "The COR or Advising Slip must be for the current semester. ROG means Report of Grades and must be from the immediately previous semester. It is optional only for an eligible first-year student in the first semester." },
	{ roles: ["student"], category: "Applications", question: "Why can I not apply to another scholarship?", answer: "Only one active non-UNIFAST scholarship is permitted. A current application, rejection cooldown, archive block, or multiple-scholarship warning can disable applications." },
	{ roles: ["student"], category: "Applications", question: "What happens after I apply?", answer: "Track the application from My Scholarships. Complete student-owned document steps and wait for administrator or grantor decisions on review-owned stages." },
	{ roles: ["student", "grantor", "provider", "admin"], category: "Materials", question: "How do SOE and materials work?", answer: "Students request the SOE after reaching the materials stage. The assigned grantor or administrator reviews the request, and the Office of the Scholarship completes signing. Signed requests follow the current cycle cooldown." },
	{ roles: ["guest", "student", "grantor", "provider", "admin"], category: "Access", question: "I cannot sign in or reset my password.", answer: "Use Forgot Password from the login page. Grantors first request a password change from their profile and wait for administrator approval. Archived accounts must contact the Office of the Scholarship." },
	{ roles: ["student", "grantor", "provider", "admin"], category: "Records", question: "What should I do about an identity or duplicate warning?", answer: "Do not create another account or alter the student number. Bring proof of identity to the Office of the Scholarship or submit a Help request." },
	{ roles: ["student", "admin"], category: "Leave", question: "How do LOA and returning requests work?", answer: "Submit an LOA request with its reason and supporting PDF. An approved LOA freezes scholarship progress. When returning, submit a reactivation request for administrator review." },
	{ roles: ["grantor", "provider"], category: "Roster", question: "Why was a scholar row blocked during import?", answer: "The importer blocks a conflicting student identity, an existing active assignment, or a student archived by another grantor. Review the highlighted row and contact the Office of the Scholarship when evidence is required." },
	{ roles: ["grantor", "provider"], category: "Applications", question: "Which applications can a grantor review?", answer: "A grantor can review only applications assigned to that grantor. Student-owned stages remain disabled until the student completes the required action." },
	{ roles: ["grantor", "provider"], category: "Forms", question: "How does a custom application form work?", answer: "Upload one PDF from the grantor profile. Students assigned to a scholarship from that grantor are told that the download is grantor-specific; the default Student Application Profile remains separate." },
	{ roles: ["admin"], category: "Oversight", question: "How are duplicate scholarships resolved?", answer: "The system prevents new conflicting assignments first. If a conflict still exists, freeze progression, review the warning record, retain one verified scholarship, and archive the conflicting assignments." },
	{ roles: ["admin"], category: "UNIFAST", question: "How are UNIFAST records matched?", answer: "Import the administrator spreadsheet. Records match by normalized student number first and controlled name similarity second. UNIFAST is tracked separately from the one active scholarship rule and flags records beyond five study years." },
]

export default function PortalInformationPage({ type = "faq" }) {
	const [query, setQuery] = useState("")
	const role = sessionStorage.getItem("bulsuscholar_userType") || "guest"
	const filtered = useMemo(() => FAQS.filter((item) => item.roles.includes(role) || item.roles.includes("guest")).filter((item) => `${item.category} ${item.question} ${item.answer}`.toLowerCase().includes(query.toLowerCase())), [query, role])
	return <div className="portal-support-page"><PortalInfoHeader /><main className="portal-support-main">
		{type === "about" ? <>
			<section className="portal-support-hero"><span>About the platform</span><h1>A unified scholarship workspace for BulSU</h1><p>BulsuScholar connects students, scholarship grantors, and the Office of the Scholarship through one accountable application and compliance process.</p></section>
			<section className="portal-about-grid">
				<article><HiOutlineAcademicCap /><h2>For Students</h2><p>Submit verified records, choose an eligible scholarship, monitor each stage, and receive decisions through the portal inbox.</p></article>
				<article><HiOutlineUsers /><h2>For Grantors</h2><p>Manage an owned roster, scholarship announcements, applicant reviews, and document requirements without exposing another grantor's records.</p></article>
				<article><HiOutlineShieldCheck /><h2>For Administrators</h2><p>Maintain centralized oversight, prevent duplicate active scholarships, review requests, and export auditable reports.</p></article>
				<article><HiOutlineDocumentText /><h2>Office Purpose</h2><p>Reduce manual follow-ups while preserving review authority, clear student guidance, and evidence-based scholarship decisions.</p></article>
			</section>
		</> : <>
			<section className="portal-support-hero"><span>{role === "guest" ? "Public" : role} guidance</span><h1>Frequently Asked Questions</h1><p>Find answers for account creation, documents, applications, materials, access, and common record errors.</p><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help topics" aria-label="Search frequently asked questions" /></section>
			<section className="portal-faq-list">{filtered.map(({ category, question, answer }) => <details key={question}><summary><span><small>{category}</small>{question}</span><HiOutlineChevronDown /></summary><p>{answer}</p></details>)}{filtered.length === 0 ? <p className="portal-empty">No FAQ matches your search. Ask the Help Assistant instead.</p> : null}</section>
		</>}
	</main></div>
}
