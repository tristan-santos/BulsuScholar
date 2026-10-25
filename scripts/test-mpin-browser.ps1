$ErrorActionPreference = 'Stop'
$results = @()
function Evaluate($source) {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($source))
    $raw = agent-browser --session mpin eval -b $encoded
    if ($LASTEXITCODE -ne 0) { throw 'Browser evaluation failed' }
    return ($raw | ConvertFrom-Json)
}
function Check($condition, $name) {
    if (!(Evaluate $condition)) { throw "Failed: $name" }
    $script:results += @{ test=$name; status='Pass' }
}
agent-browser --session mpin open http://127.0.0.1:5175/scripts/mpin-security-fixture.html | Out-Null
Start-Sleep -Milliseconds 600
foreach ($width in @(1440, 1366, 1280, 1024, 768, 390)) {
    agent-browser --session mpin set viewport $width 844 | Out-Null
    foreach ($theme in @('light','dark')) {
        Evaluate "document.documentElement.dataset.theme='$theme'; window.__mpinFixture.enabled=true; document.querySelector('#verify').click(); true" | Out-Null
        agent-browser --session mpin wait '.mpin-dialog input' | Out-Null
        Check @'
(() => { const d=document.querySelector('.mpin-dialog'); const r=d.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight && document.documentElement.scrollWidth<=innerWidth && d.contains(document.activeElement) && getComputedStyle(d).overflowY==='auto'; })()
'@ "MPIN dialog fit, scrolling, focus, no overflow: $width/$theme"
        if ($width -eq 390 -or $width -eq 1440) { agent-browser --session mpin screenshot "test-results/mpin-$width-$theme.png" | Out-Null }
        agent-browser --session mpin press Escape | Out-Null
        Check "!document.querySelector('.mpin-dialog')" "Escape cancels and clears dialog: $width/$theme"
    }
}
Evaluate "window.__mpinFixture.role='student'; document.querySelector('#apply').click(); true" | Out-Null
agent-browser --session mpin wait '.mpin-dialog input' | Out-Null
agent-browser --session mpin fill '.mpin-dialog input' '999999' | Out-Null
Evaluate "document.querySelector('.mpin-dialog button[type=submit]').click(); true" | Out-Null
agent-browser --session mpin wait '.mpin-error' | Out-Null
Check "window.__mpinFixture.mutations===0 && document.querySelector('.mpin-error').textContent.includes('Incorrect')" 'Incorrect MPIN shows error without mutation'
agent-browser --session mpin fill '.mpin-dialog input' '012345' | Out-Null
Evaluate "document.querySelector('.mpin-dialog button[type=submit]').click(); true" | Out-Null
agent-browser --session mpin wait --fn 'window.__mpinFixture.mutations===1' | Out-Null
Check "!document.querySelector('.mpin-dialog') && window.__mpinFixture.mutations===1" 'Correct MPIN submits application once'
Evaluate "document.querySelector('#download').click(); true" | Out-Null
agent-browser --session mpin wait '.mpin-dialog input' | Out-Null
agent-browser --session mpin fill '.mpin-dialog input' '012345' | Out-Null
Evaluate "document.querySelector('.mpin-dialog button[type=submit]').click(); true" | Out-Null
agent-browser --session mpin wait '.protected-download-password code' | Out-Null
Check "document.querySelector('.protected-download-password code').textContent.length===24 && window.__mpinFixture.downloads===0" 'Student MPIN precedes separate 24-character password acknowledgment'
agent-browser --session mpin press Escape | Out-Null
Check "window.__mpinFixture.downloads===0" 'Cancelling file password does not download'
foreach ($role in @('admin','grantor','root')) {
    Evaluate "window.__mpinFixture.role='$role'; document.querySelector('#download').click(); true" | Out-Null
    Start-Sleep -Milliseconds 400
    Check "!document.querySelector('.mpin-dialog') && !document.querySelector('.protected-download-dialog')" "$role student-document download skips both prompts"
}
Check 'window.__mpinFixture.downloads===3' 'Staff download requests complete without encryption prompt'
Check 'window.__mpinFixture.errors.length===0' 'No browser application errors'
@{ environment='Isolated local UI/network fixtures, not authenticated production'; results=$results } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath test-results/mpin-browser.json -Encoding utf8
Write-Output "PASS: $($results.Count) MPIN browser checks"
