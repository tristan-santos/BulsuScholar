import { lazy, Suspense, useEffect, useState } from "react"
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import "./css/App.css"
import { doc, onSnapshot } from "./services/supabaseDataService"
import { db } from "./services/supabaseDataService"
import FloatingHelpButton from "./components/FloatingHelpButton"
import { PageLoading } from "./components/PortalLoading"

const LoginPage = lazy(() => import("./pages/LoginPage"))
const SignupPage = lazy(() => import("./pages/SignupPage"))
const ConfirmEmailPage = lazy(() => import("./pages/ConfirmEmailPage"))
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"))
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"))
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"))
const StudentAnnouncementsPage = lazy(() => import("./pages/StudentAnnouncementsPage"))
const StudentAnnouncementDetailPage = lazy(() => import("./pages/StudentAnnouncementDetailPage"))
const StudentInboxPage = lazy(() => import("./pages/StudentInboxPage"))
const StudentScholarshipsPage = lazy(() => import("./pages/StudentScholarshipsPage"))
const StudentRecommendedScholarshipsPage = lazy(() => import("./pages/StudentRecommendedScholarshipsPage"))
const StudentProfilePage = lazy(() => import("./pages/StudentProfilePage"))
const ProviderDashboard = lazy(() => import("./pages/ProviderDashboard"))
const GrantorChangePasswordPage = lazy(() => import("./pages/GrantorChangePasswordPage"))
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"))
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"))
const PortalInformationPage = lazy(() => import("./pages/PortalInformationPage"))
const HelpSupportPage = lazy(() => import("./pages/HelpSupportPage"))
const StudentLeavePage = lazy(() => import("./pages/StudentLeavePage"))

const MAINTENANCE_ALLOWED_PREFIXES = ["/admin"]
const MAINTENANCE_ALLOWED_PATHS = ["/maintenance"]

function MaintenanceGate({ children }) {
	const location = useLocation()
	const [maintenanceMode, setMaintenanceMode] = useState(() => {
		try {
			const cached = JSON.parse(localStorage.getItem("bulsuscholar_admin_profile") || "{}")
			return cached?.maintenanceMode === true
		} catch {
			return false
		}
	})

	useEffect(() => {
		const unsubscribe = onSnapshot(
			doc(db, "adminSettings", "profile"),
			(snapshot) => {
				const settings = snapshot.exists() ? snapshot.data() || {} : {}
				setMaintenanceMode(settings.maintenanceMode === true)
			},
			(error) => {
				console.warn("Maintenance settings could not be loaded. Using cached value.", error)
			},
		)
		return () => unsubscribe?.()
	}, [])

	const path = location.pathname
	const routeAllowed =
		MAINTENANCE_ALLOWED_PATHS.includes(path) ||
		MAINTENANCE_ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))

	if (maintenanceMode && !routeAllowed) {
		return <Navigate to="/maintenance" replace state={{ from: path }} />
	}

	return children
}

export default function App() {
	return (
		<BrowserRouter>
			<MaintenanceGate>
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
					<Route path="/admin/*" element={<AdminDashboard />} />
					<Route path="/admin-dashboard" element={<Navigate to="/admin/dashboard" replace />} />
					<Route path="/student-dashboard" element={<StudentDashboard />} />
					<Route path="/student-dashboard/announcements" element={<StudentAnnouncementsPage />} />
					<Route path="/student-dashboard/announcements/:source/:announcementId" element={<StudentAnnouncementDetailPage />} />
					<Route path="/student-dashboard/inbox" element={<StudentInboxPage />} />
					<Route path="/student-dashboard/scholarships" element={<StudentScholarshipsPage />} />
					<Route path="/student-dashboard/recommended-scholarships" element={<StudentRecommendedScholarshipsPage />} />
					<Route path="/student-dashboard/profile" element={<StudentProfilePage />} />
					<Route path="/student-dashboard/leave" element={<StudentLeavePage />} />
					<Route path="/provider-dashboard/*" element={<ProviderDashboard />} />
					<Route path="*" element={<NotFoundPage />} />
				</Routes>
				</Suspense>
				<FloatingHelpButton />
			</MaintenanceGate>
			<ToastContainer position="top-right" autoClose={3000} />
		</BrowserRouter>
	)
}
