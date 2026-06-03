$ErrorActionPreference = "Stop"
Write-Host "Aplicando patch V9 no projeto atual..." -ForegroundColor Cyan
$root = Get-Location
$patch = Split-Path -Parent $MyInvocation.MyCommand.Path
$patch = Split-Path -Parent $patch

Copy-Item -Path "$patch\src" -Destination "$root" -Recurse -Force
Copy-Item -Path "$patch\supabase" -Destination "$root" -Recurse -Force
Copy-Item -Path "$patch\.vscode" -Destination "$root" -Recurse -Force
Copy-Item -Path "$patch\deno.json" -Destination "$root\deno.json" -Force

Write-Host "Patch copiado. Validando marcações principais..." -ForegroundColor Cyan
Select-String -Path "$root\src\routes\admin.tsx" -Pattern "Caminho principal V9"
Select-String -Path "$root\src\lib\supabase\client.ts" -Pattern "getFunctionHeaders"
Write-Host "OK. Agora rode: npm run build" -ForegroundColor Green
