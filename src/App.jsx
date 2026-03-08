import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import "./css/App.css"
import LoginPage from "./pages/LoginPage"
import SignupPage from "./pages/SignupPage"
import AdminDashboard from "./pages/AdminDashboard"
import StudentDashboard from "./pages/StudentDashboard"
import StudentScholarshipsPage from "./pages/StudentScholarshipsPage"
import StudentProfilePage from "./pages/StudentProfilePage"
import ProviderDashboard from "./pages/ProviderDashboard"

function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<LoginPage />} />
				<Route path="/signup" element={<SignupPage />} />
				<Route path="/admin/*" element={<AdminDashboard />} />
				<Route path="/admin-dashboard" element={<Navigate to="/admin/dashboard" replace />} />
				<Route path="/student-dashboard" element={<StudentDashboard />} />
				<Route path="/student-dashboard/scholarships" element={<StudentScholarshipsPage />} />
				<Route path="/student-dashboard/profile" element={<StudentProfilePage />} />
				<Route path="/provider-dashboard" element={<ProviderDashboard />} />
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
			<ToastContainer position="top-right" autoClose={3000} />
		</BrowserRouter>
	)
}

export default App;
