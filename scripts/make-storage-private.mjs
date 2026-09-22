import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
  .map((line) => {
    const index = line.indexOf("=")
    return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")]
  }))
const url = process.env.SUPABASE_URL || env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("Supabase service-role configuration is missing.")

const client = createClient(url, key, { auth: { persistSession: false } })
const bucketName = "bulsuscholar"
const { data: before, error: getError } = await client.storage.getBucket(bucketName)
if (getError) throw getError
if (before.public) {
  const { error } = await client.storage.updateBucket(bucketName, { public: false })
  if (error) throw error
}
const { data: after, error: verifyError } = await client.storage.getBucket(bucketName)
if (verifyError) throw verifyError
if (after.public) throw new Error("Storage bucket is still public.")
console.log("Storage bucket is private.")
