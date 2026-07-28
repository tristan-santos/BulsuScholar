import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import "./css/App.css"
import LoginPage from "./pages/LoginPage"
import SignupPage from "./pages/SignupPage"
import ConfirmEmailPage from "./pages/ConfirmEmailPage"
import ResetPasswordPage from "./pages/ResetPasswordPage"
import AdminDashboard from "./pages/AdminDashboard"
import StudentDashboard from "./pages/StudentDashboard"
import StudentAnnouncementsPage from "./pages/StudentAnnouncementsPage"
import StudentAnnouncementDetailPage from "./pages/StudentAnnouncementDetailPage"
import StudentInboxPage from "./pages/StudentInboxPage"
import StudentScholarshipsPage from "./pages/StudentScholarshipsPage"
import StudentRecommendedScholarshipsPage from "./pages/StudentRecommendedScholarshipsPage"
import StudentProfilePage from "./pages/StudentProfilePage"
import ProviderDashboard from "./pages/ProviderDashboard"
import GrantorChangePasswordPage from "./pages/GrantorChangePasswordPage"
import NotFoundPage from "./pages/NotFoundPage"

export default function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<LoginPage />} />
				<Route path="/signup" element={<SignupPage />} />
				<Route path="/confirm-email" element={<ConfirmEmailPage />} />
				<Route path="/reset-password" element={<ResetPasswordPage />} />
				<Route path="/grantor/change-password" element={<GrantorChangePasswordPage />} />
				<Route path="/admin/*" element={<AdminDashboard />} />
				<Route path="/admin-dashboard" element={<Navigate to="/admin/dashboard" replace />} />
				<Route path="/student-dashboard" element={<StudentDashboard />} />
				<Route path="/student-dashboard/announcements" element={<StudentAnnouncementsPage />} />
				<Route path="/student-dashboard/announcements/:source/:announcementId" element={<StudentAnnouncementDetailPage />} />
				<Route path="/student-dashboard/inbox" element={<StudentInboxPage />} />
				<Route path="/student-dashboard/scholarships" element={<StudentScholarshipsPage />} />
				<Route path="/student-dashboard/recommended-scholarships" element={<StudentRecommendedScholarshipsPage />} />
				<Route path="/student-dashboard/profile" element={<StudentProfilePage />} />
				<Route path="/provider-dashboard/*" element={<ProviderDashboard />} />
				<Route path="*" element={<NotFoundPage />} />
			</Routes>
			<ToastContainer position="top-right" autoClose={3000} />
		</BrowserRouter>
	)
}
