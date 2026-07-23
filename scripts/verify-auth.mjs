import { readFileSync } from "node:fs"
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

const env = {
	...parseEnv(readEnvFile(resolve(".env"))),
	...process.env,
}

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
	console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.")
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		persistSession: false,
		autoRefreshToken: false,
	},
})

const ACCOUNT_TABLES = [
	{ type: "student", table: "students" },
	{ type: "admin", table: "admins" },
	{ type: "provider", table: "providers" },
]

async function findAccount(id) {
	for (const account of ACCOUNT_TABLES) {
		const { data, error } = await supabase.from(account.table).select("id,data").eq("id", id).maybeSingle()
		if (error) throw new Error(`${account.table}: ${error.message}`)
		if (data) return { ...account, row: data }
	}
	return null
}

console.log("Checking Supabase account tables...")
for (const account of ACCOUNT_TABLES) {
	const { error, count } = await supabase.from(account.table).select("id", { count: "exact", head: true })
	if (error) {
		console.error(`${account.table}: ${error.code || "ERROR"}: ${error.message}`)
		process.exit(1)
	}
	console.log(`${account.table}: reachable (${count ?? 0} rows)`)
}

const { error: portalError, count: portalCount } = await supabase
	.from("grantor_portals")
	.select("id", { count: "exact", head: true })
if (portalError) {
	console.error(`grantor_portals: ${portalError.code || "ERROR"}: ${portalError.message}`)
	process.exit(1)
}
console.log(`grantor_portals: reachable (${portalCount ?? 0} rows)`)

const { count: adminCount } = await supabase.from("admins").select("id", { count: "exact", head: true })
if (!adminCount) {
	console.warn("Warning: admins table has no rows. Admin login cannot work until an admin account is created.")
}

const loginUserId = env.AUTH_TEST_USER_ID
const loginPassword = env.AUTH_TEST_PASSWORD
if (loginUserId || loginPassword) {
	if (!loginUserId || !loginPassword) {
		console.error("Set both AUTH_TEST_USER_ID and AUTH_TEST_PASSWORD to run login verification.")
		process.exit(1)
	}

	const account = await findAccount(loginUserId)
	if (!account) {
		console.error(`AUTH_TEST_USER_ID was not found in students/admins/providers: ${loginUserId}`)
		process.exit(1)
	}

	const email = account.row.data?.email
	if (!email) {
		console.error(`${account.table}/${loginUserId} does not have data.email.`)
		process.exit(1)
	}

	const { error } = await supabase.auth.signInWithPassword({
		email,
		password: loginPassword,
	})
	if (error) {
		console.error(`${account.type} login failed: ${error.message}`)
		process.exit(1)
	}
	await supabase.auth.signOut()
	console.log(`${account.type} login verified for ${loginUserId}.`)
} else {
	console.log("Skipped live login test. Set AUTH_TEST_USER_ID and AUTH_TEST_PASSWORD to test a real account.")
}

const resetUserId = env.AUTH_TEST_RESET_USER_ID
if (resetUserId && env.AUTH_TEST_SEND_RESET === "true") {
	const account = await findAccount(resetUserId)
	if (!account?.row?.data?.email) {
		console.error(`Cannot send reset email. Account not found or missing email: ${resetUserId}`)
		process.exit(1)
	}
	const { error } = await supabase.auth.resetPasswordForEmail(account.row.data.email, {
		redirectTo: `${env.VITE_APP_URL || "https://bulsu-scholar.vercel.app"}/reset-password?userId=${encodeURIComponent(resetUserId)}`,
	})
	if (error) {
		console.error(`Password reset email failed: ${error.message}`)
		process.exit(1)
	}
	console.log(`Password reset email requested for ${resetUserId}.`)
} else {
	console.log("Skipped reset email send. Set AUTH_TEST_RESET_USER_ID and AUTH_TEST_SEND_RESET=true to test it.")
}

console.log("Auth verification completed.")
