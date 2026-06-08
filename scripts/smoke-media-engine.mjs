import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const errors = [];
const warnings = [];
function must(condition, message) {
  if (!condition) errors.push(message);
}
function warn(condition, message) {
  if (!condition) warnings.push(message);
}
const server = fs.readFileSync(path.join(root, "server/local-api.mjs"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

must(
  server.includes("buildProductionImagePrompt"),
  "Motor de prompt visual premium não encontrado.",
);
must(server.includes("assertGeneratedImageBuffer"), "Validação binária de imagem não encontrada.");
must(
  server.includes("openAiVideoCreateAndDownload"),
  "Integração OpenAI Videos/Sora não encontrada.",
);
must(
  server.includes("ALLOW_LOCAL_PUBLISH_SIMULATION"),
  "Bloqueio de falso positivo de publicação não encontrado.",
);
must(server.includes("LOCAL_AUTH_REQUIRED"), "Proteção do backend local não encontrada.");
must(
  fs.existsSync(path.join(root, "supabase/functions/generate-video/index.ts")),
  "Edge Function generate-video ausente.",
);
must(
  fs.existsSync(path.join(root, "supabase/migrations/20260603000000_media_engine_production.sql")),
  "Migration do media engine ausente.",
);
must(
  !fs.existsSync(path.join(root, ".env.local")),
  ".env.local não deve ser empacotado no ZIP final.",
);

const envProd = fs.readFileSync(path.join(root, ".env.production.example"), "utf8");
warn(
  envProd.includes("OPENAI_IMAGE_MODEL=gpt-image-1.5"),
  "Env produção não está apontando para gpt-image-1.5.",
);
warn(
  envProd.includes("ENABLE_OPENAI_VIDEO=true"),
  "Env produção não ativa vídeo OpenAI por padrão.",
);
warn(pkg.version.includes("media-engine"), "package.json não sinaliza versão media-engine.");

if (warnings.length) {
  console.log("WARNINGS");
  for (const item of warnings) console.log("-", item);
}
if (errors.length) {
  console.error("ERRORS");
  for (const item of errors) console.error("-", item);
  process.exit(1);
}
console.log("Smoke OK — Media Engine Production presente.");
