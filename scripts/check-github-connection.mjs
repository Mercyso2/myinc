#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
const checks = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

function add(name, ok, detail, fix) {
  checks.push({ name, ok, detail, fix });
}

function checkGithubHttp() {
  const curl = run("curl", ["-I", "https://github.com", "--max-time", "15"]);
  if (curl.ok && /HTTP\/.*\s(2|3)\d\d/.test(curl.stdout)) {
    const statusLine = curl.stdout
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /^HTTP\//.test(line));
    return { ok: true, status: statusLine ?? "HTTP OK" };
  }

  return {
    ok: false,
    error: curl.stderr || curl.stdout || "curl não conseguiu acessar https://github.com",
  };
}

const http = checkGithubHttp();
add(
  "Internet até github.com",
  http.ok,
  http.ok ? `HTTP ${http.status}` : `Falha: ${http.error ?? http.status}`,
  "Verifique DNS, firewall ou acesso de rede do ambiente.",
);

const branch = run("git", ["branch", "--show-current"]);
add(
  "Branch atual",
  branch.ok && Boolean(branch.stdout),
  branch.stdout || "Não foi possível detectar branch.",
);

const commit = run("git", ["rev-parse", "--short", "HEAD"]);
add("Commit local", commit.ok, commit.stdout || commit.stderr);

const remote = run("git", ["remote", "get-url", "origin"]);
add(
  "Remote origin configurado",
  remote.ok && Boolean(remote.stdout),
  remote.ok ? remote.stdout : "Nenhum remote origin configurado neste workspace.",
  "Configure com: git remote add origin git@github.com:OWNER/REPO.git ou https://github.com/OWNER/REPO.git",
);

if (remote.ok && remote.stdout) {
  const lsRemote = run("git", ["ls-remote", "origin", "HEAD"], { timeout: 20000 });
  add(
    "Acesso ao repositório remoto",
    lsRemote.ok,
    lsRemote.ok ? "origin respondeu ao ls-remote." : lsRemote.stderr || lsRemote.stdout,
    "Confirme permissões, token/SSH key e se o repositório existe no GitHub.",
  );
} else {
  add(
    "Acesso ao repositório remoto",
    false,
    "Pulando teste: origin não existe.",
    "Adicione o remote origin antes de fazer push.",
  );
}

const ghPath = run("bash", ["-lc", "command -v gh"]);
add(
  "GitHub CLI instalada",
  ghPath.ok && Boolean(ghPath.stdout),
  ghPath.ok ? ghPath.stdout : "gh não está instalado neste ambiente.",
  "Instale gh ou use git push via SSH/HTTPS com credenciais.",
);

if (ghPath.ok && ghPath.stdout) {
  const auth = run("gh", ["auth", "status"], { timeout: 20000 });
  add(
    "Autenticação GitHub CLI",
    auth.ok,
    auth.ok ? "gh autenticado." : auth.stderr || auth.stdout,
    "Autentique com: gh auth login",
  );
} else {
  add(
    "Autenticação GitHub CLI",
    false,
    "Pulando teste: gh não está instalado.",
    "Autentique via gh ou configure credenciais Git.",
  );
}

console.log("\nMYINC GitHub connection check\n");
for (const check of checks) {
  console.log(`${check.ok ? "✅" : "❌"} ${check.name}: ${check.detail}`);
  if (!check.ok && check.fix) console.log(`   Correção: ${check.fix}`);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.log(
    "\nResultado: conexão GitHub incompleta. O código está local, mas não há como aparecer no GitHub até configurar remote/credenciais e fazer push.",
  );
  console.log("Comandos típicos depois de configurar o repositório:");
  console.log("  git remote add origin git@github.com:OWNER/REPO.git");
  console.log("  git push -u origin HEAD");
  console.log("  git tag v1.0.0-stable");
  console.log("  git push origin v1.0.0-stable");
  process.exit(1);
}

console.log("\nResultado: conexão GitHub pronta para push.");
try {
  const currentBranch = execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  }).trim();
  console.log(`Próximo passo: git push -u origin ${currentBranch}`);
} catch {
  console.log("Próximo passo: git push -u origin HEAD");
}
