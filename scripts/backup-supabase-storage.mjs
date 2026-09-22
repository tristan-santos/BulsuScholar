import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

const outputArgument = process.argv[2]
if (!outputArgument || !isAbsolute(outputArgument)) {
  throw new Error("Pass an absolute output directory outside the repository.")
}
const output = resolve(outputArgument)
const workspace = resolve(process.cwd())
if (output === workspace || output.startsWith(`${workspace}\\`) || output.startsWith(`${workspace}/`)) {
  throw new Error("Storage backups must be saved outside the repository.")
}
if (existsSync(output)) throw new Error("Output directory already exists; choose a new backup directory.")

const envFile = readFileSync(resolve(".env"), "utf8")
const env = Object.fromEntries(envFile.split(/\r?\n/).filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map((line) => {
  const index = line.indexOf("=")
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")]
}))
const url = process.env.SUPABASE_URL || env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
const bucket = process.env.SUPABASE_STORAGE_BUCKET || env.VITE_SUPABASE_STORAGE_BUCKET || "bulsuscholar"
if (!url || !key) throw new Error("Supabase service-role configuration is missing.")

const client = createClient(url, key, { auth: { persistSession: false } })
const paths = []
const folders = [""]
while (folders.length > 0) {
  const prefix = folders.shift()
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw error
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id) paths.push(path)
      else folders.push(path)
    }
    if (data.length < 1000) break
  }
}

mkdirSync(output, { recursive: false })
const manifest = { bucket, createdAt: new Date().toISOString(), objects: [] }
for (let index = 0; index < paths.length; index += 1) {
  const { data, error } = await client.storage.from(bucket).download(paths[index])
  if (error) throw error
  const bytes = Buffer.from(await data.arrayBuffer())
  const filename = String(index + 1).padStart(5, "0")
  writeFileSync(join(output, filename), bytes, { flag: "wx" })
  manifest.objects.push({ path: paths[index], file: filename, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })
}
writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" })
console.log(`Backed up ${manifest.objects.length} Storage objects to the requested directory.`)
