# Headless UI test runner for the crokinole scorer.
# Usage: powershell -File tests\run-tests.ps1   (from the repo root)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }

$scenarios = @(
  '{"name":"singles differential","mode":"singles","rounds":[[[0,20,2],[0,10,1],[1,15,1]]],"expectScores":"35,0"}'
  '{"name":"singles win + history","mode":"singles","rounds":[[[0,20,5]]],"expectScores":"100,0","expectWinner":0,"expectHistoryCount":1}'
  '{"name":"tournament round","mode":"tournament","rounds":[[[0,20,1],[1,15,1]]],"expectScores":"2,0"}'
  '{"name":"cutthroat match-play","mode":"cutthroat","rounds":[[[0,20,2],[1,15,1]]],"expectScores":"2,1,0"}'
  '{"name":"cutthroat differential","mode":"cutthroat","cutScoring":"target","rounds":[[[0,20,2],[1,15,1]]],"expectScores":"25,0,0"}'
  '{"name":"2v1 solo wins round","mode":"twovone","rounds":[[[0,20,1],[1,15,2]]],"expectScores":"0,10"}'
  '{"name":"disc cap at 8","mode":"singles","rounds":[],"expectScores":"0,0","maxDiscCheck":8}'
)

$html = Get-Content "$root\index.html" -Raw -Encoding UTF8
$fails = 0
$i = 0
foreach ($s in $scenarios) {
  $i++
  $name = ($s | ConvertFrom-Json).name
  $page = "$root\_t$i.html"
  $inject = "<script>window.SCENARIO=$s;</script><script src=`"tests/harness.js`"></script></body>"
  $html.Replace("</body>", $inject) | Set-Content $page -Encoding utf8
  $uri = "file:///" + ($page -replace "\\", "/" -replace " ", "%20")
  # run via cmd so Edge's benign stderr chatter can't trip PowerShell 5.1
  $out = (cmd /c "`"$edge`" --headless=new --disable-gpu --virtual-time-budget=4000 --dump-dom `"$uri`" 2>nul") | Out-String
  Remove-Item $page -Confirm:$false
  if ($out -match '<div id="test-log">([^<]*)</div>') {
    $result = $Matches[1]
    Write-Host "[$name] $result"
    if ($result -match "FAIL") { $fails++ }
  } else {
    Write-Host "[$name] NO TEST LOG (page crashed?)"
    $fails++
  }
}
if ($fails -gt 0) { Write-Host "$fails scenario(s) FAILED"; exit 1 }
Write-Host "All $i scenarios passed"
exit 0
