import { useEffect, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import { createPortal } from "react-dom"
import { HiOutlineShieldCheck, HiOutlineEye, HiOutlineEyeOff, HiX } from "react-icons/hi"
import { mpinRequest, openMpinDialog, setMpinPresenter } from "../services/mpinService"
import "../css/MpinSecurity.css"

export function MpinSettings() {
	const [status, setStatus] = useState(null)
	const [error, setError] = useState("")
	const refresh = () => mpinRequest("/status").then((value) => { setStatus(value); setError("") }).catch((err) => setError(err.message))
	useEffect(() => { let live = true; mpinRequest("/status").then((value) => { if (live) setStatus(value) }).catch((err) => { if (live) setError(err.message) }); return () => { live = false } }, [])
	const open = async (operation) => {
		await openMpinDialog({ mode: "settings", operation })
		refresh()
	}
	return <section className="mpin-settings" aria-label="MPIN security settings">
		<div className="mpin-setting-heading"><span className="mpin-shield"><HiOutlineShieldCheck /></span><div><h3>MPIN Security</h3><p>{status?.enabled ? "ON - Confirm selected actions with your six-digit MPIN." : "Optional extra verification for sensitive actions."}</p></div><button type="button" className="mpin-switch" role="switch" aria-checked={Boolean(status?.enabled)} aria-label="Enable MPIN" title={status?.enabled ? "Turn MPIN off" : "Set up MPIN"} disabled={!status || Boolean(error)} onClick={() => open(status.enabled ? "disable" : "enable")}><i /></button></div>
		{error ? <div role="alert" className="mpin-error">{error}<button type="button" onClick={refresh}>Retry</button></div> : !status ? <p role="status">Loading security settings...</p> : status.configured ? <div className="mpin-setting-actions">{status.enabled ? <button type="button" onClick={() => open("change")}>Change MPIN</button> : null}<button type="button" onClick={() => open("reset")}>Forgot MPIN?</button></div> : null}
	</section>
}

function MpinPrompt({ options, resolve }) {
	const [pin, setPin] = useState("")
	const [newPin, setNewPin] = useState("")
	const [confirmation, setConfirmation] = useState("")
	const [code, setCode] = useState("")
	const [rootCode, setRootCode] = useState("")
	const [root, setRoot] = useState(false)
	const [show, setShow] = useState(false)
	const [sent, setSent] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState("")
	const [resendAt, setResendAt] = useState(0)
	const [now, setNow] = useState(Date.now())
	const mounted = useRef(true)
	const submitting = useRef(false)
	const verify = options.mode === "verify"
	const recovery = ["enable", "reset"].includes(options.operation)
	const changing = options.operation !== "disable"
	useEffect(() => { mounted.current = true; import("../services/rootService").then(({ hasRootSession }) => { if (mounted.current) setRoot(location.pathname.startsWith("/root") && hasRootSession()) }); return () => { mounted.current = false } }, [])
	useEffect(() => { if (!resendAt) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [resendAt])
	const close = (answer = null) => { mounted.current = false; setPin(""); setNewPin(""); setConfirmation(""); setCode(""); setRootCode(""); resolve(answer) }
	const send = async () => {
		if (submitting.current) return
		submitting.current = true; setBusy(true); setError("")
		try { const result = await mpinRequest("/email", { rootCode }); if (mounted.current) { setSent(true); setNow(Date.now()); setResendAt(Date.now() + 60000); if (result.verifiedRoot) setCode(result.code) } }
		catch (err) { if (mounted.current) setError(err.message) }
		finally { submitting.current = false; if (mounted.current) setBusy(false) }
	}
	const submit = async (event) => {
		event.preventDefault()
		if (submitting.current) return
		if (!verify && changing && newPin !== confirmation) return setError("The new MPINs do not match.")
		submitting.current = true; setBusy(true); setError("")
		try {
			const result = await mpinRequest(verify ? "/verify" : "/settings", verify ? { path: options.path, payload: options.payload, pin } : { operation: options.operation, pin, newPin, code })
			if (mounted.current) close(verify ? result.token : true)
		} catch (err) { if (mounted.current) { setError(err.message); setPin("") } }
		finally { submitting.current = false; if (mounted.current) setBusy(false) }
	}
	const numeric = (setter, length = 6) => (event) => setter(event.target.value.replace(/[^0-9]/g, "").slice(0, length))
	const input = (label, value, setter) => <label className="mpin-field">{label}<input type={show ? "text" : "password"} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="off" value={value} onChange={numeric(setter)} required disabled={busy} /></label>
	return <div className="mpin-backdrop"><section className="mpin-dialog" role="dialog" aria-modal="true" aria-labelledby="mpin-title">
		<header><span className="mpin-shield"><HiOutlineShieldCheck /></span><button type="button" className="mpin-icon-button" aria-label="Cancel MPIN verification" title="Close" onClick={() => close()}><HiX /></button></header>
		<h2 id="mpin-title">{verify ? "Confirm with your MPIN" : ({ enable: "Set up your MPIN", reset: "Reset your MPIN", change: "Change your MPIN", disable: "Turn off MPIN" })[options.operation]}</h2>
		<p>{verify ? `Enter your six-digit MPIN to continue this ${options.action || "protected action"}.` : recovery ? "Verify your identity, then choose a six-digit MPIN. Your login stays unchanged." : "Enter your current MPIN to confirm this change."}</p>
		<form onSubmit={submit}>
			{recovery ? <div className="mpin-recovery">{root && !sent ? <label className="mpin-field">Root verification code<input type="password" inputMode="numeric" maxLength={10} value={rootCode} onChange={numeric(setRootCode, 10)} autoComplete="off" /></label> : null}<button type="button" disabled={busy || (sent && now < resendAt)} onClick={send}>{busy ? "Verifying..." : sent && now < resendAt ? `Resend in ${Math.ceil((resendAt - now) / 1000)}s` : root ? "Verify Root identity" : sent ? "Resend verification code" : "Send verification code"}</button>{sent && !root ? input("Email verification code", code, setCode) : null}</div> : input("Six-digit MPIN", pin, setPin)}
			{!verify && changing && (!recovery || sent) ? <>{input("New six-digit MPIN", newPin, setNewPin)}{input("Confirm new MPIN", confirmation, setConfirmation)}</> : null}
			{verify || !recovery || sent ? <button type="button" className="mpin-show" onClick={() => setShow(!show)}>{show ? <HiOutlineEyeOff /> : <HiOutlineEye />}{show ? "Hide digits" : "Show digits"}</button> : null}
			{error ? <p className="mpin-error" role="alert">{error}</p> : null}
			<footer><button type="button" onClick={() => close()}>Cancel</button><button type="submit" disabled={busy || (recovery && !sent)}>{busy ? "Verifying..." : verify ? "Confirm" : "Save"}</button></footer>
		</form>
	</section></div>
}

export default function MpinDialog() {
	const { pathname } = useLocation()
	const [prompt, setPrompt] = useState(null)
	useEffect(() => {
		setMpinPresenter((options, resolve) => setPrompt({ options, resolve, key: crypto.randomUUID() }))
		return () => { setMpinPresenter(null); setPrompt(null) }
	}, [pathname])
	if (!prompt) return null
	return createPortal(<MpinPrompt key={prompt.key} options={prompt.options} resolve={(answer) => { setPrompt(null); prompt.resolve(answer) }} />, document.body)
}
