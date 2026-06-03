Write-Host "Verificando migrations MYINC..." -ForegroundColor Cyan

$bad1 = Select-String -Path ".\supabase\migrations\*.sql" -Pattern "Policies idempotentes via drop/create simples"
$bad2 = Select-String -Path ".\supabase\migrations\*.sql" -Pattern "create policy `"brand member read %s`" on %I for select using \(brand_id"

if ($bad1 -or $bad2) {
  Write-Host "ERRO: ainda existe bloco antigo nas migrations." -ForegroundColor Red
  if ($bad1) { $bad1 }
  if ($bad2) { $bad2 }
  exit 1
}

$good1 = Select-String -Path ".\supabase\migrations\20260530010000_myinc_operational_10_10.sql" -Pattern "drop/create seguro"
$good2 = Select-String -Path ".\supabase\migrations\20260530010000_myinc_operational_10_10.sql" -Pattern "has_brand_id"

if ($good1 -and $good2) {
  Write-Host "OK: migration 10/10 está na versão segura." -ForegroundColor Green
} else {
  Write-Host "ERRO: migration 10/10 não parece ser a versão segura." -ForegroundColor Red
  exit 1
}

Write-Host "Agora rode: npm run supabase:db:push" -ForegroundColor Yellow
