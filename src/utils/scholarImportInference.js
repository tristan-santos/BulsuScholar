import { PROVINCES, getCitiesByProvince } from "../data/philippineLocations.js"

const FIELD_ALIASES = {
	studentId: ["student id", "student number", "student no", "student no.", "student num", "school id"],
	fullName: ["full name", "student name", "scholar name", "name"],
	fname: ["first name", "firstname", "fname", "given name"],
	mname: ["middle name", "middlename", "mname", "middle initial"],
	lname: ["last name", "lastname", "lname", "surname", "family name"],
	email: ["email", "email address", "e-mail"],
	cpNumber: ["contact number", "contact no", "cp number", "phone", "mobile", "mobile number"],
	course: ["course", "degree", "academic program"],
	yearLevel: ["year", "year level", "yearlevel", "level"],
	scholarshipTitle: ["scholarship", "scholarship title", "scholarship program"],
	street: ["street", "street subdivision", "street/subdivision", "additional address"],
	barangay: ["barangay", "baranggay", "brgy"],
	city: ["city", "municipality", "city municipality", "city/municipality"],
	province: ["province"],
	postalCode: ["postal code", "zip code", "zipcode"],
	status: ["status", "record status"],
	notes: ["notes", "remarks", "comment"],
}

const COMMON_GIVEN_NAMES = new Set([
	"aaron", "alex", "alexander", "andrea", "angel", "anna", "anthony", "bea", "benjamin", "carlo",
	"carol", "christian", "christine", "daniel", "david", "emerson", "emily", "francis", "ian", "james",
	"jan", "jane", "jasmine", "jerry", "john", "johnvher", "jose", "joseph", "joshua", "juan", "kathleen",
	"kim", "kristine", "maria", "mark", "mary", "michael", "michelle", "paolo", "paula", "princess",
	"rafael", "robert", "sarah", "tristan", "veejay", "vincent",
])

const COMMON_SURNAMES = new Set([
	"aguilar", "aquino", "bautista", "campbell", "castillo", "castro", "cruz", "dela cruz", "delacruz",
	"diaz", "fernandez", "flores", "garcia", "gonzales", "gutierrez", "hernandez", "lim", "lopez", "mendoza",
	"navarro", "nguyen", "ortiz", "perez", "ramirez", "reyes", "rivera", "rodriguez", "rogers", "santos",
	"torres", "valderama", "villarama", "wilson",
])

const normalize = (value = "") => {
	const normalized = String(value ?? "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
	const aliases = { baliwag: "baliuag" }
	return aliases[normalized] || normalized
}

const cleanCell = (value) => String(value ?? "").trim()

const PROVINCE_LOOKUP = new Map(PROVINCES.map((province) => [normalize(province), province]))
const CITY_LOOKUP = new Map()
PROVINCES.forEach((province) => {
	getCitiesByProvince(province).forEach((city) => {
		const key = normalize(city)
		if (!CITY_LOOKUP.has(key)) CITY_LOOKUP.set(key, { city, province })
	})
})

function ratio(values, predicate) {
	const populated = values.map(cleanCell).filter(Boolean)
	if (!populated.length) return 0
	return populated.filter(predicate).length / populated.length
}

function isSeparatorOnlyColumn(values = []) {
	const populated = values.map(cleanCell).filter(Boolean)
	return populated.length > 0 && populated.every((value) => /^[\s\-_/]+$/.test(value))
}

function headerScore(header, field) {
	const normalizedHeader = normalize(header)
	if (!normalizedHeader) return 0
	const aliases = FIELD_ALIASES[field] || []
	if (aliases.some((alias) => normalize(alias) === normalizedHeader)) return 150
	if (aliases.some((alias) => normalizedHeader.includes(normalize(alias)))) return 105
	return 0
}

function contentScore(values, field) {
	const populated = values.map(cleanCell).filter(Boolean)
	if (!populated.length) return 0
	const scores = {
		studentId: ratio(populated, (value) => /^(?:201\d|202[0-6])\d{6}$/.test(value.replace(/\D/g, ""))) * 125,
		email: ratio(populated, (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) * 110,
		cpNumber: ratio(populated, (value) => /^(?:09\d{9}|9\d{9})$/.test(value.replace(/\D/g, ""))) * 90,
		course: ratio(populated, (value) => /^(?:bachelor\b|bs\b|bsc\b|beed\b|bsit\b|bsee\b|bscpe\b)/i.test(value.trim())) * 100,
		yearLevel: ratio(populated, (value) => /^(?:year\s*)?[1-4](?:st|nd|rd|th)?(?:\s*year)?$/i.test(value.trim())) * 95,
		postalCode: ratio(populated, (value) => /^\d{4}$/.test(value.trim())) * 55,
		province: ratio(populated, (value) => PROVINCE_LOOKUP.has(normalize(value))) * 110,
		city: ratio(populated, (value) => CITY_LOOKUP.has(normalize(value))) * 105,
		status: ratio(populated, (value) => /^(?:active|inactive|pending|archived|rejected)$/i.test(value.trim())) * 80,
		fname: ratio(populated, (value) => {
			const parts = normalize(value).split(" ").filter(Boolean)
			return parts.length <= 2 && parts.some((part) => COMMON_GIVEN_NAMES.has(part))
		}) * 55,
		mname: ratio(populated, (value) => /^[a-z](?:\.)?$/i.test(value.trim()) || COMMON_GIVEN_NAMES.has(normalize(value))) * 38,
		lname: ratio(populated, (value) => COMMON_SURNAMES.has(normalize(value))) * 55,
		fullName: ratio(populated, (value) => {
			const parts = normalize(value).split(" ").filter(Boolean)
			return parts.length >= 2 && parts.length <= 6 && parts.every((part) => /^[a-z]+$/.test(part))
		}) * 62,
	}
	return scores[field] || 0
}

function looksLikeHeaderRow(row = [], allowedFields = []) {
	const aliasHits = row.filter((cell) => allowedFields.some((field) => headerScore(cell, field) >= 105)).length
	return aliasHits >= Math.min(2, Math.max(1, row.filter(Boolean).length))
}

function isNameLikeColumn(values = []) {
	return ratio(values, (value) => {
		const parts = normalize(value).split(" ").filter(Boolean)
		return parts.length >= 1 && parts.length <= 3 && parts.every((part) => /^[a-z]+$/.test(part) || /^[a-z]$/.test(part))
	}) >= 0.7
}

function parseCombinedAddress(value = "") {
	const raw = cleanCell(value)
	if (!raw) return { street: "", barangay: "", city: "", province: "" }
	const parts = raw.split(/,|\|/).map((part) => part.trim()).filter(Boolean)
	let province = ""
	let city = ""
	let provinceIndex = -1
	let cityIndex = -1
	parts.forEach((part, index) => {
		if (PROVINCE_LOOKUP.has(normalize(part))) {
			province ||= PROVINCE_LOOKUP.get(normalize(part))
			provinceIndex = index
		}
		if (!city && CITY_LOOKUP.has(normalize(part))) {
			const match = CITY_LOOKUP.get(normalize(part))
			city = match.city
			cityIndex = index
			if (!province) province = match.province
		}
	})
	if (!province || !city) {
		const normalizedRaw = normalize(raw)
		const cityEntries = [...CITY_LOOKUP.entries()].sort((left, right) => right[0].length - left[0].length)
		for (const [key, match] of cityEntries) {
			const cityPattern = new RegExp(`(?:^|\\s)${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?:$|\\s)`)
			if (!city && cityPattern.test(normalizedRaw)) {
				city = match.city
				province ||= match.province
			}
		}
	}
	const excluded = new Set([provinceIndex, cityIndex].filter((index) => index >= 0))
	const addressParts = parts.filter((_, index) => !excluded.has(index) && !/^\d{4}$/.test(parts[index]))
	const barangay = addressParts.length >= 2 ? addressParts[addressParts.length - 1] : ""
	const street = addressParts.length >= 2 ? addressParts.slice(0, -1).join(", ") : addressParts[0] || raw
	return { street, barangay, city, province }
}

function expandCombinedAddress(headers, rows, allowedFields) {
	const normalizedHeaders = headers.map(normalize)
	const hasSeparateAddress = ["province", "city", "barangay"].some((field) =>
		normalizedHeaders.some((header) => (FIELD_ALIASES[field] || []).some((alias) => normalize(alias) === header)),
	)
	let addressIndex = normalizedHeaders.findIndex((header) => header === "address" || header === "complete address" || header === "full address")
	if (addressIndex < 0) {
		addressIndex = headers.findIndex((_, index) => {
			const values = rows.map((row) => row[index])
			return ratio(values, (value) => {
				const parsed = parseCombinedAddress(value)
				return cleanCell(value).includes(",") && Boolean(parsed.city && parsed.province)
			}) >= 0.7
		})
	}
	if (hasSeparateAddress || addressIndex < 0) return { headers, rows }
	const parsed = rows.map((row) => parseCombinedAddress(row[addressIndex]))
	if (!parsed.some((address) => address.city || address.province)) return { headers, rows }
	const derivedFields = ["street", "barangay", "city", "province"].filter((field) => allowedFields.includes(field))
	return {
		headers: [...headers, ...derivedFields.map((field) => FIELD_ALIASES[field][0])],
		rows: rows.map((row, index) => [...row, ...derivedFields.map((field) => parsed[index][field] || "")]),
	}
}

export function prepareScholarImport(rawRows = [], options = {}) {
	const allowedFields = (options.fields || Object.keys(FIELD_ALIASES)).map((field) => field.id || field.value || field)
	let rows = rawRows
		.map((row) => (Array.isArray(row) ? row.map(cleanCell) : []))
		.filter((row) => row.some(Boolean))
	if (!rows.length) return { headers: [], rows: [], mapping: [], ignoredColumnIndexes: [] }

	const hasHeader = options.headerMode === true || (options.headerMode !== false && looksLikeHeaderRow(rows[0], allowedFields))
	let headers = hasHeader ? rows[0] : new Array(Math.max(...rows.map((row) => row.length))).fill("")
	if (hasHeader) rows = rows.slice(1)
	const columnCount = Math.max(headers.length, ...rows.map((row) => row.length), 0)
	headers = Array.from({ length: columnCount }, (_, index) => headers[index] || `Column ${index + 1}`)
	rows = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] || ""))

	const ignoredColumnIndexes = []
	for (let index = 0; index < columnCount; index += 1) {
		if (isSeparatorOnlyColumn(rows.map((row) => row[index]))) ignoredColumnIndexes.push(index)
	}
	if (ignoredColumnIndexes.length) {
		headers = headers.filter((_, index) => !ignoredColumnIndexes.includes(index))
		rows = rows.map((row) => row.filter((_, index) => !ignoredColumnIndexes.includes(index)))
	}

	;({ headers, rows } = expandCombinedAddress(headers, rows, allowedFields))
	const candidates = []
	headers.forEach((header, columnIndex) => {
		const values = rows.map((row) => row[columnIndex])
		allowedFields.forEach((field) => {
			const score = headerScore(header, field) + contentScore(values, field)
			if (score >= 52) candidates.push({ columnIndex, field, score })
		})
	})
	candidates.sort((left, right) => right.score - left.score)
	const mapping = new Array(headers.length).fill("")
	const usedFields = new Set()
	const usedColumns = new Set()
	candidates.forEach(({ columnIndex, field }) => {
		if (usedFields.has(field) || usedColumns.has(columnIndex)) return
		mapping[columnIndex] = field
		usedFields.add(field)
		usedColumns.add(columnIndex)
	})

	const studentIdColumn = mapping.indexOf("studentId")
	const courseColumn = mapping.indexOf("course")
	if (studentIdColumn >= 0 && courseColumn > studentIdColumn + 1) {
		const possibleNameColumns = []
		for (let index = studentIdColumn + 1; index < courseColumn; index += 1) {
			if (isNameLikeColumn(rows.map((row) => row[index]))) possibleNameColumns.push(index)
		}
		if (possibleNameColumns.length >= 2 && possibleNameColumns.length <= 3) {
			const nameFields = possibleNameColumns.length === 3 ? ["fname", "mname", "lname"] : ["fname", "lname"]
			possibleNameColumns.forEach((columnIndex, index) => {
				const field = nameFields[index]
				const previousColumn = mapping.indexOf(field)
				if (previousColumn >= 0 && previousColumn !== columnIndex) mapping[previousColumn] = ""
				mapping[columnIndex] = field
			})
		}
	}

	return { headers, rows, mapping, ignoredColumnIndexes, hasHeader }
}

export function isImportFieldAlreadyMapped(mapping = [], field = "", currentIndex = -1) {
	return Boolean(field) && mapping.some((mappedField, index) => index !== currentIndex && mappedField === field)
}
