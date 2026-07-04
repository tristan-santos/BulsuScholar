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

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
const secret = env.VITE_PASSWORD_SECRET || "bulsuscholar-default-secret-key-32!!!"
const plainPassword = env.GRANTOR_PASSWORD || GRANTOR_DEFAULT_PASSWORD
const grantorIds = (env.GRANTOR_IDS || "grantor_tina,grantor_kuya_win")
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean)

if (!supabaseUrl || !supabaseKey) {
	console.error("Missing VITE_SUPABASE_URL or Supabase key in .env.")
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
	auth: { persistSession: false, autoRefreshToken: false },
})

for (const grantorId of grantorIds) {
	try {
		await resetGrantorPasswordInDatabase(supabase, grantorId, {
			plainPassword,
			secret,
			mustChangePassword: true,
			resetBy: "reset-grantor-passwords-script",
		})
		console.log(`${grantorId}: password reset using current VITE_PASSWORD_SECRET`)
	} catch (error) {
		console.error(error.message || error)
		process.exit(1)
	}
}

console.log(`Done. Login with User ID above and password: ${plainPassword}`)
console.log("Grantors must change this default password before entering the portal.")
