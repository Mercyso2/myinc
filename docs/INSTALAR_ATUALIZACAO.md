# Instalação — MYINC geração assíncrona blindada

Esta atualização troca o fluxo pesado por fila + worker. O app responde rápido e a geração continua em segundo plano.

## 1) Aplicar arquivos no projeto

Extraia este ZIP e copie os arquivos da pasta `files/` para a raiz do seu projeto.

Ou rode o script:

```powershell
cd "C:\Users\Rodrigo Carvalho\Desktop\Projetos em execução\myinc-github"
python "CAMINHO_DO_ZIP_EXTRAIDO\apply_update.py"
```

O script faz backup dos arquivos substituídos.

## 2) Instalar dependências do projeto principal

```bash
npm install
npm run typecheck
npm run build
```

## 3) Aplicar migration no Supabase

```bash
supabase db push
```

Ou cole o SQL abaixo no Supabase SQL Editor:

```text
files/supabase/migrations/20260609093000_async_generation_jobs_worker.sql
```

## 4) Deploy das Edge Functions

```bash
supabase functions deploy generate-image
supabase functions deploy generate-images-batch
supabase functions deploy generate-videos-batch
supabase functions deploy generation-status
```

## 5) Secrets mínimos

No Supabase/Runtime config/ENV:

```text
OPENAI_API_KEY=sua_chave
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_QUALITY=medium
OPENAI_IMAGE_FORMAT=png
OPENAI_IMAGE_SIZE_FEED=1024x1536
OPENAI_IMAGE_SIZE_STORY=1024x1536
OPENAI_IMAGE_SIZE_SQUARE=1024x1024
OPENAI_IMAGE_SIZE_FACEBOOK=1536x1024
MEDIA_BUCKET=creative-media
```

## 6) Subir o worker

```bash
cd worker/myinc-generation-worker
npm install
cp .env.example .env
# edite .env
npm start
```

No EasyPanel, crie um app Node.js apontando para `worker/myinc-generation-worker`.

Comando de start:

```bash
npm install && npm start
```

## 7) Como validar

1. Crie ou abra um post feed.
2. Clique em `Gerar mídia`.
3. A função deve responder rápido com `jobId`.
4. O worker deve mostrar logs no terminal.
5. O post deve passar para `aguardando_revisao` com `media_url` preenchido.
6. Para carrossel, o worker cria jobs filhos e consolida `carousel_media_urls`.
7. Para vídeo, configure `VIDEO_PROVIDER_API_URL` para MP4 real; sem provedor, o worker cria capa/storyboard e registra aviso.

## Observação sobre vídeo real

Imagem e carrossel funcionam com OpenAI Images. Vídeo MP4 real precisa de um provedor externo configurado em `VIDEO_PROVIDER_API_URL` e `VIDEO_PROVIDER_API_KEY`, porque o projeto atual não tinha provedor de vídeo real embutido.
