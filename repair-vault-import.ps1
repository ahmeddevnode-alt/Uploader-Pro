
$ErrorActionPreference = "Stop"

$currentPath = "artifacts\api-server\src\routes\uploader.ts"
$baselinePath = Join-Path $env:TEMP "uploader-05a834d.ts"

if (!(Test-Path -LiteralPath $currentPath)) {
    throw "Current uploader.ts not found. No changes made."
}

if (!(Test-Path -LiteralPath $baselinePath)) {
    throw "Clean historical file not found in TEMP. No changes made."
}

$current = [System.IO.File]::ReadAllText(
    (Resolve-Path -LiteralPath $currentPath).Path
)
$baseline = [System.IO.File]::ReadAllText($baselinePath)

$pattern = '(?s)const importMultipart =.*?(?=\r?\nexport default router;)'

$oldSection = [regex]::Match($current, $pattern)
$newSection = [regex]::Match($baseline, $pattern)

if (!$oldSection.Success) {
    throw "Current import section not found. No changes made."
}

if (!$newSection.Success) {
    throw "Clean import section not found. No changes made."
}

$updated = $current.Substring(0, $oldSection.Index) +
           $newSection.Value +
           $current.Substring($oldSection.Index + $oldSection.Length)

if ($updated -match '<<<<<<<|>>>>>>>') {
    throw "Conflict markers remain. No changes written."
}

if (($updated | Select-String -Pattern 'export default router;' -AllMatches).Matches.Count -ne 1) {
    throw "Unexpected export count. No changes written."
}

[System.IO.File]::WriteAllText(
    (Resolve-Path -LiteralPath $currentPath).Path,
    $updated,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "SUCCESS: Vault import section restored." -ForegroundColor Green
