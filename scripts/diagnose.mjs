#!/usr/bin/env node
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter((key) => !process.env[key]);
console.log("MYINC diagnose v2.0.1");
console.log("Node:", process.version);
console.log("Required env:", missing.length ? `faltando ${missing.join(", ")}` : "ok");
console.log("WORKER_BRAND_ID:", process.env.WORKER_BRAND_ID || process.env.DEFAULT_BRAND_ID || "⚠️ vazio — risco em banco compartilhado");
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("Modo estático: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para teste vivo.");
  process.exit(0);
}
const url = process.env.SUPABASE_URL.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function rest(path) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const text = await response.text();
  return { ok: response.ok, status: response.status, body: text.slice(0, 500) };
}
for (const table of ["posts", "generation_jobs", "generation_job_events", "runtime_secrets", "media_assets", "system_logs"]) {
  const result = await rest(`${table}?select=*&limit=1`);
  console.log(`${table}:`, result.ok ? "ok" : `erro ${result.status} ${result.body}`);
}
const brandId = process.env.WORKER_BRAND_ID || process.env.DEFAULT_BRAND_ID;
if (brandId) {
  const q = `generation_jobs?select=id,status,brand_id&brand_id=eq.${encodeURIComponent(brandId)}&limit=3`;
  const result = await rest(q);
  console.log("brand scope jobs:", result.ok ? "ok" : `erro ${result.status} ${result.body}`);
}
console.log("Diagnóstico concluído.");
