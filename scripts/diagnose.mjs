import { readFile } from "node:fs/promises";

const requiredServer = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = requiredServer.filter((key) => !process.env[key]);
const worker = await readFile(new URL("../api/worker/process.js", import.meta.url), "utf8");
const report = {
  serverEnvironment: Object.fromEntries(
    requiredServer.map((key) => [key, Boolean(process.env[key])]),
  ),
  optionalWakeUp: { CRON_SECRET: Boolean(process.env.CRON_SECRET) },
  architecture: {
    atomicLockRpc: worker.includes("rpc/claim_generation_job"),
    oneJobPerRequest: worker.includes("const MAX_JOBS = 1"),
    runtimeSecrets: worker.includes('rest("runtime_secrets?select=key,value")'),
  },
};
console.log(JSON.stringify(report, null, 2));
if (missing.length)
  console.warn(
    `Diagnóstico estático concluído; conexão real não testada porque faltam: ${missing.join(", ")}`,
  );
