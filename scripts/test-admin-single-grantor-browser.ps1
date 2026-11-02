param([string]$BaseUrl = 'http://127.0.0.1:5177')
$ErrorActionPreference = 'Stop'
$Session = 'admin-roster-regression'
$Root = Split-Path -Parent $PSScriptRoot
$Results = @()
function Agent {
    if ($args[0] -in @('click','check')) {
        & agent-browser --session $Session scrollintoview $args[1] | Out-Null
    }
    & agent-browser --session $Session @args
    if ($LASTEXITCODE -ne 0) { throw "agent-browser failed: $args" }
}
function EvalBrowser([string]$Script) {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Script))
    $response = (& agent-browser --session $Session --json eval -b $encoded | Out-String | ConvertFrom-Json)
    if (-not $response.success) { throw ($response | ConvertTo-Json -Depth 10) }
    return $response.data.result
}
function Verify([string]$Name, [string]$Script) {
    if (-not (EvalBrowser $Script)) { throw "Failed: $Name" }
    $script:Results += @{ name = $Name; status = 'Pass' }
}
function WaitBrowser([string]$Script) {
    for ($attempt=0; $attempt -lt 25; $attempt++) {
        if (EvalBrowser $Script) { return }
        Start-Sleep -Milliseconds 100
    }
    throw "Browser condition timed out: $Script"
}
function OpenImport([string]$Suffix = '') {
    Agent open "$BaseUrl/scripts/admin-roster-import-fixture.html$Suffix"
    Agent wait '.admin-scholarship-head-action--primary'
    Agent click '.admin-scholarship-head-action--primary'
    Agent upload 'input[type=file]' "$Root/scripts/fixtures/admin-roster-single-grantor.csv"
    Agent wait '#admin-roster-new-grantor'
}
New-Item -ItemType Directory -Force -Path "$Root/test-results" | Out-Null
OpenImport
Verify 'No per-row or spreadsheet grantor column; five mapped fields plus checkbox' "document.querySelectorAll('.admin-scholar-import-table th').length === 6"
Agent select '.admin-roster-grantor select' fixture-grantor
Verify 'Selected existing grantor disables typed input' "document.querySelector('#admin-roster-new-grantor').disabled"
Agent click '.admin-roster-grantor select'
Agent press Home
Agent press Enter
Agent fill '#admin-roster-new-grantor' 'New Fixture Foundation'
Verify 'Typing disables dropdown and keeps preview disabled' "document.querySelector('.admin-roster-grantor select').disabled && [...document.querySelectorAll('.admin-scholar-import-actions button')].at(-1).disabled"
Agent click '.admin-roster-grantor-icons button:first-child'
Verify 'Confirmation locks input and enables preview' "document.querySelector('#admin-roster-new-grantor').readOnly && ![...document.querySelectorAll('.admin-scholar-import-actions button')].at(-1).disabled"
Agent click '.admin-scholar-import-actions .admin-safe-btn'
WaitBrowser "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Commit Import')"
Verify 'One batch grantor and no row overrides' "window.__rosterRequests.filter(r=>r.path.endsWith('/import/preview')).every(r=>r.body.grantorSelection.name==='New Fixture Foundation' && r.body.rows.every(row=>!row.grantorId && !row.grantorInput))"
Agent click '.admin-roster-grantor-icons button:first-child'
Verify 'Editing invalidates commit preview and focuses field' "![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Commit Import') && document.activeElement.id==='admin-roster-new-grantor'"
Agent click '.admin-roster-grantor-icons button:last-child'
Verify 'Clear unlocks dropdown' "!document.querySelector('.admin-roster-grantor select').disabled && document.querySelector('#admin-roster-new-grantor').value===''"
Agent fill '#admin-roster-new-grantor' 'Fixture Foundation'
Agent click '.admin-roster-grantor-icons button:first-child'
Verify 'Existing name cannot create duplicate grantor' "!!document.querySelector('#admin-roster-grantor-error')"
Agent click '.admin-roster-grantor-icons button:last-child'
Agent fill '#admin-roster-new-grantor' 'New Fixture Foundation'
Agent click '.admin-roster-grantor-icons button:first-child'
Agent check '.admin-scholar-import-table tbody tr:nth-child(2) input[type=checkbox]'
Agent click '.admin-scholar-import-info-actions .admin-danger-btn'
Verify 'Remove Selected retains other two rows' "document.querySelectorAll('.admin-scholar-import-table tbody tr').length===2 && !document.querySelector('.admin-scholar-import-table tbody').textContent.includes('TEST-002')"
Agent click '.admin-scholar-import-actions .admin-safe-btn'
WaitBrowser "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Commit Import')"
Agent click '.admin-scholar-import-actions .admin-safe-btn'
WaitBrowser "!document.querySelector('#admin-roster-new-grantor')"
Verify 'Commit called once and modal closed' "window.__rosterRequests.filter(r=>r.path.endsWith('/import/commit')).length===1 && !document.querySelector('#admin-roster-new-grantor')"
foreach ($dark in @($false,$true)) {
    OpenImport $(if ($dark) { '?dark=1' } else { '' })
    Agent fill '#admin-roster-new-grantor' 'Example Foundation With A Longer Name'
    Agent click '.admin-roster-grantor-icons button:first-child'
    foreach ($width in @(1440,1366,1024,768,390)) {
        Agent set viewport $width 900
        $mode = if ($dark) { 'dark' } else { 'light' }
        Verify "No viewport overflow $width $mode" "document.documentElement.scrollWidth<=innerWidth && document.querySelector('.admin-detail-shell--admin-scholar-import').getBoundingClientRect().right<=innerWidth"
        Agent screenshot "$Root/test-results/admin-roster-$width-$mode.png"
    }
}
Agent errors
$Results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$Root/test-results/admin-single-grantor-browser.json"
Write-Output "Passed $($Results.Count) browser checks. Synthetic API fixture; not live deployment verification."
