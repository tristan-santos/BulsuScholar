# Reproduce the Audit

Use the existing environment from the repository root. Do not install processing components or use production documents just to improve results.

```powershell
py -3.12 "docs/ThesisPaper/Algorithm_Metrics_Audit/run_metrics_audit.py"
node "docs/ThesisPaper/Algorithm_Metrics_Audit/verify_current_roster_sql.mjs" "C:/Users/santo/AppData/Local/Temp/bulsu-mpin-test-tools/node_modules/@electric-sql/pglite/dist/index.js"
```

The installed PGlite path is environment-specific. The Node runner opens an ephemeral database and executes only the current pure profile/matching functions. It never uses a Supabase connection. Seven asserted outcomes are contracts, not independent scholarship-conflict labels.

The Python runner imports the existing evaluator, redirects the existing document-evaluation helper to a fresh subdirectory, runs its tests/scenarios, and runs the selected matching/roster tests. Application socket connections are denied; native internal asyncio socketpairs are permitted. Existing historical evidence is not overwritten. Rerunning replaces only these new audit artifacts, not the manuscript or production files.

`Weighted_Matching_Execution.json` records the actual invoked function and an equivalent existing-evaluator CLI. `Matching_Regression_Execution.txt` records unittest selection and console. Full document execution logs are in `Document_Reexecution`. Do not run an equivalent unittest command against configured live services without the same isolation guard.

The field-evaluation helper originated under a differently named folder; the actual invocation/output path is overridden in memory and recorded here. The source helper itself remains unchanged.

The report builder was an external temporary packaging helper, not application code. If rerunning tests, regenerate/recheck the PDF tables before treating the old report as current. Source_Manifest.json preserves the source/evidence hashes used to build this report.
