import { readFileSync } from "node:fs"
import { createHmac, randomInt } from "node:crypto"
import { spawnSync } from "node:child_process"
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
const fixedPassword = env.ROOT_ADMIN_FIXED_PASSWORD
const sessionSecret = env.ROOT_SESSION_SECRET

if (!url || !serviceKey) {
	console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
	process.exit(1)
}
if (!fixedPassword) throw new Error("ROOT_ADMIN_FIXED_PASSWORD is required for root setup.")
if (!sessionSecret || sessionSecret.length < 32) throw new Error("ROOT_SESSION_SECRET must match Railway and contain at least 32 characters.")

const loginCodes = new Set()
while (loginCodes.size < 10) loginCodes.add(String(randomInt(0, 10_000_000_000)).padStart(10, "0"))
const loginCodeList = [...loginCodes]
const loginCodeHashes = loginCodeList.map((code) => createHmac("sha256", sessionSecret).update(code).digest("hex"))

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listError) throw listError
let user = listed.users.find((item) => item.email?.toLowerCase() === email.toLowerCase())

if (!user) {
	const { data, error } = await supabase.auth.admin.createUser({
		email,
		password: fixedPassword,
		email_confirm: true,
		user_metadata: { user_id: rootId, user_type: "root", full_name: "Root Administrator" },
		app_metadata: { portal_role: "root" },
	})
	if (error) throw error
	user = data.user
} else {
	const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
		password: fixedPassword,
		user_metadata: { ...user.user_metadata, user_id: rootId, user_type: "root" },
		app_metadata: { ...user.app_metadata, portal_role: "root" },
	})
	if (error) throw error
	user = data.user
}

const { error: profileError } = await supabase.from("root_admins").upsert({
	id: rootId,
	auth_user_id: user.id,
	email,
	display_name: "Root Administrator",
	active: true,
	login_code_hashes: loginCodeHashes,
	failed_code_attempts: 0,
	code_locked_until: null,
	updated_at: new Date().toISOString(),
}, { onConflict: "id" })
if (profileError) throw profileError

const { error: revokeError } = await supabase.from("root_sessions").update({ revoked_at: new Date().toISOString() }).eq("root_id", rootId).is("revoked_at", null)
if (revokeError) throw revokeError

const printableCodes = loginCodeList.map((code, index) => `${index + 1}. ${code}`).join("\n")
if (process.platform === "win32") spawnSync("clip.exe", { input: loginCodeList.join("\r\n"), encoding: "utf8", windowsHide: true })
console.log(`Root administrator is ready: ${rootId} (${email}).`)
console.log("Permanent 10-digit codes:")
console.log(printableCodes)
console.log(process.platform === "win32" ? "All codes were copied to the clipboard. Save them now; only their hashes are stored." : "Save the codes now; only their hashes are stored.")
