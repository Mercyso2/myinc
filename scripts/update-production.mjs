import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (res.status !== 0) process.exit(res.status || 1);
}
fs.mkdirSync(path.join(root, "data", "backups"), { recursive: true });
run("node", ["scripts/backup-now.mjs"]);
if (fs.existsSync(path.join(root, ".git"))) run("git", ["pull", "--ff-only"]);
run("npm", ["install"]);
run("npm", ["run", "build"]);
console.log("Atualização concluída. Reinicie o processo Node/PM2/EasyPanel se necessário.");
console.log("PM2: pm2 restart myinc-social-media-ai");
