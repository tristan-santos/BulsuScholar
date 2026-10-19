import { useMemo, useState } from "react"
import { HiChevronDown, HiOutlineLocationMarker, HiSearch, HiX } from "react-icons/hi"
import {
	PROVINCES,
	REGION_III_LOCATION_GROUPS,
	REGION_III_PROVINCES,
	getCitiesByProvince,
} from "../data/philippineLocations"

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
	const [otherRegionsOpen, setOtherRegionsOpen] = useState(null)
	const [provinceSearch, setProvinceSearch] = useState("")
	const [selectedOtherProvince, setSelectedOtherProvince] = useState("")
	const [municipalitySearch, setMunicipalitySearch] = useState("")
	const otherProvinces = useMemo(
		() => PROVINCES.filter((province) => !REGION_III_PROVINCES.includes(province)),
		[],
	)
	const filteredOtherProvinces = useMemo(() => {
		const query = provinceSearch.trim().toLowerCase()
		return query ? otherProvinces.filter((province) => province.toLowerCase().includes(query)) : otherProvinces
	}, [otherProvinces, provinceSearch])
	const filteredOtherMunicipalities = useMemo(() => {
		if (!selectedOtherProvince) return []
		const query = municipalitySearch.trim().toLowerCase()
		const municipalities = getCitiesByProvince(selectedOtherProvince)
		return query ? municipalities.filter((municipality) => municipality.toLowerCase().includes(query)) : municipalities
	}, [municipalitySearch, selectedOtherProvince])
	const selectedOtherCount = value.filter((item) => !REGION_III_PROVINCES.includes(item.province)).length
	const isOtherRegionsOpen = otherRegionsOpen ?? selectedOtherCount > 0

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

	const chooseOtherProvince = (province) => {
		setSelectedOtherProvince(province)
		setProvinceSearch(province)
		setMunicipalitySearch("")
	}

	return (
		<div className={`admin-region-scope ${disabled ? "is-disabled" : ""}`}>
			<div className="admin-region-scope-head">
				<div><HiOutlineLocationMarker aria-hidden /><span><strong>Approved service locations</strong><small>Select Region III locations or search other regions.</small></span></div>
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
				<section className={`admin-region-scope-other ${isOtherRegionsOpen ? "is-open" : ""}`}>
					<button type="button" className="admin-region-scope-province" aria-expanded={isOtherRegionsOpen} aria-controls={`${idPrefix}-other-regions`} onClick={() => setOtherRegionsOpen(!isOtherRegionsOpen)}>
						<span><strong>Other regions</strong><small>{selectedOtherCount} selected</small></span><HiChevronDown aria-hidden />
					</button>
					{isOtherRegionsOpen ? <div id={`${idPrefix}-other-regions`} className="admin-region-scope-other-body">
						<div className="admin-region-scope-search">
							<label htmlFor={`${idPrefix}-province-search`}>Search province</label>
							<div><HiSearch aria-hidden /><input id={`${idPrefix}-province-search`} type="search" value={provinceSearch} disabled={disabled} onChange={(event) => { setProvinceSearch(event.target.value); setSelectedOtherProvince(""); setMunicipalitySearch("") }} placeholder="Type a province" autoComplete="off" /></div>
						</div>
						{!selectedOtherProvince ? <div className="admin-region-scope-search-results" role="listbox" aria-label="Other provinces">
							{filteredOtherProvinces.length ? filteredOtherProvinces.map((province) => <button key={province} type="button" role="option" aria-selected="false" disabled={disabled} onClick={() => chooseOtherProvince(province)}>{province}<small>{selectedByProvince[province]?.length || 0} selected</small></button>) : <p>No matching province.</p>}
						</div> : <>
							<div className="admin-region-scope-selected-province"><span>Province</span><strong>{selectedOtherProvince}</strong><button type="button" disabled={disabled} onClick={() => { setSelectedOtherProvince(""); setProvinceSearch(""); setMunicipalitySearch("") }}>Change</button></div>
							<div className="admin-region-scope-search">
								<label htmlFor={`${idPrefix}-municipality-search`}>Search city or municipality</label>
								<div><HiSearch aria-hidden /><input id={`${idPrefix}-municipality-search`} type="search" value={municipalitySearch} disabled={disabled} onChange={(event) => setMunicipalitySearch(event.target.value)} placeholder={`Search in ${selectedOtherProvince}`} autoComplete="off" /></div>
							</div>
							<div className="admin-region-scope-options admin-region-scope-options--other">
								{filteredOtherMunicipalities.length ? filteredOtherMunicipalities.map((municipality) => {
									const checked = selectedKeys.has(locationKey(selectedOtherProvince, municipality))
									return <label key={municipality} className={checked ? "is-selected" : ""}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleLocation(selectedOtherProvince, municipality)} /><span>{municipality}</span></label>
								}) : <p>No matching city or municipality.</p>}
							</div>
						</>}
					</div> : null}
				</section>
			</div>
		</div>
	)
}
