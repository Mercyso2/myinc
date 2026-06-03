# MYINC migrations verificadas FINAL

Substitua os 3 arquivos dentro de:

supabase/migrations/

Arquivos:
- 20260529000000_myinc_social_media_ai.sql
- 20260530000000_production_auth_rls_storage.sql
- 20260530010000_myinc_operational_10_10.sql

ANTES de rodar db push, confirme no PowerShell:

Select-String -Path .\supabase\migrations\*.sql -Pattern "Policies idempotentes via drop/create simples"
Select-String -Path .\supabase\migrations\*.sql -Pattern "create policy `"brand member read %s`" on %I for select using \(brand_id"

O resultado correto é: não aparecer nada.

Depois confirme que a migration 10/10 tem o bloco seguro:

Select-String -Path .\supabase\migrations\20260530010000_myinc_operational_10_10.sql -Pattern "drop/create seguro"
Select-String -Path .\supabase\migrations\20260530010000_myinc_operational_10_10.sql -Pattern "has_brand_id"

Se aparecer "drop/create seguro" e "has_brand_id", está usando a versão certa.

Depois rode:

npm run supabase:db:push
