# MYINC Social Media AI — versão local definitiva

Esta versão mantém o design atual e troca Supabase/Edge Functions/RLS por backend local.

## Rodar local

```powershell
npm install
npm run local
```

Abra:

```txt
http://localhost:5173
```

Login padrão local:

```txt
Email: rodrigocarvalhosantos@hotmail.com
Senha: Rodrigo@2026!
```

## Onde ficam os dados

- Banco local JSON: `data/myinc-local-db.json`
- Uploads: `data/uploads/`
- Configurações e chaves: `.env.local`

## OpenAI

Coloque sua chave em `.env.local`:

```env
OPENAI_API_KEY=sua_chave
```

Sem chave, o sistema continua funcionando com geração local determinística para não travar o fluxo.

## Meta

Publicação local registra o post como publicado dentro do app.
Para publicação real na Meta, a mídia precisa estar em uma URL pública HTTPS acessível pela Meta. Em modo totalmente local, a Meta não consegue baixar `localhost`.
