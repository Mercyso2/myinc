import { spawn } from "node:child_process";

function run(name, command, args) {
  const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  child.on("exit", (code) => {
    if (code && code !== 0) console.error(`${name} saiu com código ${code}`);
  });
  return child;
}

const api = run("api", "node", ["server/local-api.mjs"]);
setTimeout(() => {
  run("vite", "npx", ["vite", "dev", "--host", "127.0.0.1"]);
}, 700);

process.on("SIGINT", () => {
  api.kill("SIGINT");
  process.exit(0);
});
