import { readFile } from "node:fs/promises"

async function source(path) {
	return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

const dataService = await source("src/services/supabaseDataService.js")
const signupPage = await source("src/pages/SignupPage.jsx")
const loginPage = await source("src/pages/LoginPage.jsx")

const checks = [
	[!dataService.includes("supabase.from("), "The compatibility data service must not issue direct Supabase Data API reads."],
	[!dataService.includes("postgres_changes"), "The compatibility data service must not subscribe to direct Supabase Realtime channels."],
	[dataService.includes('/portal/data/query'), "The compatibility data service must use the authorized query endpoint."],
	[!signupPage.includes("findMatchingGrantorScholars"), "Signup must not inspect roster data in the browser."],
	[!signupPage.includes("recordExists(\"students\""), "Signup must not probe account records in the browser."],
	[loginPage.includes("setPortalIdentity(id, account.type)"), "Grantor password change must retain the verified portal session."],
	[!loginPage.includes("password.trim()"), "Login must preserve the password exactly as entered."],
]

const failed = checks.filter(([passed]) => !passed).map(([, message]) => message)
if (failed.length) {
	throw new Error(`Frontend security regression checks failed:\n- ${failed.join("\n- ")}`)
}

console.log(`Frontend security regression checks passed (${checks.length}).`)
