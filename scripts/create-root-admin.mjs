import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

function readEnv(path) {
	try {
		return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
			const index = line.indexOf("=")
			return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")]
		}))
	} catch {
		return {}
	}
}

const env = { ...readEnv(resolve(".env")), ...process.env }
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
const rootId = env.ROOT_ADMIN_USER_ID || "Tristan@Root"
const email = env.ROOT_ADMIN_EMAIL || "santostristan326@gmail.com"
const temporaryPassword = env.ROOT_ADMIN_TEMPORARY_PASSWORD
const forceReset = String(env.ROOT_ADMIN_FORCE_RESET || "false").toLowerCase() === "true"

if (!url || !serviceKey) {
	console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
	process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listError) throw listError
let user = listed.users.find((item) => item.email?.toLowerCase() === email.toLowerCase())

if (!user) {
	if (!temporaryPassword) throw new Error("ROOT_ADMIN_TEMPORARY_PASSWORD is required when creating the root owner.")
	const { data, error } = await supabase.auth.admin.createUser({
		email,
		password: temporaryPassword,
		email_confirm: true,
		user_metadata: { user_id: rootId, user_type: "root", full_name: "Root Administrator" },
		app_metadata: { portal_role: "root" },
	})
	if (error) throw error
	user = data.user
} else {
	if (forceReset && !temporaryPassword) throw new Error("ROOT_ADMIN_TEMPORARY_PASSWORD is required when ROOT_ADMIN_FORCE_RESET=true.")
	const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
		...(forceReset ? { password: temporaryPassword } : {}),
		user_metadata: { ...user.user_metadata, user_id: rootId, user_type: "root" },
		app_metadata: { ...user.app_metadata, portal_role: "root" },
	})
	if (error) throw error
	user = data.user
}

const { data: existingProfile, error: existingProfileError } = await supabase.from("root_admins").select("id,must_change_password").eq("id", rootId).maybeSingle()
if (existingProfileError) throw existingProfileError
const { error: profileError } = await supabase.from("root_admins").upsert({
	id: rootId,
	auth_user_id: user.id,
	email,
	display_name: "Root Administrator",
	active: true,
	must_change_password: existingProfile ? (forceReset ? true : existingProfile.must_change_password) : true,
	updated_at: new Date().toISOString(),
}, { onConflict: "id" })
if (profileError) throw profileError

console.log(`Root administrator is ready: ${rootId} (${email}).${!existingProfile || forceReset ? " The temporary password must be changed at first login." : " Existing credentials were preserved."}`)
