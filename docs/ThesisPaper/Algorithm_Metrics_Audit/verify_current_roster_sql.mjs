// Execute only pure current matching functions in an ephemeral local database.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href)
const out = resolve('docs/ThesisPaper/Algorithm_Metrics_Audit')
const db = new PGlite()
const start = new Date().toISOString()
const pgliteVersion = JSON.parse(await readFile(resolve(dirname(dirname(resolve(process.argv[2]))), 'package.json'), 'utf8')).version
const definitions = []
async function load(file, name) {
  const sql = await readFile(file, 'utf8')
  const start = sql.indexOf(`create or replace function public.${name}(`)
  if (start < 0) throw new Error(`Function missing: ${name}`)
  await db.exec(sql.slice(start, sql.indexOf('$$;', start) + 3))
  definitions.push({ file, function: name })
}
const profile = { fullName: 'Fixture Family, Sample', course: 'Bachelor of Science in Information Technology', yearLevel: '4th Year' }
const equivalent = { fullName: 'sample fixture family', course: 'B.S.I.T.', yearLevel: 'Year 4' }
const inputs = [
  ['SQL-AUD-01', 'Comma names, course alias and year normalization', profile, equivalent, true],
  ['SQL-AUD-02', 'Different explicit IDs override coincident profiles', { ...profile, studentId: 'SYN-A' }, { ...equivalent, studentId: 'SYN-B' }, false],
  ['SQL-AUD-03', 'One missing ID permits exact normalized profile fallback', { ...profile, studentId: 'SYN-A' }, equivalent, true],
  ['SQL-AUD-04', 'Different course prevents fallback', profile, { ...equivalent, course: 'BSBA' }, false],
  ['SQL-AUD-05', 'Different year prevents fallback', profile, { ...equivalent, yearLevel: '3' }, false],
  ['SQL-AUD-06', 'Incomplete profile cannot match', { fullName: 'Fixture Sample' }, { fullName: 'Fixture Sample' }, false],
  ['SQL-AUD-07', 'Exact explicit ID comparison is not fuzzy/name approval', { studentId: 'SYN-A', fullName: 'Fixture One' }, { studentId: 'SYN-A', fullName: 'Fixture Different' }, true],
]
try {
  await load('supabase/migrations/20261026043502_manual_roster_name_and_course_matching.sql', 'roster_import_profile_key')
  await load('supabase/migrations/20261026034945_cross_grantor_roster_identity_guard.sql', 'roster_import_matches')
  const results = []
  for (const [id, condition, left, right, expected] of inputs) {
    const actual = (await db.query('select public.roster_import_matches($1::jsonb,$2::jsonb) as matched', [left, right])).rows[0].matched
    results.push({ id, condition, left, right, expected, actual, status: actual === expected ? 'Pass' : 'Fail', labelBasis: 'New synthetic contract check, not an independently labeled scholarship-conflict case' })
  }
  await writeFile(resolve(out, 'Current_Roster_SQL_Execution.json'), JSON.stringify({ startedAtUTC: start, finishedAtUTC: new Date().toISOString(), environment: 'Ephemeral local PostgreSQL/PGlite; no network/database credentials', command: ['node', ...process.argv.slice(1)].map(x => JSON.stringify(x)).join(' '), nodeVersion: process.version, pgliteVersion, sourceDefinitions: definitions, results, metricsScope: 'Boolean normalization contracts only. Not a conflict precision/recall dataset.' }, null, 2))
  console.log(JSON.stringify({ tests: results.length, passed: results.filter(r => r.status === 'Pass').length, resultsFile: 'Current_Roster_SQL_Execution.json' }))
  if (results.some(r => r.status !== 'Pass')) process.exitCode = 1
} finally { await db.close() }
