import { lazy, Suspense, useEffect, useState } from "react"
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import "./css/App.css"
import { BACKEND_API_URL } from "./config/backendApi"
import FloatingHelpButton from "./components/FloatingHelpButton"
import { PageLoading } from "./components/PortalLoading"
import ModalDiscardConfirmation from "./components/ModalDiscardConfirmation"
import ModalAccessibilityManager from "./components/ModalAccessibilityManager"
import OperationStatusProvider from "./components/OperationStatusProvider"
import { trackedFetch } from "./services/operationTracker"
import { PublicConfigurationContext } from "./contexts/PublicConfigurationContext"
import { supabase } from "./services/supabaseClient"
import { validatePortalSession } from "./services/portalAuthService"
import { clearPortalIdentity, getPortalIdentity, subscribePortalIdentity } from "./services/portalSessionStorage"

const LoginPage = lazy(() => import("./pages/LoginPage"))
const SignupPage = lazy(() => import("./pages/SignupPage"))
const ConfirmEmailPage = lazy(() => import("./pages/ConfirmEmailPage"))
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"))
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"))
const AdminChangePasswordPage = lazy(() => import("./pages/AdminChangePasswordPage"))
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"))
const StudentAnnouncementsPage = lazy(() => import("./pages/StudentAnnouncementsPage"))
const StudentAnnouncementDetailPage = lazy(() => import("./pages/StudentAnnouncementDetailPage"))
const StudentInboxPage = lazy(() => import("./pages/StudentInboxPage"))
const StudentScholarshipsPage = lazy(() => import("./pages/StudentScholarshipsPage"))
const StudentRecommendedScholarshipsPage = lazy(() => import("./pages/StudentRecommendedScholarshipsPage"))
const StudentProfilePage = lazy(() => import("./pages/StudentProfilePage"))
const StudentHistoryPage = lazy(() => import("./pages/StudentHistoryPage"))
const ProviderDashboard = lazy(() => import("./pages/ProviderDashboard"))
const GrantorChangePasswordPage = lazy(() => import("./pages/GrantorChangePasswordPage"))
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"))
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"))
const PortalInformationPage = lazy(() => import("./pages/PortalInformationPage"))
const HelpSupportPage = lazy(() => import("./pages/HelpSupportPage"))
const RootDashboard = lazy(() => import("./pages/RootDashboard"))

const MAINTENANCE_ALLOWED_PREFIXES = ["/root"]
const MAINTENANCE_ALLOWED_PATHS = [
	"/maintenance",
	"/help",
	"/faq",
	"/about",
]

function MaintenanceGate({ children }) {
	const location = useLocation()
	const [maintenanceMode, setMaintenanceMode] = useState(() => {
		try {
			const cached = JSON.parse(localStorage.getItem("bulsuscholar_public_config") || "{}")
			return cached?.portal?.maintenanceMode === true
		} catch {
			return false
		}
	})
	const [publicConfiguration, setPublicConfiguration] = useState(() => {
		try { return JSON.parse(localStorage.getItem("bulsuscholar_public_config") || "{}") } catch { return {} }
	})

	useEffect(() => {
		if (!BACKEND_API_URL) return undefined
		const controller = new AbortController()
		trackedFetch(`${BACKEND_API_URL}/config/public`, { signal: controller.signal })
			.then((response) => response.ok ? response.json() : Promise.reject(new Error("configuration_unavailable")))
			.then((settings) => {
				localStorage.setItem("bulsuscholar_public_config", JSON.stringify(settings))
				setPublicConfiguration(settings)
				setMaintenanceMode(settings.portal?.maintenanceMode === true)
				const branding = settings.branding || {}
				if (branding.primaryColor) document.documentElement.style.setProperty("--bulsu-primary", branding.primaryColor)
				if (branding.fontFamily) document.documentElement.style.setProperty("--bulsu-font-family", `${branding.fontFamily}, sans-serif`)
				if (branding.productName) document.title = branding.productName
				if (branding.faviconUrl) document.querySelector("link[rel='icon']")?.setAttribute("href", branding.faviconUrl)
			})
			.catch((error) => { if (error.name !== "AbortError") console.warn("Public configuration could not be refreshed.", error) })
		return () => controller.abort()
	}, [])

	const path = location.pathname
	const routeAllowed =
		MAINTENANCE_ALLOWED_PATHS.includes(path) ||
		MAINTENANCE_ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))

	if (maintenanceMode && !routeAllowed) {
		return <Navigate to="/maintenance" replace state={{ from: path }} />
	}

	return <PublicConfigurationContext.Provider value={publicConfiguration}>{children}</PublicConfigurationContext.Provider>
}

function PortalSessionGate({ children }) {
	const location = useLocation()
	const [verification, setVerification] = useState({ path: "", state: "checking" })
	const protectedPath = ["/student-dashboard", "/provider-dashboard", "/admin"].some(
		(prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`),
	)

	useEffect(() => {
		if (!protectedPath) return undefined
		const { userId: actorId, userType: actorType } = getPortalIdentity()
		let active = true
		const validation = !actorId || !["student", "provider", "admin"].includes(actorType)
			? Promise.reject(new Error("portal_identity_required"))
			: validatePortalSession()
		validation
			.then(() => { if (active) setVerification({ path: location.pathname, state: "ready" }) })
			.catch(async () => {
				if (!active) return
				clearPortalIdentity()
				await supabase.auth.signOut().catch(() => {})
				if (active) setVerification({ path: location.pathname, state: "denied" })
			})
		return () => { active = false }
	}, [location.pathname, protectedPath])

	useEffect(() => subscribePortalIdentity(({ userId }) => {
		if (protectedPath && !userId) setVerification({ path: location.pathname, state: "denied" })
	}), [location.pathname, protectedPath])

	if (!protectedPath) return children
	if (verification.path !== location.pathname) return <PageLoading />
	if (verification.state === "denied") return <Navigate to="/" replace />
	return children
}

export default function App() {
	return (
		<BrowserRouter>
			<OperationStatusProvider>
			<MaintenanceGate>
				<PortalSessionGate>
				<Suspense fallback={<PageLoading />}>
				<Routes>
					<Route path="/" element={<LoginPage />} />
					<Route path="/maintenance" element={<MaintenancePage />} />
					<Route path="/signup" element={<SignupPage />} />
					<Route path="/confirm-email" element={<ConfirmEmailPage />} />
					<Route path="/reset-password" element={<ResetPasswordPage />} />
					<Route path="/grantor/change-password" element={<GrantorChangePasswordPage />} />
					<Route path="/faq" element={<PortalInformationPage type="faq" />} />
					<Route path="/about" element={<PortalInformationPage type="about" />} />
					<Route path="/help" element={<HelpSupportPage />} />
					<Route path="/root/*" element={<RootDashboard />} />
					<Route path="/admin/change-password" element={<AdminChangePasswordPage />} />
					<Route path="/admin/*" element={<AdminDashboard />} />
					<Route path="/admin-dashboard" element={<Navigate to="/admin/dashboard" replace />} />
					<Route path="/student-dashboard" element={<StudentDashboard />} />
					<Route path="/student-dashboard/announcements" element={<StudentAnnouncementsPage />} />
					<Route path="/student-dashboard/announcements/:source/:announcementId" element={<StudentAnnouncementDetailPage />} />
					<Route path="/student-dashboard/inbox" element={<StudentInboxPage />} />
					<Route path="/student-dashboard/scholarships" element={<StudentScholarshipsPage />} />
					<Route path="/student-dashboard/recommended-scholarships" element={<StudentRecommendedScholarshipsPage />} />
					<Route path="/student-dashboard/profile" element={<StudentProfilePage />} />
					<Route path="/student-dashboard/profile/form" element={<StudentProfilePage formMode />} />
					<Route path="/student-dashboard/history" element={<StudentHistoryPage />} />
					<Route path="/provider-dashboard/*" element={<ProviderDashboard />} />
					<Route path="*" element={<NotFoundPage />} />
				</Routes>
				</Suspense>
				<FloatingHelpButton />
				</PortalSessionGate>
			</MaintenanceGate>
			<ToastContainer
				position="top-right"
				autoClose={3000}
				className="bulsuscholar-toast-container"
			/>
			<ModalAccessibilityManager />
			<ModalDiscardConfirmation />
			</OperationStatusProvider>
		</BrowserRouter>
	)
}
