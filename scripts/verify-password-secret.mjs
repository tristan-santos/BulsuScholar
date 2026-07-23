import { readFileSync } from "node:fs"
import { createDecipheriv } from "node:crypto"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

function readEnvFile(path) {
	try {
		return readFileSync(path, "utf8")
	} catch {
		return ""
	}
}

function parseEnv(contents) {
	const env = {}
	for (const line of contents.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith("#")) continue
		const separator = trimmed.indexOf("=")
		if (separator === -1) continue
		env[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")
	}
	return env
}

function decryptPassword(encryptedPassword, secret) {
	const combined = Buffer.from(String(encryptedPassword || ""), "base64")
	if (combined.length <= 28) throw new Error("encrypted_password_too_short")
	const iv = combined.subarray(0, 12)
	const tag = combined.subarray(combined.length - 16)
	const encrypted = combined.subarray(12, combined.length - 16)
	const key = Buffer.from(String(secret || "").padEnd(32).slice(0, 32), "utf8")
	const decipher = createDecipheriv("aes-256-gcm", key, iv)
	decipher.setAuthTag(tag)
	return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}

const env = {
	...parseEnv(readEnvFile(resolve(".env"))),
	...process.env,
}

const accountId = process.argv[2]?.trim()
const tableArg = process.argv[3]?.trim()
if (!accountId) {
	console.error("Usage: node scripts/verify-password-secret.mjs <account_id> [providers|admins]")
	console.error("Example: node scripts/verify-password-secret.mjs grantor_test providers")
	process.exit(1)
}

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
const primarySecret = env.VITE_PASSWORD_SECRET || "bulsuscholar-default-secret-key-32!!!"
const legacySecrets = String(env.VITE_PASSWORD_LEGACY_SECRETS || "")
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean)
const secrets = [...new Set([primarySecret, ...legacySecrets])]

if (!supabaseUrl || !supabaseKey) {
	console.error("Missing VITE_SUPABASE_URL or Supabase key in .env.")
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
	auth: { persistSession: false, autoRefreshToken: false },
})

const tables = tableArg ? [tableArg] : ["providers", "admins", "students"]
let found = null
let sourceTable = ""
for (const table of tables) {
	const { data, error } = await supabase
		.from(table)
		.select("id,data")
		.eq("id", accountId)
		.maybeSingle()
	if (error) {
		console.error(`${table}: read failed - ${error.message}`)
		process.exit(1)
	}
	if (data) {
		found = data
		sourceTable = table
		break
	}
}

if (!found) {
	console.error(`${accountId}: account row not found in ${tables.join(", ")}.`)
	process.exit(1)
}

const encryptedPassword = found.data?.password
if (!encryptedPassword) {
	console.error(`${accountId}: no app-managed encrypted password exists in ${sourceTable}.`)
	process.exit(1)
}

for (const [index, secret] of secrets.entries()) {
	try {
		const decrypted = decryptPassword(encryptedPassword, secret)
		console.log(`${accountId}: password decrypts with ${index === 0 ? "VITE_PASSWORD_SECRET" : `legacy secret #${index}`}.`)
		console.log(`Table: ${sourceTable}`)
		console.log(`Password length: ${decrypted.length}`)
		process.exit(0)
	} catch {
		// Try next secret.
	}
}

console.error(`${accountId}: password does not decrypt with VITE_PASSWORD_SECRET or VITE_PASSWORD_LEGACY_SECRETS from .env.`)
console.error("Fix: set the exact same VITE_PASSWORD_SECRET in Vercel, or reset this account password with scripts/reset-grantor-password.mjs.")
process.exit(1)
