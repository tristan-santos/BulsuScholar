import { createClient } from "@supabase/supabase-js"
import { trackedFetch } from "./operationTracker"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const isAuthCallbackRoute = typeof window !== "undefined" && ["/confirm-email", "/reset-password"].includes(window.location.pathname)

if (!supabaseUrl || !supabaseAnonKey) {
	console.warn("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.")
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
	global: { fetch: trackedFetch },
	auth: {
		persistSession: true,
		autoRefreshToken: !isAuthCallbackRoute,
		flowType: "implicit",
		// Confirmation and recovery routes process every supported callback shape
		// explicitly so a stale stored session cannot race the email callback.
		detectSessionInUrl: false,
	},
	realtime: {
		params: {
			eventsPerSecond: 10,
		},
	},
})

export const auth = supabase.auth
