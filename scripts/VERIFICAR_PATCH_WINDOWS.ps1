param(
  [string]$Projeto = "C:\Users\Rodrigo Carvalho\Desktop\myinc-final\myinc_social_engine_production_v4"
)

$checks = @(
  "$Projeto\src\routes\admin.tsx",
  "$Projeto\src\components\protected-route.tsx",
  "$Projeto\supabase\functions\admin-save-settings\index.ts",
  "$Projeto\supabase\functions\admin-status\index.ts",
  "$Projeto\supabase\functions\_shared\runtime-config.ts",
  "$Projeto\supabase\migrations\20260603002000_runtime_secrets_panel.sql"
)

foreach ($file in $checks) {
  if (Test-Path $file) { Write-Host "OK  $file" -ForegroundColor Green }
  else { Write-Host "FALTA  $file" -ForegroundColor Red }
}

Write-Host "\nBuscando textos do formulário:"
Select-String -Path "$Projeto\src\routes\admin.tsx" -Pattern "Salvar credenciais"
Select-String -Path "$Projeto\src\routes\admin.tsx" -Pattern "Configurar credenciais pelo painel"
