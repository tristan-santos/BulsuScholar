import { supabase } from "./supabaseClient"

export const TABLES = {
	admins: "admins",
	students: "students",
	pendingStudent: "pending_students",
	pending_students: "pending_students",
	soeRequests: "soe_requests",
	soeDownloads: "soe_downloads",
	announcements: "announcements",
	providers: "providers",
	grantorPortals: "grantor_portals",
	scholarshipApplications: "scholarship_applications",
	studentWarning: "student_warnings",
	systemLogs: "systemLogs",
}

const SUBCOLLECTION_TABLES = {
	"grantorPortals/scholars": "grantor_portal_scholars",
	"grantorPortals/applications": "grantor_portal_applications",
	"grantorPortals/announcements": "grantor_portal_announcements",
}

const COLLECTION_GROUP_TABLES = {
	scholars: "grantor_portal_scholars",
	applications: "grantor_portal_applications",
	announcements: "grantor_portal_announcements",
}

const randomId = () =>
	globalThis.crypto?.randomUUID?.() ||
	`${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

function tableForCollection(path = []) {
	if (path.length === 1) return TABLES[path[0]] || path[0]
	if (path.length === 3) {
		const key = `${path[0]}/${path[2]}`
		return SUBCOLLECTION_TABLES[key] || key.replace(/[^a-zA-Z0-9]+/g, "_")
	}
	throw new Error(`Unsupported collection path: ${path.join("/")}`)
}

function makeDateShim(value) {
	if (!value) return value
	if (typeof value === "object" && typeof value.toDate === "function") return value
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return {
		value,
		toDate: () => date,
		toString: () => String(value),
		toJSON: () => value,
	}
}

export function flattenRecord(row = {}) {
	const normalized = { ...(row.data || {}) }
	Object.entries(row).forEach(([key, value]) => {
		if (["id", "data", "created_at", "updated_at", "parent_id"].includes(key)) return
		if (value == null || value === "") return
		if (key === "first_name" && !normalized.fname) normalized.fname = value
		else if (key === "middle_name" && !normalized.mname) normalized.mname = value
		else if (key === "last_name" && !normalized.lname) normalized.lname = value
		else if (key === "year_level" && normalized.year == null) normalized.year = value
		else if (key === "contact_number" && !normalized.cpNumber) normalized.cpNumber = value
		else if (key === "user_type" && !normalized.userType) normalized.userType = value
		else if (key === "auth_user_id" && !normalized.authUserId) normalized.authUserId = value
		else if (!(key in normalized)) normalized[key] = value
	})
	Object.entries(normalized).forEach(([key, value]) => {
		if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
			normalized[key] = makeDateShim(value)
		}
	})
	return { id: row.id, ...normalized }
}

function buildDocSnapshot(ref, row) {
	const exists = Boolean(row)
	return {
		id: ref.id,
		ref,
		exists: () => exists,
		data: () => (exists ? flattenRecord(row) : undefined),
	}
}

function buildQuerySnapshot(ref, rows = []) {
	const docs = rows.map((row) => {
		const rowRef =
			ref.type === "collectionGroup"
				? {
						type: "doc",
						id: row.id,
						table: ref.table,
						parentId: row.parent_id || null,
						pathSegments: [ref.key, row.id],
						path: `${ref.key}/${row.id}`,
						parent: {
							id: ref.key,
							parent: row.parent_id ? { id: row.parent_id } : null,
						},
					}
				: doc(ref, row.id)
		return buildDocSnapshot(rowRef, row)
	})
	return {
		docs,
		empty: docs.length === 0,
		size: docs.length,
		forEach: (callback) => docs.forEach(callback),
	}
}

function applyDottedValue(target, key, value) {
	if (!key.includes(".")) {
		target[key] = value
		return
	}
	const parts = key.split(".").filter(Boolean)
	let cursor = target
	parts.slice(0, -1).forEach((part) => {
		if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
			cursor[part] = {}
		}
		cursor = cursor[part]
	})
	cursor[parts[parts.length - 1]] = value
}

function expandDottedKeys(payload = {}) {
	const next = {}
	Object.entries(payload || {}).forEach(([key, value]) => applyDottedValue(next, key, value))
	return next
}

function deepMerge(left = {}, right = {}) {
	const output = { ...(left || {}) }
	Object.entries(right || {}).forEach(([key, value]) => {
		if (
			value &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			!(value instanceof Date) &&
			output[key] &&
			typeof output[key] === "object" &&
			!Array.isArray(output[key])
		) {
			output[key] = deepMerge(output[key], value)
		} else {
			output[key] = value
		}
	})
	return output
}

function serializeValue(value) {
	if (value?.toJSON && value?.value) return value.value
	if (value instanceof Date) return value.toISOString()
	if (Array.isArray(value)) return value.map(serializeValue)
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeValue(child)]))
	}
	return value
}

function serializeData(data = {}) {
	return serializeValue(expandDottedKeys(data))
}

function applyFilters(builder, filters = []) {
	let next = builder
	filters.forEach((filter) => {
		const column = filter.field === "id" ? "id" : `data->>${filter.field}`
		if (filter.op === "==") next = next.eq(column, String(filter.value))
		else if (filter.op === "!=") next = next.neq(column, String(filter.value))
		else if (filter.op === "in") next = next.in(column, filter.value)
		else throw new Error(`Unsupported Supabase query operator: ${filter.op}`)
	})
	return next
}

function buildRelationalColumns(table, data = {}) {
	if (table === TABLES.students || table === TABLES.pendingStudent) {
		return {
			email: data.email || null,
			user_type: data.userType || "student",
			auth_user_id: data.authUserId || null,
			first_name: data.fname || null,
			middle_name: data.mname || null,
			last_name: data.lname || null,
			course: data.course || null,
			year_level: data.year != null ? String(data.year) : null,
			section: data.section || null,
			contact_number: data.cpNumber || null,
		}
	}
	if (table === TABLES.admins) {
		return {
			email: data.email || null,
			user_type: data.userType || "admin",
			first_name: data.fname || null,
			last_name: data.lname || null,
		}
	}
	if (table === TABLES.providers) {
		return {
			email: data.email || null,
			user_type: data.userType || "provider",
			name: data.name || data.providerName || null,
		}
	}
	return {}
}

function buildRow(table, id, data, parentId = null) {
	const row = {
		id,
		data,
		updated_at: new Date().toISOString(),
		...buildRelationalColumns(table, data),
	}
	if (parentId) row.parent_id = parentId
	return row
}

export function collection(dbOrRef, ...segments) {
	const basePath = Array.isArray(dbOrRef?.pathSegments) ? dbOrRef.pathSegments : []
	const pathSegments = [...basePath, ...segments.map(String)]
	const table = tableForCollection(pathSegments)
	const parentId = pathSegments.length === 3 ? pathSegments[1] : null
	return {
		type: "collection",
		pathSegments,
		path: pathSegments.join("/"),
		table,
		parentId,
		parentPath: pathSegments.slice(0, -1),
		filters: [],
	}
}

export function collectionGroup(db, key = "") {
	return {
		type: "collectionGroup",
		key,
		pathSegments: [key],
		path: key,
		table: COLLECTION_GROUP_TABLES[key] || key,
		filters: [],
	}
}

export function doc(dbOrCollection, ...segments) {
	if (dbOrCollection?.type === "collection") {
		const id = segments[0] ? String(segments[0]) : randomId()
		return {
			type: "doc",
			id,
			table: dbOrCollection.table,
			parentId: dbOrCollection.parentId,
			pathSegments: [...dbOrCollection.pathSegments, id],
			path: [...dbOrCollection.pathSegments, id].join("/"),
			parent: dbOrCollection,
		}
	}
	const pathSegments = segments.map(String)
	const id = pathSegments[pathSegments.length - 1]
	const collectionPath = pathSegments.slice(0, -1)
	const colRef = collection(null, ...collectionPath)
	return {
		type: "doc",
		id,
		table: colRef.table,
		parentId: colRef.parentId,
		pathSegments,
		path: pathSegments.join("/"),
		parent: colRef,
	}
}

export function where(field, op, value) {
	return { type: "where", field, op, value }
}

export function query(ref, ...constraints) {
	return {
		...ref,
		filters: [...(ref.filters || []), ...constraints.filter((item) => item?.type === "where")],
	}
}

export function serverTimestamp() {
	return new Date().toISOString()
}

export const Timestamp = {
	now: () => new Date().toISOString(),
	fromDate: (date) => new Date(date).toISOString(),
}

export async function getDoc(ref) {
	let request = supabase.from(ref.table).select("*").eq("id", ref.id).maybeSingle()
	if (ref.parentId) {
		request = supabase.from(ref.table).select("*").eq("id", ref.id).eq("parent_id", ref.parentId).maybeSingle()
	}
	const { data, error } = await request
	if (error) throw error
	return buildDocSnapshot(ref, data)
}

export async function getDocs(ref) {
	let request = supabase.from(ref.table).select("*")
	if (ref.parentId) request = request.eq("parent_id", ref.parentId)
	request = applyFilters(request, ref.filters || [])
	const { data, error } = await request
	if (error) throw error
	const rows = (data || []).map((row) => ({
		...row,
		data: { ...(row.data || {}), grantorId: row.parent_id || row.data?.grantorId },
	}))
	return buildQuerySnapshot(ref, rows)
}

export async function setDoc(ref, payload = {}, options = {}) {
	const nextData = serializeData(payload)
	let data = nextData
	if (options?.merge) {
		const current = await getDoc(ref)
		data = deepMerge(current.data?.() || {}, nextData)
		delete data.id
	}
	const row = buildRow(ref.table, ref.id, data, ref.parentId || null)
	const { error } = await supabase.from(ref.table).upsert(row, {
		onConflict: ref.parentId ? "parent_id,id" : "id",
	})
	if (error) throw error
}

export async function updateDoc(ref, payload = {}) {
	const current = await getDoc(ref)
	if (!current.exists()) throw new Error(`Document does not exist: ${ref.path}`)
	const existing = current.data() || {}
	delete existing.id
	await setDoc(ref, deepMerge(existing, serializeData(payload)))
}

export async function addDoc(collectionRef, payload = {}) {
	const ref = doc(collectionRef)
	await setDoc(ref, payload)
	return ref
}

export async function deleteDoc(ref) {
	let request = supabase.from(ref.table).delete().eq("id", ref.id)
	if (ref.parentId) request = request.eq("parent_id", ref.parentId)
	const { error } = await request
	if (error) throw error
}

export function writeBatch() {
	const operations = []
	return {
		set: (ref, payload, options) => operations.push(() => setDoc(ref, payload, options)),
		update: (ref, payload) => operations.push(() => updateDoc(ref, payload)),
		delete: (ref) => operations.push(() => deleteDoc(ref)),
		commit: async () => {
			for (const operation of operations) await operation()
		},
	}
}

export function onSnapshot(ref, onNext, onError) {
	let active = true
	const load = async () => {
		try {
			const snapshot = ref.type === "doc" ? await getDoc(ref) : await getDocs(ref)
			if (active) onNext(snapshot)
		} catch (error) {
			if (onError) onError(error)
			else console.error(error)
		}
	}
	void load()
	const channel = supabase
		.channel(`realtime:${ref.table}:${ref.path}:${randomId()}`)
		.on("postgres_changes", { event: "*", schema: "public", table: ref.table }, () => {
			void load()
		})
		.subscribe()
	return () => {
		active = false
		void supabase.removeChannel(channel)
	}
}

export async function getRecord(table, id, parentId = null) {
	const { data, error } = parentId
		? await supabase.from(table).select("*").eq("id", id).eq("parent_id", parentId).maybeSingle()
		: await supabase.from(table).select("*").eq("id", id).maybeSingle()
	if (error) throw error
	return data ? flattenRecord(data) : null
}

export async function recordExists(table, id) {
	const record = await getRecord(table, id)
	return Boolean(record)
}

export async function findRecordByDataField(table, field, value) {
	const normalizedValue = String(value || "").trim()
	if (!normalizedValue) return null
	const { data, error } = await supabase
		.from(table)
		.select("*")
		.eq(`data->>${field}`, normalizedValue)
		.limit(1)
		.maybeSingle()
	if (error) throw error
	return data ? flattenRecord(data) : null
}

export async function findStudentAccountByUniqueField(field, value) {
	const normalizedValue = String(value || "").trim()
	if (!normalizedValue) return null
	const tables = [TABLES.students, TABLES.pendingStudent]
	for (const table of tables) {
		const record = await findRecordByDataField(table, field, normalizedValue)
		if (record) return { table, record }
	}
	return null
}

export async function upsertStudent(studentId, fields = {}, options = {}) {
	const table = options.pending ? TABLES.pendingStudent : TABLES.students
	let data = serializeData(fields)
	if (options.merge) {
		const existing = await getRecord(table, studentId)
		data = deepMerge(existing || {}, data)
		delete data.id
	}
	const row = buildRow(table, studentId, data)
	const { error } = await supabase.from(table).upsert(row, { onConflict: "id" })
	if (error) throw error
}

export async function upsertProvider(providerId, fields = {}, options = {}) {
	let data = serializeData(fields)
	if (options.merge) {
		const existing = await getRecord(TABLES.providers, providerId)
		data = deepMerge(existing || {}, data)
		delete data.id
	}
	const row = buildRow(TABLES.providers, providerId, data)
	const { error } = await supabase.from(TABLES.providers).upsert(row, { onConflict: "id" })
	if (error) throw error
}

export async function upsertAdmin(adminId, fields = {}, options = {}) {
	let data = serializeData(fields)
	if (options.merge) {
		const existing = await getRecord(TABLES.admins, adminId)
		data = deepMerge(existing || {}, data)
		delete data.id
	}
	const row = buildRow(TABLES.admins, adminId, data)
	const { error } = await supabase.from(TABLES.admins).upsert(row, { onConflict: "id" })
	if (error) throw error
}

const ACCOUNT_TABLES = [
	{ type: "student", table: TABLES.students, label: "Student" },
	{ type: "admin", table: TABLES.admins, label: "Admin" },
	{ type: "provider", table: TABLES.providers, label: "Grantor" },
]

export async function findAccountById(id) {
	const results = await Promise.all(
		ACCOUNT_TABLES.map(async ({ type, table, label }) => {
			const record = await getRecord(table, id)
			return {
				exists: Boolean(record),
				type,
				table,
				label,
				data: record,
			}
		}),
	)
	return results.find((result) => result.exists) || null
}

export function getDatabase() {
	return supabase
}

export const db = supabase

export function getApp() {
	return supabase
}

export function getApps() {
	return [supabase]
}

export function initializeApp() {
	return supabase
}

export function getAuth() {
	return supabase.auth
}

export function onAuthStateChanged(auth, callback) {
	const run = async () => {
		const { data } = await supabase.auth.getUser()
		callback(data?.user || null)
	}
	void run()
	const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session?.user || null))
	return () => data?.subscription?.unsubscribe?.()
}
