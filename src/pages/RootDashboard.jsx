import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "react-toastify"
import {
	HiOutlineAdjustments, HiOutlineChartBar, HiOutlineCloud, HiOutlineCode,
	HiOutlineColorSwatch, HiOutlineDatabase, HiOutlineDocumentDownload,
	HiOutlineDocumentText, HiOutlineExclamation, HiOutlineHome, HiOutlineKey,
	HiOutlineLogout, HiOutlineMenu, HiOutlineRefresh, HiOutlineSearch,
	HiOutlineMoon, HiOutlineServer, HiOutlineShieldCheck, HiOutlineSun, HiOutlineSupport, HiOutlineUsers, HiX,
} from "react-icons/hi"
import useThemeMode from "../hooks/useThemeMode"
import {
	changeRootPassword, clearRootSession, establishRootSession, executeRootSql, executeRootSqlMaintenance,
	downloadRootCanonicalPdf, downloadRootPdf, downloadRootStudentFile,
	getAllRootData, getRootAdmins, getRootBrandingVersions, getRootData, getRootDevices, getRootFiles, getRootIntegrations,
	getRootCanonicalReport, getRootLogs, getRootMetrics, getRootOverview, getRootSqlPresets, getRootSupport,
	getRootSessions, hasRootSession, reauthenticateRoot, regenerateRootRecoveryCodes,
	requestRootCode, revokeRootDevice, revokeRootSession, rootLogin, runRootIntegrationAction,
	publishRootBrandingVersion, saveRootAdmin, saveRootBrandingDraft, saveRootSetting, updateRootPassword, updateRootSupport, uploadRootBrandingAsset, verifyRootCode,
} from "../services/rootService"
import "../css/RootDashboard.css"

const SECTIONS = [
	["overview", "Overview", <HiOutlineHome key="overview" />], ["health", "Health", <HiOutlineServer key="health" />],
	["data", "Data Explorer", <HiOutlineDatabase key="data" />], ["reports", "Reports & Files", <HiOutlineDocumentDownload key="reports" />],
	["sql", "SQL Console", <HiOutlineCode key="sql" />], ["admins", "Administrators", <HiOutlineUsers key="admins" />],
	["support", "Support", <HiOutlineSupport key="support" />], ["logs", "Logs & Audit", <HiOutlineDocumentText key="logs" />],
	["settings", "Cycle & Settings", <HiOutlineAdjustments key="settings" />], ["branding", "Branding", <HiOutlineColorSwatch key="branding" />],
	["integrations", "Integrations", <HiOutlineCloud key="integrations" />],
]
const DATASETS = ["students", "grantors", "scholarships", "applications", "announcements", "requirements", "materials", "notifications"]
const REPORTS = ["Students", "Grantors", "Scholarships", "Requirements", "Compliance", "Top Students per Grantor", "Root Audit", "Support Tickets", "Administrator Access", "Student File Inventory", "Operational Metrics"]
const CANONICAL_REPORT_KEYS = { Students: "students", Grantors: "grantors", Scholarships: "scholarships", Requirements: "requirements", Compliance: "compliance", "Top Students per Grantor": "top_students" }
const EMPTY_CONFIG = { portal: {}, academicCycle: {}, branding: {} }

function formatNumber(value) { return Number(value || 0).toLocaleString() }
function formatDate(value) { return value ? new Date(value).toLocaleString() : "-" }
function pretty(value) {
	if (value === null || value === undefined || value === "") return "-"
	if (typeof value === "object") return JSON.stringify(value)
	return String(value)
}
function downloadCsv(filename, rows) {
	if (!rows.length) return toast.info("There are no records to export.")
	const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => !/password|token|secret/i.test(key))
	const protect = (value) => {
		let text = pretty(value).replaceAll('"', '""')
		if (/^[=+\-@]/.test(text)) text = `'${text}`
		return `"${text}"`
	}
	const blob = new Blob(["\ufeff", [columns.join(","), ...rows.map((row) => columns.map((key) => protect(row[key])).join(","))].join("\r\n")], { type: "text/csv;charset=utf-8" })
	const url = URL.createObjectURL(blob); const anchor = document.createElement("a")
	anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
}

function RootLogin({ onAuthenticated }) {
	const [stage, setStage] = useState("login")
	const [form, setForm] = useState({ userId: "Tristan@Root", password: "", newPassword: "", confirmPassword: "" })
	const [tokens, setTokens] = useState(null)
	const [challenge, setChallenge] = useState(null)
	const [digits, setDigits] = useState(["", "", "", "", "", ""])
	const [useRecoveryCode, setUseRecoveryCode] = useState(false)
	const [recoveryCode, setRecoveryCode] = useState("")
	const [busy, setBusy] = useState(false)
	const [recoveryCodes, setRecoveryCodes] = useState([])
	const [deliveryFailed, setDeliveryFailed] = useState(false)
	const inputs = useRef([])

	const submitLogin = async (event) => {
		event.preventDefault(); setBusy(true)
		try {
			const result = await rootLogin(form.userId, form.password)
			const nextTokens = { accessToken: result.accessToken, refreshToken: result.refreshToken }
			setTokens(nextTokens)
			if (result.stage === "authenticated") { await establishRootSession(result, nextTokens); onAuthenticated(); return }
			if (result.stage === "change_password") setStage("password")
			else { setChallenge(result.challengeId); setDeliveryFailed(result.deliveryFailed === true); setUseRecoveryCode(result.deliveryFailed === true); setStage("otp") }
		} catch (error) { toast.error(error.message || "Root login failed.") }
		finally { setBusy(false) }
	}
	const submitPassword = async (event) => {
		event.preventDefault()
		if (form.newPassword !== form.confirmPassword) return toast.error("Passwords do not match.")
		setBusy(true)
		try { const result = await changeRootPassword(tokens.accessToken, form.newPassword); setChallenge(result.challengeId); setRecoveryCodes(result.recoveryCodes || []); setDeliveryFailed(result.deliveryFailed === true); setUseRecoveryCode(result.deliveryFailed === true); setStage("otp") }
		catch (error) { toast.error(error.message) } finally { setBusy(false) }
	}
	const submitCode = async (event) => {
		event.preventDefault(); const code = useRecoveryCode ? recoveryCode.trim() : digits.join("")
		if ((!useRecoveryCode && code.length !== 6) || (useRecoveryCode && code.length !== 10)) return toast.error(useRecoveryCode ? "Enter a complete 10-character recovery code." : "Enter the complete verification code.")
		setBusy(true)
		try { const result = await verifyRootCode(tokens.accessToken, challenge, code, true); await establishRootSession(result, tokens); onAuthenticated() }
		catch (error) { toast.error(error.message) } finally { setBusy(false) }
	}
	const changeDigit = (index, value) => {
		const next = [...digits]; next[index] = value.replace(/\D/g, "").slice(-1); setDigits(next)
		if (next[index] && index < 5) inputs.current[index + 1]?.focus()
	}
	const resendCode = async () => {
		setBusy(true)
		try { const result = await requestRootCode(tokens.accessToken); setChallenge(result.challengeId); setDeliveryFailed(false); setUseRecoveryCode(false); toast.success("A new verification code was sent.") }
		catch (error) { toast.error(error.message) } finally { setBusy(false) }
	}

	return <main className="root-login"><section className="root-login-panel">
		<div className="root-login-mark"><HiOutlineShieldCheck /></div><span>Restricted system access</span><h1>Root Administration</h1>
		<p>Authenticate to manage BulsuScholar infrastructure and protected operations.</p>
		{stage === "login" ? <form onSubmit={submitLogin}><label>User ID<input value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })} autoComplete="username" /></label><label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="current-password" /></label><button disabled={busy}>{busy ? "Verifying..." : "Continue"}</button></form> : null}
		{stage === "password" ? <form onSubmit={submitPassword}><div className="root-login-notice"><HiOutlineExclamation /> Replace the temporary password before continuing.</div><label>New password<input type="password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} autoComplete="new-password" /></label><label>Confirm password<input type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} autoComplete="new-password" /></label><small>Use at least 12 characters with uppercase, lowercase, number, and symbol.</small><button disabled={busy}>{busy ? "Updating..." : "Change Password"}</button></form> : null}
		{stage === "otp" ? <form onSubmit={submitCode} className="root-otp-form"><div className="root-phone-otp"><HiOutlineKey /><strong>Verify this device</strong><small>{useRecoveryCode ? "Enter one unused recovery code." : "Enter the six-digit code sent to the root email."}</small>{deliveryFailed ? <span className="root-otp-warning">Email delivery is unavailable. Use a recovery code or retry delivery.</span> : null}{useRecoveryCode ? <input className="root-recovery-input" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.replace(/[^a-fA-F0-9]/g, "").toUpperCase().slice(0, 10))} maxLength={10} autoComplete="one-time-code" /> : <div>{digits.map((digit, index) => <input key={index} ref={(node) => { inputs.current[index] = node }} inputMode="numeric" maxLength={1} value={digit} onChange={(event) => changeDigit(index, event.target.value)} onKeyDown={(event) => { if (event.key === "Backspace" && !digit && index) inputs.current[index - 1]?.focus() }} />)}</div>}<button type="button" className="root-text-button" onClick={() => setUseRecoveryCode((value) => !value)}>{useRecoveryCode ? "Use email verification code" : "Use a recovery code"}</button><button type="button" className="root-text-button" onClick={resendCode} disabled={busy}>Resend email code</button></div>{recoveryCodes.length ? <details className="root-recovery" open><summary>Save recovery codes now</summary><p>Each code works once. Store them offline.</p><code>{recoveryCodes.join("\n")}</code></details> : null}<button disabled={busy}>{busy ? "Checking..." : "Verify and Trust Device"}</button></form> : null}
	</section></main>
}

function DataTable({ rows }) {
	const columns = useMemo(() => [...new Set((rows || []).flatMap((row) => Object.keys(row)))].filter((key) => !/password|token|secret|recovery/i.test(key)).slice(0, 10), [rows])
	if (!rows?.length) return <div className="root-empty">No records found.</div>
	return <div className="root-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column.replace(/([A-Z])/g, " $1")}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || index}>{columns.map((column) => <td key={column} title={pretty(row[column])}>{pretty(row[column])}</td>)}</tr>)}</tbody></table></div>
}

function FileTable({ rows, onDownload }) {
	if (!rows?.length) return <div className="root-empty">No student file references found.</div>
	return <div className="root-table-wrap"><table><thead><tr><th>Student</th><th>Document</th><th>Filename</th><th>Size</th><th>Action</th></tr></thead><tbody>{rows.map((file, index) => <tr key={`${file.studentId}-${file.path}-${index}`}><td>{file.studentId || "-"}</td><td>{file.document || "-"}</td><td>{file.name || "Document"}</td><td>{file.size ? `${(Number(file.size) / 1024).toFixed(1)} KB` : "Unknown"}</td><td><button onClick={() => onDownload(file)} disabled={!file.path && !file.url}><HiOutlineDocumentDownload /> Download</button></td></tr>)}</tbody></table></div>
}

export default function RootDashboard() {
	const { theme, setTheme } = useThemeMode()
	const [authenticated, setAuthenticated] = useState(hasRootSession())
	const [section, setSection] = useState("overview")
	const [sidebarOpen, setSidebarOpen] = useState(false)
	const [loading, setLoading] = useState(false)
	const [overview, setOverview] = useState(null)
	const [metrics, setMetrics] = useState(null)
	const [metricHistory, setMetricHistory] = useState([])
	const [dependencies, setDependencies] = useState({})
	const [dataset, setDataset] = useState("students")
	const [dataRows, setDataRows] = useState([])
	const [dataPage, setDataPage] = useState(1)
	const [dataHasMore, setDataHasMore] = useState(false)
	const [search, setSearch] = useState("")
	const [sql, setSql] = useState("")
	const [sqlPresets, setSqlPresets] = useState([])
	const [sqlMaintenanceActions, setSqlMaintenanceActions] = useState([])
	const [sqlResult, setSqlResult] = useState(null)
	const [admins, setAdmins] = useState([])
	const [tickets, setTickets] = useState([])
	const [logs, setLogs] = useState({ systemLogs: [], auditLogs: [] })
	const [files, setFiles] = useState({ files: [], count: 0, totalBytes: 0 })
	const [integrations, setIntegrations] = useState({})
	const [config, setConfig] = useState(EMPTY_CONFIG)
	const [brandingVersions, setBrandingVersions] = useState([])
	const [modal, setModal] = useState(null)

	const guard = async (callback) => {
		setLoading(true)
		try { return await callback() }
		catch (error) {
			const reason = typeof error.data?.detail === "string" ? error.data.detail : error.data?.detail?.reason
			if (reason === "recent_root_authentication_required") {
				setModal({ type: "reauth", retry: callback })
				return
			}
			if (error.status === 401 || reason === "root_role_required" || reason === "root_session_expired") { await clearRootSession(false); setAuthenticated(false) }
			toast.error(error.message || "Root operation failed.")
		} finally { setLoading(false) }
	}
	const loadOverview = () => guard(async () => { const result = await getRootOverview(); setOverview(result); setMetrics(result.metrics); setDependencies(result.dependencies || {}); setConfig(result.config || EMPTY_CONFIG) })
	const loadDataPage = (page = 1) => guard(async () => { const result = await getRootData(dataset, page, search); setDataRows(result.rows || []); setDataPage(page); setDataHasMore(result.hasMore === true) })
	useEffect(() => { if (authenticated) loadOverview() }, [authenticated]) // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => {
		if (!authenticated) return
		if (section === "health") guard(async () => { const result = await getRootMetrics(); setMetrics(result.metrics); setDependencies(result.dependencies || {}); setMetricHistory(result.history || []) })
		if (section === "data") loadDataPage(1)
		if (section === "sql") guard(async () => { const result = await getRootSqlPresets(); setSqlPresets(result.presets || []); setSqlMaintenanceActions(result.maintenanceActions || []) })
		if (section === "admins") guard(async () => setAdmins((await getRootAdmins()).admins))
		if (section === "support") guard(async () => setTickets((await getRootSupport()).tickets))
		if (section === "logs") guard(async () => setLogs(await getRootLogs()))
		if (section === "reports") guard(async () => setFiles(await getRootFiles()))
		if (section === "integrations") guard(async () => setIntegrations((await getRootIntegrations()).integrations))
		if (section === "branding") guard(async () => setBrandingVersions((await getRootBrandingVersions()).versions || []))
	}, [authenticated, section]) // eslint-disable-line react-hooks/exhaustive-deps

	if (!authenticated) return <RootLogin onAuthenticated={() => setAuthenticated(true)} />
	const navigate = (id) => { setSection(id); setSidebarOpen(false) }
	const cards = overview?.counts || {}
	const exportReport = (report, format) => {
		guard(async () => {
			let rows
			const canonicalKey = CANONICAL_REPORT_KEYS[report]
			if (canonicalKey) {
				const snapshot = await getRootCanonicalReport(canonicalKey)
				if (format === "pdf") await downloadRootCanonicalPdf(snapshot)
				else downloadCsv(`${canonicalKey.replaceAll("_", "-")}.csv`, snapshot.records || [])
				return
			}
			else if (report === "Root Audit") rows = (await getRootLogs()).auditLogs || []
			else if (report === "Support Tickets") rows = (await getRootSupport()).tickets || []
			else if (report === "Administrator Access") rows = (await getRootAdmins()).admins || []
			else if (report === "Student File Inventory") rows = (await getRootFiles()).files || []
			else rows = [{ generatedAt: new Date().toISOString(), ...((await getRootMetrics()).metrics || {}) }]
			if (format === "pdf") await downloadRootPdf(report, rows)
			else downloadCsv(`${report.toLowerCase().replaceAll(" ", "-")}.csv`, rows)
		})
	}

	return <div className="root-shell" style={{ "--root-primary": config.branding?.primaryColor || "#006b3c", fontFamily: config.branding?.fontFamily || "Inter, sans-serif" }}>
		<aside className={sidebarOpen ? "open" : ""}><header><div><HiOutlineShieldCheck /></div><span><strong>{config.branding?.productName || "BulsuScholar"}</strong><small>Root Operations</small></span></header><nav>{SECTIONS.map(([id, label, icon]) => <button className={section === id ? "active" : ""} key={id} onClick={() => navigate(id)}>{icon}<span>{label}</span></button>)}</nav><footer><button onClick={() => setModal({ type: "security" })}><HiOutlineKey /> Security</button><button className="danger" onClick={async () => { await clearRootSession(); setAuthenticated(false) }}><HiOutlineLogout /> Sign Out</button></footer></aside>
		{sidebarOpen ? <button className="root-sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" /> : null}
		<main><header className="root-topbar"><button className="root-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><HiOutlineMenu /></button><div><span>ROOT CONTROL CENTER</span><h1>{SECTIONS.find(([id]) => id === section)?.[1]}</h1></div><button className="root-refresh" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title={`Use ${theme === "dark" ? "light" : "dark"} mode`} aria-label={`Use ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? <HiOutlineSun /> : <HiOutlineMoon />}</button><button className="root-refresh" onClick={() => { setSection(section); loadOverview() }} title="Refresh"><HiOutlineRefresh /></button></header>
			<div className="root-content">{loading ? <div className="root-loading">Refreshing protected data...</div> : null}
			{section === "overview" ? <><section className="root-status-band"><div><span>System status</span><strong>{config.portal?.maintenanceMode ? "Maintenance" : "Operational"}</strong></div><div><span>Active cycle</span><strong>{config.academicCycle?.semesterTag || `${config.academicCycle?.academicYear || "-"} ${config.academicCycle?.semester || ""}`}</strong></div><div><span>Backend version</span><strong>{overview?.version || "-"}</strong></div><i className={config.portal?.maintenanceMode ? "warning" : "healthy"} /></section><section className="root-kpis">{Object.entries(cards).map(([label, value]) => <article key={label}><span>{label}</span><strong>{value === null ? "Unavailable" : formatNumber(value)}</strong></article>)}</section><section className="root-grid-two"><article className="root-panel"><header><h2>Runtime</h2><HiOutlineChartBar /></header><dl><div><dt>Uptime</dt><dd>{formatNumber(metrics?.uptimeSeconds)} sec</dd></div><div><dt>Requests</dt><dd>{formatNumber(metrics?.requests)}</dd></div><div><dt>Errors</dt><dd>{formatNumber(metrics?.errors)}</dd></div><div><dt>P95 latency</dt><dd>{metrics?.latencyMs?.p95 || 0} ms</dd></div></dl></article><article className="root-panel"><header><h2>Configuration</h2><HiOutlineAdjustments /></header><dl><div><dt>Student signup</dt><dd>{config.portal?.allowStudentSignup !== false ? "Enabled" : "Disabled"}</dd></div><div><dt>Grantor announcements</dt><dd>{config.portal?.allowGrantorAnnouncements !== false ? "Enabled" : "Disabled"}</dd></div><div><dt>Admin exports</dt><dd>{config.portal?.reportExportEnabled !== false ? "Enabled" : "Disabled"}</dd></div></dl></article></section></> : null}

			{section === "health" ? <><section className="root-kpis"><article><span>In flight</span><strong>{metrics?.inFlight || 0}</strong></article><article><span>CPU</span><strong>{metrics?.process?.cpuPercent || 0}%</strong></article><article><span>Memory</span><strong>{((metrics?.process?.memoryBytes || 0) / 1048576).toFixed(1)} MB</strong></article><article><span>P99 latency</span><strong>{metrics?.latencyMs?.p99 || 0} ms</strong></article></section><section className="root-panel"><header><div><h2>Dependency health</h2><p>Configuration status only; credentials are never returned.</p></div></header><DataTable rows={Object.entries(dependencies).map(([service, state]) => ({ service, ...state }))} /></section><section className="root-grid-two"><article className="root-panel"><h2>Requests by route</h2><DataTable rows={Object.entries(metrics?.routes || {}).map(([route, requests]) => ({ route, requests }))} /></article><article className="root-panel"><h2>Status codes</h2><DataTable rows={Object.entries(metrics?.statuses || {}).map(([status, requests]) => ({ status, requests }))} /></article></section><section className="root-panel"><header><div><h2>Hourly request history</h2><p>Retained for 90 days.</p></div></header><DataTable rows={metricHistory} /></section></> : null}

			{section === "data" ? <section className="root-panel"><div className="root-toolbar"><select value={dataset} onChange={(event) => { setDataset(event.target.value); setDataPage(1) }}>{DATASETS.map((item) => <option key={item}>{item}</option>)}</select><label><HiOutlineSearch /><input value={search} onChange={(event) => { setSearch(event.target.value); setDataPage(1) }} placeholder="Search records" /></label><button onClick={() => loadDataPage(1)}>Load</button><button onClick={() => guard(async () => downloadCsv(`${dataset}.csv`, await getAllRootData(dataset, search)))}><HiOutlineDocumentDownload /> CSV</button></div><DataTable rows={dataRows} /><div className="root-pagination"><button disabled={dataPage <= 1} onClick={() => loadDataPage(dataPage - 1)}>Previous</button><span>Page {dataPage}</span><button disabled={!dataHasMore} onClick={() => loadDataPage(dataPage + 1)}>Next</button></div></section> : null}

			{section === "reports" ? <><section className="root-report-grid">{REPORTS.map((report) => <article key={report}><HiOutlineDocumentText /><h2>{report}</h2><p>Generate from the complete protected dataset.</p><div className="root-report-actions"><button onClick={() => exportReport(report, "pdf")}>PDF</button><button onClick={() => exportReport(report, "csv")}>CSV</button></div></article>)}</section><section className="root-panel"><header><div><h2>Student file inventory</h2><p>{formatNumber(files.count)} references, {((files.totalBytes || 0) / 1048576).toFixed(2)} MB recorded</p></div><button onClick={() => downloadCsv("student-file-inventory.csv", files.files || [])}>Export inventory</button></header><FileTable rows={files.files || []} onDownload={(file) => guard(async () => { await downloadRootStudentFile(file); toast.success("Student file downloaded.") })} /></section></> : null}

			{section === "sql" ? <section className="root-panel root-sql"><div className="root-toolbar"><select onChange={(event) => { const preset = sqlPresets.find((item) => item.id === event.target.value); if (preset) setSql(preset.sql) }} defaultValue=""><option value="" disabled>Common diagnostic command</option>{sqlPresets.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><span>Read-only · 10 sec · 500 rows</span></div><textarea value={sql} onChange={(event) => setSql(event.target.value)} spellCheck="false" placeholder="SELECT ..." /><button onClick={() => guard(async () => setSqlResult(await executeRootSql(sql)))} disabled={!sql.trim()}><HiOutlineCode /> Execute Read-only Query</button>{sqlResult ? <><p>{sqlResult.rows.length} rows in {sqlResult.durationMs} ms{sqlResult.truncated ? " (truncated)" : ""}</p><DataTable rows={sqlResult.rows} /></> : null}<div className="root-maintenance-actions"><h3>Approved maintenance</h3>{sqlMaintenanceActions.map((item) => <button key={item.id} onClick={() => setModal({ type: "sql-maintenance", data: item })}>{item.label}</button>)}</div></section> : null}

			{section === "admins" ? <section className="root-panel"><div className="root-toolbar"><div><h2>Administrator access</h2><p>Roles are enforced by the portal and backend.</p></div><button onClick={() => setModal({ type: "admin", data: { active: true, role: "full_admin" } })}>Add Administrator</button></div><DataTable rows={admins.map((admin) => ({ id: admin.id, name: admin.fullName || admin.name, email: admin.email, role: admin.role, status: admin.status, contact: admin.contactNumber, updated: admin.updatedAt }))} />{admins.map((admin) => <button className="root-row-action" key={admin.id} onClick={() => setModal({ type: "admin", data: { ...admin, adminId: admin.id, active: String(admin.status).toLowerCase() !== "disabled" } })}>Edit {admin.id}</button>)}</section> : null}

			{section === "support" ? <section className="root-panel"><div className="root-toolbar"><h2>Root-only ticket queue</h2><span>{tickets.filter((ticket) => ticket.status !== "resolved").length} open</span></div><div className="root-ticket-list">{tickets.map((ticket) => <button key={ticket.id} onClick={() => setModal({ type: "ticket", data: ticket })}><span className={`priority ${ticket.priority}`}>{ticket.priority}</span><strong>{ticket.category || "Support request"}</strong><p>{ticket.message}</p><small>{ticket.userType} · {formatDate(ticket.createdAt)} · {ticket.status}</small></button>)}</div>{!tickets.length ? <div className="root-empty">No support tickets.</div> : null}</section> : null}

			{section === "logs" ? <><section className="root-panel"><h2>System logs</h2><DataTable rows={logs.systemLogs} /></section><section className="root-panel"><h2>Immutable root audit</h2><DataTable rows={logs.auditLogs} /></section></> : null}

			{section === "settings" ? <section className="root-grid-two"><SettingsCard key={JSON.stringify(config.portal)} title="Portal controls" values={config.portal} fields={["maintenanceMode", "allowStudentSignup", "allowGrantorAnnouncements", "reportExportEnabled"]} onSave={(data) => setModal({ type: "setting", data: { settingId: "portal", values: data } })} /><CycleCard key={JSON.stringify(config.academicCycle)} value={config.academicCycle} onSave={(data) => setModal({ type: "setting", data: { settingId: "academic_cycle", values: data } })} /></section> : null}

			{section === "branding" ? <BrandingCard key={JSON.stringify(config.branding)} value={config.branding} versions={brandingVersions} onUpload={(file) => uploadRootBrandingAsset(file)} onSaveDraft={(data) => guard(async () => { await saveRootBrandingDraft(data); setBrandingVersions((await getRootBrandingVersions()).versions || []); toast.success("Branding draft saved.") })} onPublish={(id) => guard(async () => { const result = await publishRootBrandingVersion(id); setConfig((current) => ({ ...current, branding: result.data })); setBrandingVersions((await getRootBrandingVersions()).versions || []); toast.success("Branding version published.") })} /> : null}

			{section === "integrations" ? <section className="root-integration-grid">{Object.entries(integrations).map(([name, value]) => <article key={name}><HiOutlineCloud /><h2>{name}</h2><strong>{value.configured ? "Configured" : "Needs configuration"}</strong><DataTable rows={[value]} />{name === "railway" && value.configured ? <button onClick={() => setModal({ type: "integration", data: { action: "railway_restart" } })}>Restart deployment</button> : null}{name === "vercel" && value.configured ? <button onClick={() => setModal({ type: "integration", data: { action: "vercel_redeploy" } })}>Redeploy frontend</button> : null}</article>)}</section> : null}
			</div>
		</main>
		{modal ? <RootModal modal={modal} close={() => setModal(null)} action={async (type, data) => {
			if (type === "admin") await guard(async () => { await saveRootAdmin(data); setAdmins((await getRootAdmins()).admins); setModal(null); toast.success("Administrator saved.") })
			if (type === "ticket") await guard(async () => { await updateRootSupport(data); setTickets((await getRootSupport()).tickets); setModal(null); toast.success("Ticket updated.") })
			if (type === "integration") await guard(async () => { await runRootIntegrationAction(data); setModal(null); toast.success("Infrastructure action requested.") })
			if (type === "setting") await guard(async () => { const result = await saveRootSetting(data.settingId, data.values); setConfig((current) => ({ ...current, [data.settingId === "academic_cycle" ? "academicCycle" : data.settingId]: result.data })); setModal(null); toast.success(data.settingId === "academic_cycle" ? "Academic cycle activated." : "Portal controls updated.") })
			if (type === "sql-maintenance") await guard(async () => { await executeRootSqlMaintenance(data.id); setModal(null); toast.success("Approved database maintenance completed.") })
			if (type === "revoke") await guard(async () => { await revokeRootDevice(data.id); toast.success("Trusted device revoked.") })
			if (type === "revoke-session") await guard(async () => { await revokeRootSession(data.id); toast.success("Root session revoked.") })
			if (type === "reauth") {
				try {
					await reauthenticateRoot(data.password)
					const retry = modal.retry
					setModal(null)
					toast.success("Identity confirmed for 15 minutes.")
					if (retry) await guard(retry)
				} catch (error) { toast.error(error.message || "Root identity confirmation failed.") }
			}
		}} /> : null}
	</div>
}

function SettingsCard({ title, values, fields, onSave }) {
	const [form, setForm] = useState(values || {})
	return <article className="root-panel"><h2>{title}</h2><div className="root-toggle-list">{fields.map((field) => <label key={field}><span>{field.replace(/([A-Z])/g, " $1")}</span><input type="checkbox" checked={form[field] !== false} onChange={(event) => setForm({ ...form, [field]: event.target.checked })} /></label>)}</div><button onClick={() => onSave(form)}>Save controls</button></article>
}
function CycleCard({ value, onSave }) {
	const [form, setForm] = useState(value || {})
	return <article className="root-panel"><h2>Academic cycle</h2><p>Activation is immediate. Historical records remain unchanged.</p><label>Academic year<input value={form.academicYear || ""} onChange={(event) => setForm({ ...form, academicYear: event.target.value })} placeholder="2026-2027" /></label><label>Semester<select value={form.semester || "1ST"} onChange={(event) => setForm({ ...form, semester: event.target.value })}><option>1ST</option><option>2ND</option></select></label><button onClick={() => onSave(form)}>Activate cycle</button></article>
}
function BrandingCard({ value, versions, onUpload, onSaveDraft, onPublish }) {
	const [form, setForm] = useState(value || {})
	const upload = async (field, file) => { if (!file) return; try { const result = await onUpload(file); setForm((current) => ({ ...current, [field]: result.url })); toast.success(`${field === "logoUrl" ? "Logo" : "Favicon"} uploaded to the draft.`) } catch (error) { toast.error(error.message) } }
	return <section className="root-panel root-branding"><header><div><h2>Global brand</h2><p>Save a draft, review its preview, then publish or roll back to a prior version.</p></div><div className="root-brand-preview" style={{ background: form.primaryColor, fontFamily: form.fontFamily }}>{form.logoUrl ? <img src={form.logoUrl} alt="Draft logo" /> : null}<strong>{form.productName || "BulsuScholar"}</strong></div></header><div className="root-form-grid"><label>Product name<input value={form.productName || ""} onChange={(event) => setForm({ ...form, productName: event.target.value })} /></label><label>Font family<select value={form.fontFamily || "Inter"} onChange={(event) => setForm({ ...form, fontFamily: event.target.value })}><option>Inter</option><option>Segoe UI</option><option>Arial</option><option>Georgia</option></select></label><label>Primary color<input type="color" value={form.primaryColor || "#006b3c"} onChange={(event) => setForm({ ...form, primaryColor: event.target.value })} /></label><label>Accent color<input type="color" value={form.accentColor || "#16a34a"} onChange={(event) => setForm({ ...form, accentColor: event.target.value })} /></label><label>Logo image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload("logoUrl", event.target.files?.[0])} /></label><label>Favicon image<input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon" onChange={(event) => upload("faviconUrl", event.target.files?.[0])} /></label><label className="wide">Maintenance message<textarea value={form.maintenanceMessage || ""} onChange={(event) => setForm({ ...form, maintenanceMessage: event.target.value })} /></label></div><button onClick={() => onSaveDraft(form)}>Save Draft</button><h3>Version history</h3><div className="root-device-list">{(versions || []).map((version) => <div key={version.id}><span><strong>{version.status}</strong><small>{formatDate(version.published_at || version.created_at)}</small></span><button disabled={version.status === "published"} onClick={() => onPublish(version.id)}>{version.status === "archived" ? "Roll Back" : "Publish"}</button></div>)}</div></section>
}

function RootModal({ modal, close, action }) {
	const [form, setForm] = useState(modal.data || {})
	const [showDiscard, setShowDiscard] = useState(false)
	const [devices, setDevices] = useState([])
	const [sessions, setSessions] = useState([])
	const [currentSessionId, setCurrentSessionId] = useState("")
	const [securityBusy, setSecurityBusy] = useState(false)
	const [newRecoveryCodes, setNewRecoveryCodes] = useState([])
	const isDirty = ["admin", "ticket", "integration"].includes(modal.type) && JSON.stringify(form) !== JSON.stringify(modal.data || {})
	const requestClose = () => isDirty ? setShowDiscard(true) : close()
	useEffect(() => {
		if (modal.type !== "security") return
		Promise.all([getRootDevices(), getRootSessions()]).then(([deviceResult, sessionResult]) => {
			setDevices(deviceResult.devices || [])
			setSessions(sessionResult.sessions || [])
			setCurrentSessionId(sessionResult.currentSessionId || "")
		}).catch((error) => toast.error(error.message))
	}, [modal.type])
	const changeSecurityPassword = async () => {
		if (form.newPassword !== form.confirmPassword) return toast.error("Passwords do not match.")
		setSecurityBusy(true)
		try {
			await updateRootPassword(form.currentPassword || "", form.newPassword || "")
			setForm({ ...form, currentPassword: "", newPassword: "", confirmPassword: "" })
			toast.success("Root password changed. Other sessions were revoked.")
		} catch (error) { toast.error(error.message) } finally { setSecurityBusy(false) }
	}
	const regenerateCodes = async () => {
		setSecurityBusy(true)
		try {
			await reauthenticateRoot(form.currentPassword || "")
			const result = await regenerateRootRecoveryCodes()
			setNewRecoveryCodes(result.recoveryCodes || [])
			toast.success("Recovery codes regenerated. Previous codes no longer work.")
		} catch (error) { toast.error(error.message) } finally { setSecurityBusy(false) }
	}
	return <div className="root-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}><section className="root-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={requestClose}><HiX /></button>
		{modal.type === "admin" ? <><h2>{form.adminId ? "Edit Administrator" : "Add Administrator"}</h2><div className="root-form-grid"><label>User ID<input value={form.adminId || ""} disabled={Boolean(modal.data?.adminId)} onChange={(event) => setForm({ ...form, adminId: event.target.value })} /></label><label>Full name<input value={form.fullName || ""} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label><label>Email<input type="email" value={form.email || ""} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Role<select value={form.role || "full_admin"} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="full_admin">Full Admin</option><option value="student_reviewer">Student Reviewer</option><option value="grantor_manager">Grantor Manager</option><option value="reports_viewer">Reports Viewer</option></select></label><label>{modal.data?.adminId ? "New temporary password (optional)" : "Temporary password"}<input type="password" value={form.temporaryPassword || ""} onChange={(event) => setForm({ ...form, temporaryPassword: event.target.value })} /></label><label className="check"><input type="checkbox" checked={form.active !== false} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active account</label></div><footer><button onClick={close}>Cancel</button><button className="primary" onClick={() => action("admin", form)}>Save Administrator</button></footer></> : null}
		{modal.type === "ticket" ? <><h2>Support Ticket</h2><p>{form.message}</p><div className="root-form-grid"><label>Status<select value={form.status || "open"} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label><label>Priority<select value={form.priority || "normal"} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></label><label className="wide">Internal notes<textarea value={form.internalNotes || ""} onChange={(event) => setForm({ ...form, internalNotes: event.target.value })} /></label><label className="wide">Reply by email<textarea value={form.reply || ""} onChange={(event) => setForm({ ...form, reply: event.target.value })} /></label></div><footer><button onClick={close}>Cancel</button><button className="primary" onClick={() => action("ticket", { ticketId: form.id, ...form })}>Save Ticket</button></footer></> : null}
		{modal.type === "security" ? <><h2>Root Security</h2><p>Manage the owner credential, recovery access, trusted devices, and sessions.</p><div className="root-security-section"><h3>Change password</h3><div className="root-form-grid"><label>Current password<input type="password" value={form.currentPassword || ""} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} /></label><label>New password<input type="password" value={form.newPassword || ""} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} /></label><label>Confirm new password<input type="password" value={form.confirmPassword || ""} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} /></label></div><button className="primary" disabled={securityBusy} onClick={changeSecurityPassword}>Change Password</button></div><div className="root-security-section"><h3>Recovery codes</h3><p>Confirm the current password, then generate a replacement set. Each code works once.</p><button disabled={securityBusy || !form.currentPassword} onClick={regenerateCodes}>Regenerate Codes</button>{newRecoveryCodes.length ? <code className="root-code-list">{newRecoveryCodes.join("\n")}</code> : null}</div><div className="root-security-section"><h3>Trusted devices</h3><div className="root-device-list">{devices.map((device) => <div key={device.id}><span><strong>{device.label}</strong><small>{formatDate(device.last_used_at)} · expires {formatDate(device.expires_at)}</small></span><button onClick={async () => { await revokeRootDevice(device.id); setDevices((rows) => rows.filter((row) => row.id !== device.id)); toast.success("Trusted device revoked.") }}>Revoke</button></div>)}</div>{!devices.length ? <div className="root-empty">No trusted devices.</div> : null}</div><div className="root-security-section"><h3>Active sessions</h3><div className="root-device-list">{sessions.map((session) => <div key={session.id}><span><strong>{session.id === currentSessionId ? "Current session" : "Root session"}</strong><small>{formatDate(session.last_used_at)} · {session.revoked_at ? "revoked" : `expires ${formatDate(session.expires_at)}`}</small></span>{session.id !== currentSessionId && !session.revoked_at ? <button onClick={async () => { await revokeRootSession(session.id); setSessions((rows) => rows.map((row) => row.id === session.id ? { ...row, revoked_at: new Date().toISOString() } : row)); toast.success("Root session revoked.") }}>Revoke</button> : null}</div>)}</div></div><footer><button onClick={close}>Close</button></footer></> : null}
		{modal.type === "reauth" ? <><h2>Confirm Root Identity</h2><p>Enter the current root password to authorize this sensitive operation for 15 minutes.</p><label>Current password<input type="password" autoFocus value={form.password || ""} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label><footer><button onClick={close}>Cancel</button><button className="primary" onClick={() => action("reauth", form)} disabled={!form.password}>Confirm and Continue</button></footer></> : null}
		{modal.type === "integration" ? <><h2>Confirm Infrastructure Action</h2><p>This operation is audited and may briefly interrupt service.</p>{form.action === "railway_restart" ? <label>Railway deployment ID<input value={form.deploymentId || ""} onChange={(event) => setForm({ ...form, deploymentId: event.target.value })} /></label> : null}<footer><button onClick={close}>Cancel</button><button className="danger" onClick={() => action("integration", form)}>Confirm</button></footer></> : null}
		{modal.type === "setting" ? <><h2>{form.settingId === "academic_cycle" ? "Activate Academic Cycle" : "Apply Portal Controls"}</h2><p>{form.settingId === "academic_cycle" ? `This immediately makes ${form.values?.academicYear || "the selected year"}-${form.values?.semester || "semester"} authoritative for eligibility and current-cycle documents. Historical records remain unchanged.` : form.values?.maintenanceMode ? "Maintenance mode signs normal users out and blocks non-root portal operations until it is disabled." : "These controls take effect across student, grantor, and normal-admin portals."}</p><DataTable rows={[form.values || {}]} /><footer><button onClick={close}>Cancel</button><button className="danger" onClick={() => action("setting", form)}>Confirm Change</button></footer></> : null}
		{modal.type === "sql-maintenance" ? <><h2>Confirm Database Maintenance</h2><p>{form.label}. This reviewed operation is recorded in the immutable root audit.</p><footer><button onClick={close}>Cancel</button><button className="danger" onClick={() => action("sql-maintenance", form)}>Execute Operation</button></footer></> : null}
	</section>{showDiscard ? <div className="root-discard-backdrop" onMouseDown={(event) => event.stopPropagation()}><section className="root-discard-dialog"><h2>Discard unsaved changes?</h2><p>The information entered in this dialog will be lost.</p><footer><button onClick={() => setShowDiscard(false)}>Keep Editing</button><button className="danger" onClick={close}>Discard</button></footer></section></div> : null}</div>
}
