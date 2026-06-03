# PATCH V9 FINAL — Correção definitiva do painel de credenciais

Este patch corrige o problema original:

- Painel mostrava `Failed to fetch` ao salvar credenciais.
- Edge Function recebia `OPTIONS 200`, mas o `POST` não chegava.
- `admin-status` original lia apenas `Deno.env`, então não reconhecia credenciais salvas no banco.
- `callEdgeFunction` original enviava `Prefer`, causando preflight/CORS desnecessário.

## O que mudou

1. `src/lib/supabase/client.ts`
   - Edge Functions agora usam `getFunctionHeaders()` sem `Prefer`.

2. `src/routes/admin.tsx`
   - Botão `Salvar credenciais` salva primeiro direto na tabela `runtime_secrets` via Supabase REST.
   - A Edge Function `admin-save-settings` virou tentativa opcional, não bloqueia mais o salvamento.
   - O teste de conexões tenta `admin-status`; se falhar, lê `runtime_secrets` direto.

3. `supabase/functions/_shared/runtime-config.ts`
   - Centraliza leitura de `Deno.env` + `runtime_secrets`.
   - Centraliza CORS dinâmico.

4. `supabase/functions/admin-status/index.ts`
   - Agora lê `runtime_secrets` e retorna status real sem expor chaves.

5. `supabase/functions/admin-save-settings/index.ts`
   - CORS dinâmico e resposta detalhada.

6. `supabase/migrations/20260603003000_runtime_secrets_v9_final.sql`
   - Cria/libera `runtime_secrets` com RLS para usuário autenticado salvar.
   - Cria/ajusta bucket público `creative-media`.

## Como aplicar manualmente

Extraia este patch e copie as pastas/arquivos para a raiz do projeto:

```txt
src/
supabase/
.vscode/
deno.json
scripts/
```

Ou rode o script dentro da raiz do projeto:

```powershell
.\scripts\APLICAR_PATCH_V9_WINDOWS.ps1
```

## Depois rode no Supabase SQL Editor

Rode o arquivo:

```txt
supabase/migrations/20260603003000_runtime_secrets_v9_final.sql
```

## Depois faça deploy das Edge Functions

```powershell
npx supabase link --project-ref wsikywlyvtkrtejddymy
npx supabase functions deploy admin-save-settings --no-verify-jwt
npx supabase functions deploy admin-status --no-verify-jwt
npx supabase functions deploy generate-post-content --no-verify-jwt
npx supabase functions deploy generate-image --no-verify-jwt
npx supabase functions deploy generate-video --no-verify-jwt
npx supabase functions deploy meta-test-connection --no-verify-jwt
npx supabase functions deploy publish-meta --no-verify-jwt
```

## Depois suba para GitHub/Vercel

```powershell
npm run build
git add .
git commit -m "patch v9 corrigir credenciais runtime"
git push origin main
```

## Como testar

1. Vercel → login.
2. Configurações Técnicas → Chaves e APIs.
3. Preencha OpenAI/Meta.
4. Clique em `Salvar credenciais`.
5. Rode no Supabase:

```sql
select key, is_secret, updated_at
from public.runtime_secrets
order by key;
```

As chaves devem aparecer ali.

