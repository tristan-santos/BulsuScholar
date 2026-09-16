import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

const ROOT_ID = "Tristan@Root"
const CONFIRMATION = "DELETE_ALL_EXCEPT_ROOT"
const STORAGE_PAGE_SIZE = 1000
const STORAGE_DELETE_BATCH_SIZE = 100
const AUTO_RECREATED_TABLES = new Set(["request_metric_buckets"])

const RESET_TABLES = [
	"admin_settings",
	"studentNotifications",
	"grantorNotifications",
	"systemLogs",
	"student_document_usage",
	"student_warnings",
	"scholarship_applications",
	"grantor_portal_applications",
	"grantor_portal_announcements",
	"grantor_portal_scholars",
	"soe_downloads",
	"soe_requests",
	"announcements",
	"pending_students",
	"students",
	"grantor_portals",
	"providers",
	"admins",
	"support_ticket_messages",
	"support_feedback",
	"branding_versions",
	"request_metric_buckets",
	"root_sessions",
	"root_audit_logs",
]

function readEnvFile(path) {
	try {
		return readFileSync(path, "utf8")
	} catch {
		return ""
	}
}

function parseEnv(contents) {
	const values = {}
	for (const line of contents.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
		const separator = trimmed.indexOf("=")
		values[trimmed.slice(0, separator).trim()] = trimmed
			.slice(separator + 1)
			.trim()
			.replace(/^['"]|['"]$/g, "")
	}
	return values
}

function chunk(values, size) {
	const batches = []
	for (let index = 0; index < values.length; index += size) {
		batches.push(values.slice(index, index + size))
	}
	return batches
}

async function listAllAuthUsers(client) {
	const users = []
	for (let page = 1; ; page += 1) {
		const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 })
		if (error) throw error
		users.push(...data.users)
		if (data.users.length < 1000) return users
	}
}

async function listAllStorageObjects(client, bucket) {
	const objectPaths = []
	const folders = [""]
	const visited = new Set()

	while (folders.length > 0) {
		const prefix = folders.shift()
		if (visited.has(prefix)) continue
		visited.add(prefix)

		for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
			const { data, error } = await client.storage.from(bucket).list(prefix, {
				limit: STORAGE_PAGE_SIZE,
				offset,
				sortBy: { column: "name", order: "asc" },
			})
			if (error) throw error

			for (const item of data) {
				const path = prefix ? `${prefix}/${item.name}` : item.name
				if (item.id) objectPaths.push(path)
				else folders.push(path)
			}
			if (data.length < STORAGE_PAGE_SIZE) break
		}
	}

	return objectPaths
}

async function countRows(client, table) {
	const { count, error } = await client.from(table).select("*", { count: "exact", head: true })
	if (error) throw new Error(`${table}: ${error.message}`)
	return count ?? 0
}

async function verifySqlReset(client) {
	const nonemptyTables = []
	for (const table of RESET_TABLES) {
		const count = await countRows(client, table)
		if (count !== 0) nonemptyTables.push({ table, count })
	}

	const { data: configuration, error } = await client
		.from("system_configuration")
		.select("id,data")
		.in("id", ["portal", "academic_cycle", "branding"])
	if (error) throw error
	const portal = configuration.find((row) => row.id === "portal")
	const blockingTables = nonemptyTables.filter((item) => !AUTO_RECREATED_TABLES.has(item.table))
	const autoRecreatedTables = nonemptyTables.filter((item) => AUTO_RECREATED_TABLES.has(item.table))

	return {
		ready: blockingTables.length === 0 && configuration.length === 3 && portal?.data?.maintenanceMode === true,
		nonemptyTables,
		blockingTables,
		autoRecreatedTables,
		configurationCount: configuration.length,
		maintenanceEnabled: portal?.data?.maintenanceMode === true,
	}
}

const env = {
	...parseEnv(readEnvFile(resolve(".env"))),
	...process.env,
}
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
const storageBucket = env.VITE_SUPABASE_STORAGE_BUCKET || "bulsuscholar"
const execute = process.argv.includes("--execute")
const diagnose = process.argv.includes("--diagnose")

if (!supabaseUrl || !serviceRoleKey) {
	throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in the trusted local environment.")
}
if (execute && env.RESET_CONFIRMATION !== CONFIRMATION) {
	throw new Error(`Execution requires RESET_CONFIRMATION=${CONFIRMATION}.`)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
	auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const { data: roots, error: rootError } = await supabase
	.from("root_admins")
	.select("id,auth_user_id,active,login_code_hashes")
if (rootError) throw rootError
if (roots.length !== 1 || roots[0].id !== ROOT_ID || !roots[0].active || !roots[0].auth_user_id) {
	throw new Error("Reset aborted: Tristan@Root must be the only active root record and have an Auth identity.")
}
const rootCodeHashes = roots[0].login_code_hashes
if (
	!Array.isArray(rootCodeHashes)
	|| rootCodeHashes.length !== 10
	|| new Set(rootCodeHashes).size !== 10
	|| rootCodeHashes.some((value) => !/^[0-9a-f]{64}$/.test(value))
) {
	throw new Error("Reset aborted: Tristan@Root must have ten unique SHA-256 login-code hashes.")
}

const authUsers = await listAllAuthUsers(supabase)
const rootAuthUsers = authUsers.filter((user) => user.id === roots[0].auth_user_id)
if (rootAuthUsers.length !== 1) {
	throw new Error("Reset aborted: the root Supabase Auth identity does not match root_admins.")
}

const storageObjects = await listAllStorageObjects(supabase, storageBucket)
const nonRootAuthUsers = authUsers.filter((user) => user.id !== roots[0].auth_user_id)
const sqlState = await verifySqlReset(supabase)

console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN"}`)
console.log(`Root database records preserved: ${roots.length}`)
console.log(`Root Auth users preserved: ${rootAuthUsers.length}`)
console.log(`Non-root Auth users to delete: ${nonRootAuthUsers.length}`)
console.log(`Storage objects to delete: ${storageObjects.length}`)
console.log(`SQL reset ready: ${sqlState.ready}`)
console.log(`Nonempty application tables: ${sqlState.blockingTables.length}`)
console.log(`Auto-recreated operational tables: ${sqlState.autoRecreatedTables.length}`)
console.log(`Required configuration records: ${sqlState.configurationCount}`)
console.log(`Maintenance Mode enabled: ${sqlState.maintenanceEnabled}`)
if (diagnose && sqlState.nonemptyTables.length > 0) {
	console.log("Nonempty reset-table counts:")
	for (const item of sqlState.nonemptyTables) console.log(`${item.table}: ${item.count}`)
}

if (!execute) {
	console.log(sqlState.ready
		? "Dry run complete. The SQL reset is verified; --execute may now be used with the required confirmation value."
		: "Dry run complete. Run the SQL reset first, then use --execute with the required confirmation value.")
	process.exit(0)
}
if (!sqlState.ready) {
	throw new Error("Execution aborted: run supabase/reset-all-data-except-root.sql successfully before this command.")
}

for (const batch of chunk(storageObjects, STORAGE_DELETE_BATCH_SIZE)) {
	const { error } = await supabase.storage.from(storageBucket).remove(batch)
	if (error) throw new Error(`Storage cleanup failed: ${error.message}`)
}

for (const user of nonRootAuthUsers) {
	const { error } = await supabase.auth.admin.deleteUser(user.id, false)
	if (error) throw new Error(`Auth cleanup failed after deleting some users: ${error.message}`)
}

const remainingStorage = await listAllStorageObjects(supabase, storageBucket)
const remainingAuthUsers = await listAllAuthUsers(supabase)
const remainingRootAuthUsers = remainingAuthUsers.filter((user) => user.id === roots[0].auth_user_id)

if (remainingStorage.length !== 0) throw new Error("Verification failed: Storage is not empty.")
if (remainingAuthUsers.length !== 1 || remainingRootAuthUsers.length !== 1) {
	throw new Error("Verification failed: Auth does not contain exactly the preserved root user.")
}

console.log("Reset companion completed successfully.")
console.log("Auth users remaining: 1")
console.log("Storage objects remaining: 0")
console.log("Maintenance Mode remains enabled. Verify root access before disabling it.")
