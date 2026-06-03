# MYINC Social Media AI — versão final local/hospedagem 100

Esta versão mantém o design premium atual e roda sem Supabase, sem RLS e sem Edge Functions. O backend local/produção fica em `server/local-api.mjs`, serve também o frontend buildado e usa banco SQLite por padrão.

## Rodar local no computador

```powershell
npm install
copy .env.local.example .env.local
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

## Rodar em produção/hospedagem VPS

Pré-requisitos:

```bash
node -v   # recomendado Node 22+
npm -v
```

Passo a passo:

```bash
unzip MYINC_SOCIAL_MEDIA_AI_LOCAL_FINAL_100_PRODUCAO_HOSPEDAGEM.zip
cd MYINC_SOCIAL_MEDIA_AI_LOCAL_FINAL_100_PRODUCAO_HOSPEDAGEM
cp .env.production.example .env.production
cp .env.production .env.local
nano .env.local
npm install
npm run build
node server/local-api.mjs
```

Depois acesse pelo navegador:

```txt
http://IP_DO_SERVIDOR:8787
```

Com proxy/SSL, aponte o domínio para a porta `8787`.

## Variáveis principais

```env
DATABASE_DRIVER=sqlite
LOCAL_API_HOST=0.0.0.0
LOCAL_API_PORT=8787
VITE_SUPABASE_URL=same-origin
VITE_SUPABASE_ANON_KEY=local-myinc-anon-key
OPENAI_API_KEY=sua_chave
CLOUDINARY_CLOUD_NAME=seu_cloud
CLOUDINARY_API_KEY=sua_key
CLOUDINARY_API_SECRET=sua_secret
META_PAGE_ID=sua_page
META_INSTAGRAM_BUSINESS_ID=seu_ig_business
META_PAGE_ACCESS_TOKEN=seu_token
```

## Mídia pública para Meta

Para publicar de verdade no Instagram/Facebook, a mídia precisa estar em URL pública HTTPS. Esta versão suporta Cloudinary. Configure:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=myinc-social-media-ai
```

Com Cloudinary configurado, imagens e vídeos gerados tentam subir para URL HTTPS automaticamente.

## Vídeo MP4

A versão gera storyboard e pode gerar MP4 simples local se o FFmpeg estiver instalado:

```env
ENABLE_LOCAL_FFMPEG_VIDEO=true
FFMPEG_PATH=ffmpeg
LOCAL_VIDEO_DURATION_SECONDS=8
```

Instalar FFmpeg em Ubuntu:

```bash
sudo apt update
sudo apt install -y ffmpeg
```

## Atualizar hospedagem

Linux/VPS:

```bash
bash scripts/update-hosting.sh
```

Windows:

```powershell
.\scripts\update-hosting.ps1
```

Ou pelo script Node:

```bash
npm run hosting:update
```

O script faz backup antes de atualizar.

## Backup

Criar backup manual:

```bash
npm run backup:create
```

Restaurar backup:

```bash
npm run backup:restore -- ./data/backups/NOME_DO_BACKUP
```

## Docker

```bash
docker compose up -d --build
```

O volume `./data:/app/data` preserva banco, uploads e backups.

## EXE Windows

Esta versão já inclui estrutura Electron.

```powershell
npm install
npm run desktop:build
```

O instalador será gerado na pasta `dist_electron`/`dist` conforme configuração do electron-builder.

## Observações de produção

- Troque `LOCAL_ADMIN_PASSWORD` antes de subir.
- Não suba `.env.local` real para GitHub.
- Use Cloudinary ou domínio HTTPS para publicação Meta real.
- Use backup antes de qualquer atualização.
- Para produção estável, rode com PM2/EasyPanel/Docker.
