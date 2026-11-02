import { useRef, useState } from "react"
import { HiOutlineCheck, HiOutlinePencil, HiX } from "react-icons/hi"
import "../css/AdminRosterGrantorSelect.css"

const nameKey = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

export default function AdminRosterGrantorSelect({ grantors, value, onChange, disabled = false }) {
	const [error, setError] = useState("")
	const inputRef = useRef(null)
	const typed = value.mode === "new"
	const name = typed ? value.name : ""
	const update = (next) => { setError(""); onChange(next) }
	const confirm = () => {
		const clean = name.trim().replace(/\s+/g, " ")
		if (clean.length < 2 || !nameKey(clean)) { setError("Enter a grantor name with at least 2 characters."); return }
		if (grantors.some((g) => [g.name, g.providerName, g.grantorName, g.displayName, g.organization,
			[g.fname, g.mname, g.lname].filter(Boolean).join(" ")].some((n) => n && nameKey(n) === nameKey(clean)))) {
			setError("This grantor already exists. Clear the name and select it from the list."); return
		}
		update({ mode: "new", name: clean, confirmed: true })
	}
	return <div className="admin-roster-grantor" aria-label="Grantor for all imported rows">
		<div className="admin-roster-grantor-fields">
			<label className="admin-roster-grantor-field">
				<span>Fallback Grantor</span>
				<select aria-label="Fallback Grantor" value={typed ? "" : value.grantorId || ""}
					disabled={disabled || Boolean(name)} onChange={(e) => update({ mode: "existing", grantorId: e.target.value })}>
					<option value="">Select grantor</option>
					{grantors.map((g) => {
						const inactive = g.archived === true || ["inactive", "archived", "disabled"].includes(String(g.status || "").toLowerCase())
						return <option key={g.id} value={g.id} disabled={inactive}>{g.name || g.providerName || g.id}{inactive ? " (inactive)" : ""}</option>
					})}
				</select>
			</label>
			<div className="admin-roster-grantor-field">
				<label htmlFor="admin-roster-new-grantor">New Grantor Name</label>
				<div className={`admin-roster-grantor-entry${value.confirmed ? " is-confirmed" : ""}`}>
					<input id="admin-roster-new-grantor" ref={inputRef} value={name} maxLength={160} placeholder="Enter a grantor not in the list"
						disabled={disabled || (!typed && Boolean(value.grantorId))} readOnly={Boolean(value.confirmed)} aria-invalid={Boolean(error)} aria-describedby={error ? "admin-roster-grantor-error" : undefined}
						onChange={(e) => update(e.target.value ? { mode: "new", name: e.target.value, confirmed: false } : { mode: "existing", grantorId: "" })}
						onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirm() } }} />
					{typed && name ? <div className="admin-roster-grantor-icons">
						<button type="button" disabled={disabled} title={value.confirmed ? "Edit grantor name" : "Confirm grantor name"} aria-label={value.confirmed ? "Edit grantor name" : "Confirm grantor name"}
							onClick={() => { if (value.confirmed) { update({ ...value, confirmed: false }); inputRef.current?.focus() } else confirm() }}>
							{value.confirmed ? <HiOutlinePencil /> : <HiOutlineCheck />}
						</button>
						<button type="button" disabled={disabled} title="Clear grantor name" aria-label="Clear grantor name" onClick={() => update({ mode: "existing", grantorId: "" })}><HiX /></button>
					</div> : null}
				</div>
			</div>
		</div>
		{error ? <p id="admin-roster-grantor-error" role="alert">{error}</p> : null}
		{value.confirmed ? <p className="admin-roster-grantor-confirmed"><HiOutlineCheck aria-hidden="true" /> {name}</p> : null}
	</div>
}
