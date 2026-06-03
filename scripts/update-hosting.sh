#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== MYINC update hosting =="
node scripts/backup-now.mjs || true
if [ -d .git ]; then git pull --ff-only; fi
npm install
npm run build
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart myinc-social-media-ai || pm2 start server/local-api.mjs --name myinc-social-media-ai
else
  echo "Atualizado. Reinicie seu serviço Node/EasyPanel apontando para: node server/local-api.mjs"
fi
