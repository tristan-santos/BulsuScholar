import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"
import {
	GRANTOR_DEFAULT_PASSWORD,
	resetGrantorPasswordInDatabase,
} from "./lib/grantorPasswordReset.mjs"

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
		env[trimmed.slice(0, separator).trim()] = trimmed
			.slice(separator + 1)
			.trim()
			.replace(/^['"]|['"]$/g, "")
	}
	return env
}

const env = {
	...parseEnv(readEnvFile(resolve(".env"))),
	...process.env,
}

const grantorId = process.argv[2]?.trim()
if (!grantorId) {
	console.error("Usage: node scripts/reset-grantor-password.mjs <grantor_user_id>")
	console.error("Example: node scripts/reset-grantor-password.mjs grantor_tina")
	process.exit(1)
}

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
const secret = env.VITE_PASSWORD_SECRET || "bulsuscholar-default-secret-key-32!!!"
const plainPassword = env.GRANTOR_PASSWORD || GRANTOR_DEFAULT_PASSWORD

if (!supabaseUrl || !supabaseKey) {
	console.error("Missing VITE_SUPABASE_URL or Supabase key in .env.")
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
	auth: { persistSession: false, autoRefreshToken: false },
})

try {
	const result = await resetGrantorPasswordInDatabase(supabase, grantorId, {
		plainPassword,
		secret,
		mustChangePassword: true,
		resetBy: "reset-grantor-password-script",
	})

	console.log(`Reset complete for ${result.grantorId} (${result.providerName}).`)
	console.log(`Login password: ${result.plainPassword}`)
	console.log("Grantor must change this password on next login.")
} catch (error) {
	console.error(error.message || error)
	process.exit(1)
}
