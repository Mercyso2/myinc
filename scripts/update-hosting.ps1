Write-Host "== MYINC update hosting ==" -ForegroundColor Cyan
node scripts/backup-now.mjs
if (Test-Path .git) { git pull --ff-only }
npm install
npm run build
Write-Host "Atualizado. Reinicie o serviço Node/PM2/EasyPanel." -ForegroundColor Green
