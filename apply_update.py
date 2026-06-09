from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path.cwd()
PKG = Path(__file__).resolve().parent
FILES = PKG / "files"
BACKUP = ROOT / f"backup_before_myinc_async_update_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

if not (ROOT / "package.json").exists():
    raise SystemExit("ERRO: rode este script dentro da raiz do projeto MYINC, onde existe package.json")

copied = []
for src in FILES.rglob("*"):
    if src.is_dir():
        continue
    rel = src.relative_to(FILES)
    dest = ROOT / rel
    if dest.exists():
        bkp = BACKUP / rel
        bkp.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(dest, bkp)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    copied.append(str(rel))

print("Atualização MYINC async generation aplicada.")
print(f"Arquivos copiados: {len(copied)}")
for item in copied:
    print(" -", item)
if BACKUP.exists():
    print("Backup dos arquivos substituídos em:", BACKUP)
print("\nPróximos passos:")
print("1) npm install")
print("2) supabase db push")
print("3) supabase functions deploy generate-image")
print("4) supabase functions deploy generate-images-batch")
print("5) supabase functions deploy generate-videos-batch")
print("6) supabase functions deploy generation-status")
print("7) subir worker/myinc-generation-worker no EasyPanel/VPS e iniciar npm start")
