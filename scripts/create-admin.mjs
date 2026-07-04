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
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
const adminId = env.ADMIN_USER_ID
const adminEmail = env.ADMIN_EMAIL
const adminPassword = env.ADMIN_PASSWORD
const adminName = env.ADMIN_NAME || "Scholarship Admin"

if (!supabaseUrl || !serviceRoleKey) {
	console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")
	process.exit(1)
}

if (!adminId || !adminEmail || !adminPassword) {
	console.error("Set ADMIN_USER_ID, ADMIN_EMAIL, and ADMIN_PASSWORD before running create:admin.")
	process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
	auth: {
		persistSession: false,
		autoRefreshToken: false,
	},
})

const { data: authData, error: authError } = await supabase.auth.admin.createUser({
	email: adminEmail,
	password: adminPassword,
	email_confirm: true,
	user_metadata: {
		user_id: adminId,
		user_type: "admin",
		full_name: adminName,
	},
})

if (authError && !authError.message.toLowerCase().includes("already")) {
	console.error(`Admin Auth creation failed: ${authError.message}`)
	process.exit(1)
}

const authUserId = authData?.user?.id || ""
const { error: upsertError } = await supabase.from("admins").upsert({
	id: adminId,
	data: {
		adminId,
		email: adminEmail,
		fullName: adminName,
		name: adminName,
		role: "admin",
		userType: "admin",
		authUserId,
		isValidated: true,
		status: "Active",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	updated_at: new Date().toISOString(),
})

if (upsertError) {
	console.error(`Admin profile upsert failed: ${upsertError.message}`)
	process.exit(1)
}

console.log(`Admin account is ready: ${adminId} (${adminEmail})`)
