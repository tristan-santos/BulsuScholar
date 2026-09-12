import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { HiOutlineKey } from "react-icons/hi"
import { toast } from "react-toastify"
import { changeAdminTemporaryPassword } from "../services/adminAccountService"
import "../css/RootDashboard.css"

export default function AdminChangePasswordPage() {
	const navigate = useNavigate()
	const [form, setForm] = useState({ password: "", confirm: "" })
	const [busy, setBusy] = useState(false)
	const submit = async (event) => {
		event.preventDefault()
		if (form.password !== form.confirm) return toast.error("Passwords do not match.")
		setBusy(true)
		try {
			await changeAdminTemporaryPassword(form.password)
			toast.success("Password changed. Your administrator account is ready.")
			navigate("/admin/dashboard", { replace: true })
		} catch (error) { toast.error(error.message || "Unable to change the administrator password.") }
		finally { setBusy(false) }
	}
	return <main className="root-login"><section className="root-login-panel"><div className="root-login-mark"><HiOutlineKey /></div><span>Administrator security</span><h1>Replace Temporary Password</h1><p>Choose a private password before entering the administration portal.</p><form onSubmit={submit}><label>New password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" /></label><label>Confirm password<input type="password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} autoComplete="new-password" /></label><small>Use at least 12 characters with uppercase, lowercase, number, and symbol.</small><button disabled={busy}>{busy ? "Updating..." : "Change Password"}</button></form></section></main>
}
