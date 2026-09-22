import { createDecipheriv } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

const CONFIRMATION = "MIGRATE_GRANTORS_TO_SUPABASE_AUTH"

function parseEnv(contents) {
	const values = {}
	for (const line of contents.split(/\r?\n/)) {
		const value = line.trim()
		if (!value || value.startsWith("#") || !value.includes("=")) continue
		const separator = value.indexOf("=")
		values[value.slice(0, separator).trim()] = value.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")
	}
	return values
}

function loadEnv() {
	let local = ""
	try { local = readFileSync(resolve(".env"), "utf8") } catch { /* Environment variables are sufficient. */ }
	return { ...parseEnv(local), ...process.env }
}

function decryptPassword(encryptedPassword, secrets) {
	const combined = Buffer.from(String(encryptedPassword || ""), "base64")
	if (combined.length <= 28) throw new Error("invalid_ciphertext")
	const iv = combined.subarray(0, 12)
	const tag = combined.subarray(combined.length - 16)
	const encrypted = combined.subarray(12, combined.length - 16)
	for (const secret of secrets) {
		try {
			const key = Buffer.from(secret.padEnd(32).slice(0, 32), "utf8")
			const decipher = createDecipheriv("aes-256-gcm", key, iv)
			decipher.setAuthTag(tag)
			return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
		} catch { /* Try the next migration-only secret. */ }
	}
	throw new Error("password_decryption_failed")
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

async function listAllProviders(client) {
	const rows = []
	for (let start = 0; ; start += 1000) {
		const { data, error } = await client.from("providers").select("id,data").range(start, start + 999)
		if (error) throw error
		rows.push(...data)
		if (data.length < 1000) return rows
	}
}

const env = loadEnv()
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
const execute = process.argv.includes("--execute")
const confirmed = env.GRANTOR_AUTH_MIGRATION_CONFIRMATION === CONFIRMATION
const secrets = [
	env.LEGACY_GRANTOR_PASSWORD_SECRET,
	env.VITE_PASSWORD_SECRET,
	...String(env.LEGACY_GRANTOR_PASSWORD_SECRETS || env.VITE_PASSWORD_LEGACY_SECRETS || "").split(","),
].map((value) => String(value || "").trim()).filter(Boolean)

if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
if (secrets.length === 0) throw new Error("Set LEGACY_GRANTOR_PASSWORD_SECRET for the migration dry run.")
if (execute && !confirmed) throw new Error(`Execution requires GRANTOR_AUTH_MIGRATION_CONFIRMATION=${CONFIRMATION}.`)

const supabase = createClient(supabaseUrl, serviceRoleKey, {
	auth: { persistSession: false, autoRefreshToken: false },
})
const [providers, authUsers] = await Promise.all([listAllProviders(supabase), listAllAuthUsers(supabase)])
const authById = new Map(authUsers.map((user) => [user.id, user]))
const authByEmail = new Map(authUsers.map((user) => [String(user.email || "").toLowerCase(), user]))
const providerEmails = new Set()
const prepared = []
const failures = { invalidEmail: 0, duplicateEmail: 0, decryption: 0, authConflict: 0, brokenLink: 0 }

for (const row of providers) {
	const data = row.data || {}
	const email = String(data.email || "").trim().toLowerCase()
	if (!/^\S+@\S+\.\S+$/.test(email)) { failures.invalidEmail += 1; continue }
	if (providerEmails.has(email)) { failures.duplicateEmail += 1; continue }
	providerEmails.add(email)

	const linkedUser = data.authUserId ? authById.get(String(data.authUserId)) : null
	if (data.authUserId && (!linkedUser || String(linkedUser.email || "").toLowerCase() !== email)) {
		failures.brokenLink += 1
		continue
	}
	const emailUser = authByEmail.get(email)
	const metadataId = String(emailUser?.user_metadata?.user_id || emailUser?.app_metadata?.user_id || "")
	if (!linkedUser && emailUser && metadataId !== row.id) { failures.authConflict += 1; continue }

	if (linkedUser && !data.password) {
		prepared.push({ row, email, user: linkedUser, password: "", alreadyMigrated: true })
		continue
	}
	try {
		const password = decryptPassword(data.password, secrets)
		if (!password) throw new Error("empty_password")
		prepared.push({ row, email, user: linkedUser || emailUser || null, password, alreadyMigrated: false })
	} catch {
		failures.decryption += 1
	}
}

const failureCount = Object.values(failures).reduce((sum, count) => sum + count, 0)
console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN"}`)
console.log(`Grantor records: ${providers.length}`)
console.log(`Ready to migrate: ${prepared.filter((item) => !item.alreadyMigrated).length}`)
console.log(`Already migrated: ${prepared.filter((item) => item.alreadyMigrated).length}`)
console.log(`Validation failures: ${failureCount}`)
for (const [reason, count] of Object.entries(failures)) console.log(`${reason}: ${count}`)
if (failureCount > 0 || prepared.length !== providers.length) {
	throw new Error("Migration aborted. Correct every validation failure before execution.")
}
if (!execute) {
	console.log(`Dry run complete. Set GRANTOR_AUTH_MIGRATION_CONFIRMATION=${CONFIRMATION} and add --execute to migrate.`)
	process.exit(0)
}

let migrated = 0
let verified = 0
for (const item of prepared) {
	let authUser = item.user
	if (!item.alreadyMigrated) {
		const attributes = {
			email: item.email,
			password: item.password,
			email_confirm: true,
			user_metadata: { ...(authUser?.user_metadata || {}), user_id: item.row.id, user_type: "grantor" },
			app_metadata: { ...(authUser?.app_metadata || {}), portal_role: "grantor", user_id: item.row.id },
		}
		if (authUser) {
			const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, attributes)
			if (error) throw error
			authUser = data.user
		} else {
			const { data, error } = await supabase.auth.admin.createUser(attributes)
			if (error) throw error
			authUser = data.user
		}
		migrated += 1
	}
	const { data: verifiedUser, error: verifyError } = await supabase.auth.admin.getUserById(authUser.id)
	if (verifyError || !verifiedUser.user || String(verifiedUser.user.email || "").toLowerCase() !== item.email) {
		throw verifyError || new Error("auth_verification_failed")
	}
	const nextData = { ...item.row.data, authUserId: authUser.id, userType: "provider", role: "provider" }
	delete nextData.password
	const { error: providerError } = await supabase.from("providers").update({ data: nextData }).eq("id", item.row.id)
	if (providerError) throw providerError
	const { data: existingPortal, error: portalReadError } = await supabase
		.from("grantor_portals")
		.select("data")
		.eq("id", item.row.id)
		.maybeSingle()
	if (portalReadError) throw portalReadError
	const portalData = {
		...(existingPortal?.data || {}),
		authUserId: authUser.id,
		userType: "provider",
		role: "provider",
		email: item.email,
	}
	delete portalData.password
	const { error: portalError } = await supabase.from("grantor_portals").upsert({
		id: item.row.id,
		data: portalData,
	}, { onConflict: "id" })
	if (portalError) throw portalError
	verified += 1
}

console.log(`Migrated Auth users: ${migrated}`)
console.log(`Verified grantor records: ${verified}`)
console.log("Grantor Auth migration complete.")
