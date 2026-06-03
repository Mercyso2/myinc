import fs from "node:fs";
import path from "node:path";

const backupArg = process.argv[2];
if (!backupArg) {
  console.error("Uso: npm run backup:restore -- ./data/backups/NOME_DO_BACKUP");
  process.exit(1);
}
const root = process.cwd();
const dataDir = path.resolve(root, process.env.DATA_DIR || "data");
const backupDir = path.resolve(root, backupArg);
if (!fs.existsSync(backupDir)) {
  console.error(`Backup não encontrado: ${backupDir}`);
  process.exit(1);
}
fs.mkdirSync(dataDir, { recursive: true });
const safety = path.join(
  dataDir,
  "backups",
  `${new Date().toISOString().replace(/[:.]/g, "-")}-before-restore`,
);
fs.mkdirSync(safety, { recursive: true });
for (const file of ["myinc-local-db.json", "myinc.sqlite"]) {
  const src = path.join(dataDir, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(safety, file));
}
if (fs.existsSync(path.join(dataDir, "uploads")))
  fs.cpSync(path.join(dataDir, "uploads"), path.join(safety, "uploads"), { recursive: true });
for (const file of ["myinc-local-db.json", "myinc.sqlite"]) {
  const src = path.join(backupDir, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dataDir, file));
}
if (fs.existsSync(path.join(backupDir, "uploads")))
  fs.cpSync(path.join(backupDir, "uploads"), path.join(dataDir, "uploads"), { recursive: true });
console.log(`Backup restaurado de: ${backupDir}`);
console.log(`Cópia de segurança pré-restauração: ${safety}`);
