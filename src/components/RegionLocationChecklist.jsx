import { useMemo, useState } from "react"
import { HiChevronDown, HiOutlineLocationMarker, HiX } from "react-icons/hi"
import { REGION_III_LOCATION_GROUPS } from "../data/philippineLocations"

const locationKey = (province, municipality) => `${province}\u0000${municipality}`

export default function RegionLocationChecklist({ value = [], onChange, disabled = false, idPrefix = "region-scope" }) {
	const selectedKeys = useMemo(
		() => new Set(value.map((item) => locationKey(item.province, item.municipality))),
		[value],
	)
	const selectedByProvince = useMemo(() => value.reduce((groups, item) => {
		if (!groups[item.province]) groups[item.province] = []
		groups[item.province].push(item.municipality)
		return groups
	}, {}), [value])
	const [expanded, setExpanded] = useState(null)
	const openProvinces = expanded ?? new Set(value.map((item) => item.province))

	const toggleExpanded = (province) => {
		setExpanded((current) => {
			const next = new Set(current ?? value.map((item) => item.province))
			if (next.has(province)) next.delete(province)
			else next.add(province)
			return next
		})
	}

	const toggleLocation = (province, municipality) => {
		const key = locationKey(province, municipality)
		if (selectedKeys.has(key)) {
			onChange(value.filter((item) => locationKey(item.province, item.municipality) !== key))
			return
		}
		onChange([...value, { province, municipality }])
	}

	return (
		<div className={`admin-region-scope ${disabled ? "is-disabled" : ""}`}>
			<div className="admin-region-scope-head">
				<div><HiOutlineLocationMarker aria-hidden /><span><strong>Approved Region III locations</strong><small>Select each city or municipality the grantor serves.</small></span></div>
				<b>{value.length} selected</b>
			</div>
			{value.length > 0 ? (
				<div className="admin-region-scope-summary" aria-label="Selected locations">
					{Object.entries(selectedByProvince).map(([province, municipalities]) => (
						<div key={province}><strong>{province}</strong><span>{municipalities.map((municipality) => (
							<button key={municipality} type="button" disabled={disabled} onClick={() => toggleLocation(province, municipality)} title={`Remove ${municipality}, ${province}`}>
								{municipality}<HiX aria-hidden />
							</button>
						))}</span></div>
					))}
				</div>
			) : <p className="admin-region-scope-empty">No locations selected.</p>}
			<div className="admin-region-scope-groups">
				{REGION_III_LOCATION_GROUPS.map(({ province, municipalities }) => {
					const isOpen = openProvinces.has(province)
					const selectedCount = selectedByProvince[province]?.length || 0
					return (
						<section key={province} className={isOpen ? "is-open" : ""}>
							<button type="button" className="admin-region-scope-province" aria-expanded={isOpen} aria-controls={`${idPrefix}-${province.replace(/\s+/g, "-").toLowerCase()}`} onClick={() => toggleExpanded(province)}>
								<span><strong>{province}</strong><small>{selectedCount} of {municipalities.length} selected</small></span><HiChevronDown aria-hidden />
							</button>
							{isOpen ? <div id={`${idPrefix}-${province.replace(/\s+/g, "-").toLowerCase()}`} className="admin-region-scope-options">
								{municipalities.map((municipality) => {
									const checked = selectedKeys.has(locationKey(province, municipality))
									return <label key={municipality} className={checked ? "is-selected" : ""}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleLocation(province, municipality)} /><span>{municipality}</span></label>
								})}
							</div> : null}
						</section>
					)
				})}
			</div>
		</div>
	)
}
