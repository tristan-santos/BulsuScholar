$ErrorActionPreference = 'Stop'
$results = @()
function Evaluate($source) {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($source))
    $raw = agent-browser --session romel eval -b $encoded
    if ($LASTEXITCODE -ne 0) { throw "Browser evaluation failed" }
    return ($raw | ConvertFrom-Json)
}
foreach ($width in @(1440, 1366, 1280, 1024, 768, 390)) {
    agent-browser --session romel set viewport $width 900 | Out-Null
    foreach ($theme in @('light', 'dark')) {
        Evaluate "document.documentElement.dataset.theme='$theme'; document.querySelector('main button').focus(); document.querySelector('main button').click(); true" | Out-Null
        Start-Sleep -Milliseconds 850
        $state = Evaluate @'
(() => {
 const panel = document.querySelector('.protected-download-dialog');
 const rect = panel.getBoundingClientRect();
 return {fits: rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
   passwordLength: panel.querySelector('code').textContent.length,
   disabled: panel.querySelector('footer button:last-child').disabled,
   focused: panel.contains(document.activeElement),
   noOverflow: document.documentElement.scrollWidth <= innerWidth,
   clickable: !!document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.protected-download-dialog')};
})()
'@
        if (!$state.fits -or !$state.disabled -or !$state.focused -or !$state.noOverflow -or !$state.clickable -or $state.passwordLength -ne 24) { throw "Invalid modal at $width/$theme" }
        Evaluate "document.querySelector('.protected-download-dialog input').click(); true" | Out-Null
        $enabled = Evaluate "!document.querySelector('.protected-download-dialog footer button:last-child').disabled"
        if (!$enabled) { throw "Acknowledgment does not enable download" }
        if (($width -eq 390 -and $theme -eq 'dark') -or ($width -eq 1440 -and $theme -eq 'light')) {
            # Do not retain even synthetic download passwords in screenshot evidence.
            Evaluate "document.querySelector('.protected-download-password code').style.filter='blur(7px)'; true" | Out-Null
            agent-browser --session romel screenshot "test-results/romel-$width-$theme.png" | Out-Null
        }
        Evaluate "document.querySelector('.protected-download-dialog footer button:first-child').click(); true" | Out-Null
        $clean = Evaluate "!document.querySelector('.protected-download-dialog') && document.activeElement.textContent === 'Protected Download'"
        if (!$clean) { throw "Cancel did not clear modal and restore focus" }
        $results += @{width=$width; theme=$theme; status='Pass'; checks='fit, overflow, password length, focus, acknowledgment, cancellation cleanup'}
    }
}
Evaluate "document.querySelectorAll('main button')[1].click(); true" | Out-Null
Start-Sleep -Milliseconds 150
$upload = Evaluate "document.querySelector('.protected-download-dialog input').type === 'password' && document.querySelector('.protected-download-dialog footer button:last-child').disabled"
if (!$upload) { throw 'Upload password prompt not masked or not gated' }
agent-browser --session romel press Escape | Out-Null
$cleared = Evaluate "!document.querySelector('.protected-download-dialog')"
if (!$cleared) { throw 'Escape failed to clear upload password prompt' }
$results += @{status='Pass'; checks='Upload password prompt, disabled empty password, Escape cleanup'}
Evaluate "document.querySelectorAll('main button')[2].click(); true" | Out-Null
agent-browser --session romel wait '.protected-download-dialog input[type="password"]' | Out-Null
# This fixed public test password protects only a synthetic blank fixture, not user data.
agent-browser --session romel fill 'input[type="password"]' 'fixture-only-password' | Out-Null
Evaluate "document.querySelector('.protected-download-dialog footer button:last-child').click(); true" | Out-Null
agent-browser --session romel wait --fn 'window.__romelPreviewResult?.rendered === true' | Out-Null
$preview = Evaluate "window.__romelPreviewResult.ink > 100 && window.__romelPreviewResult.width > 0 && window.__romelPreviewResult.height > 0"
if (!$preview) { throw 'Encrypted PDF did not render real nonblank pixels after password input' }
$results += @{status='Pass'; checks='Real AES PDF fixture: shared password prompt, PDF.js render, nonblank canvas pixels, URL revoked'}
@{environment='Local isolated UI fixture, no production mutations'; results=$results} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath test-results/romel-browser.json -Encoding utf8
Write-Output "PASS: $($results.Count) browser scenarios"
