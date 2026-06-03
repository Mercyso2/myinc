import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataDir = path.resolve(root, process.env.DATA_DIR || "data");
const backupDir = path.join(dataDir, "backups");
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.join(backupDir, `${stamp}-backup-manual`);
fs.mkdirSync(out, { recursive: true });
for (const file of ["myinc-local-db.json", "myinc.sqlite"]) {
  const src = path.join(dataDir, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, file));
}
const uploads = path.join(dataDir, "uploads");
if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(out, "uploads"), { recursive: true });
console.log(`Backup criado em: ${out}`);
