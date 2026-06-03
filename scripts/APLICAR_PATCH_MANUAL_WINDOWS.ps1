param(
  [string]$Projeto = "C:\Users\Rodrigo Carvalho\Desktop\myinc-final\myinc_social_engine_production_v4"
)

$PatchRoot = Split-Path -Parent $PSScriptRoot
Write-Host "Projeto: $Projeto"
Write-Host "Patch:   $PatchRoot"

if (!(Test-Path $Projeto)) {
  Write-Error "Pasta do projeto não encontrada: $Projeto"
  exit 1
}

Copy-Item -Path "$PatchRoot\src" -Destination $Projeto -Recurse -Force
Copy-Item -Path "$PatchRoot\supabase" -Destination $Projeto -Recurse -Force
Copy-Item -Path "$PatchRoot\.vscode" -Destination $Projeto -Recurse -Force
Copy-Item -Path "$PatchRoot\deno.json" -Destination $Projeto -Force
Copy-Item -Path "$PatchRoot\LEIA_PRIMEIRO_PATCH_MANUAL.md" -Destination $Projeto -Force

Write-Host "Patch copiado. Conferindo admin.tsx..."
Select-String -Path "$Projeto\src\routes\admin.tsx" -Pattern "Salvar credenciais"
Select-String -Path "$Projeto\src\routes\admin.tsx" -Pattern "Configurar credenciais pelo painel"
Write-Host "Concluído. Agora rode: npm run build; git add .; git commit; git push."
