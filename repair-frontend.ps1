
$ErrorActionPreference = "Stop"

$collectionsPath = "artifacts\uploader-pro\src\pages\collections.tsx"
$dashboardPath = "artifacts\uploader-pro\src\pages\dashboard.tsx"

foreach ($p in @($collectionsPath, $dashboardPath)) {
    if (!(Test-Path -LiteralPath $p)) {
        throw "File not found: $p"
    }
}

$collections = [System.IO.File]::ReadAllText(
    (Resolve-Path $collectionsPath).Path
)
$dashboard = [System.IO.File]::ReadAllText(
    (Resolve-Path $dashboardPath).Path
)

$collectionsPattern = '(?m)^}</div>;\r?\n}\r?\n\r?\n(?=function CollectionSkeleton)'
$dashboardPattern = '<<<<<<< Updated upstream\r?\n        </div>\r?\n=======\r?\n>>>>>>> Stashed changes'

if ([regex]::Matches($collections, $collectionsPattern).Count -ne 1) {
    throw "Expected malformed Collections ending not found exactly once. No files changed."
}

if ([regex]::Matches($dashboard, $dashboardPattern).Count -ne 1) {
    throw "Expected Dashboard conflict not found exactly once. No files changed."
}

$fixedCollections = [regex]::Replace(
    $collections,
    $collectionsPattern,
    "}`r`n`r`n",
    1
)

$fixedDashboard = [regex]::Replace(
    $dashboard,
    $dashboardPattern,
    "        </div>",
    1
)

if ($fixedCollections -match '<<<<<<<|>>>>>>>') {
    throw "Conflict markers remain in Collections. No files changed."
}

if ($fixedDashboard -match '<<<<<<<|=======|>>>>>>>') {
    throw "Conflict markers remain in Dashboard. No files changed."
}

# Back up both files before writing either change.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item $collectionsPath "$collectionsPath.$stamp.bak"
Copy-Item $dashboardPath "$dashboardPath.$stamp.bak"

[System.IO.File]::WriteAllText(
    (Resolve-Path $collectionsPath).Path,
    $fixedCollections,
    [System.Text.UTF8Encoding]::new($false)
)

[System.IO.File]::WriteAllText(
    (Resolve-Path $dashboardPath).Path,
    $fixedDashboard,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "SUCCESS: Both frontend syntax repairs applied." -ForegroundColor Green
Write-Host "Backups created with timestamp: $stamp"
