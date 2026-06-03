$ErrorActionPreference = "Stop"
Select-String -Path ".\src\routes\admin.tsx" -Pattern "Caminho principal V9"
Select-String -Path ".\src\lib\supabase\client.ts" -Pattern "getFunctionHeaders"
Select-String -Path ".\supabase\functions\admin-save-settings\index.ts" -Pattern "options\(req\)"
Select-String -Path ".\supabase\functions\admin-status\index.ts" -Pattern "publicRuntimeStatus"
Write-Host "Patch V9 presente localmente." -ForegroundColor Green
