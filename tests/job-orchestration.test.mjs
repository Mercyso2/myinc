import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("worker uses atomic Supabase lock and processes one job", async () => {
  const [worker, migration] = await Promise.all([
    read("api/worker/process.js"),
    read("supabase/migrations/20260612090000_vercel_job_orchestration.sql"),
  ]);
  assert.match(worker, /rpc\/claim_generation_job/);
  assert.match(worker, /const MAX_JOBS = 1/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /status in \('queued', 'pending', 'retrying'\)/i);
});

test("frontend processes through authenticated Vercel route, not Edge", async () => {
  const repository = await read("src/lib/repositories/generation-worker-repository.ts");
  assert.match(repository, /"\/api\/jobs\/process-next"/);
  assert.match(repository, /"\/api\/worker\/process"/);
  assert.match(repository, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(repository, /"process-next-generation-job",\s*token/);
});

test("secrets stay server-side and health endpoint returns booleans only", async () => {
  const files = await Promise.all([
    read("src/lib/repositories/generation-worker-repository.ts"),
    read("api/debug/health.js"),
  ]);
  assert.doesNotMatch(files.join("\n"), /NEXT_PUBLIC_(OPENAI|META|SUPABASE_SERVICE)/);
  assert.match(files[1], /masked: maskSecret\(openAiKey\)/);
  assert.doesNotMatch(files[1], /OPENAI_API_KEY:\s*value/);
  assert.doesNotMatch(files[1], /openAiKey,\s*$/m);
});

test("Meta publication asset update has one valid table selector", async () => {
  const publish = await read("supabase/functions/publish-meta/index.ts");
  assert.doesNotMatch(publish, /\.from\("media_assets"\)\s*\.from\("media_assets"\)/);
});

test("queue draining continues after a failed job and studio allows enough steps for images", async () => {
  const [repository, studio] = await Promise.all([
    read("src/lib/repositories/generation-worker-repository.ts"),
    read("src/routes/conteudos.tsx"),
  ]);
  assert.match(repository, /if \(result\.processed === 0\) break/);
  assert.doesNotMatch(repository, /if \(!result\.ok \|\| result\.processed === 0\) break/);
  assert.match(studio, /async function processNow\(passes = 120\)/);
  assert.match(studio, /toast\.error\(message\)/);
});

test("media actions enqueue media directly without a higher-priority content job", async () => {
  const [posts, queue] = await Promise.all([
    read("src/lib/repositories/post-repository.ts"),
    read("supabase/functions/process-production-queue/index.ts"),
  ]);
  assert.match(posts, /includeContent: false/);
  assert.match(queue, /if \(payload\.includeContent !== false\)/);
});

test("technical diagnostics mask secrets and require an active admin", async () => {
  const [health, saveSettings] = await Promise.all([
    read("api/debug/health.js"),
    read("supabase/functions/admin-save-settings/index.ts"),
  ]);
  assert.match(health, /maskSecret/);
  assert.match(health, /profile\.role !== "admin"/);
  assert.doesNotMatch(health, /openAiKey,\s*$/m);
  assert.match(saveSettings, /profile\.role !== "admin"/);
});

test("Vercel failures fall back to the Edge processor that can read Edge secrets", async () => {
  const [repository, edgeProcessor, admin] = await Promise.all([
    read("src/lib/repositories/generation-worker-repository.ts"),
    read("supabase/functions/process-next-generation-job-safe/index.ts"),
    read("src/routes/admin.tsx"),
  ]);
  assert.match(repository, /"process-next-generation-job-safe"/);
  assert.match(repository, /processor: "supabase-edge"/);
  assert.match(edgeProcessor, /rpc\("claim_generation_job"/);
  assert.match(edgeProcessor, /claimQueuedFallback/);
  assert.match(admin, /OpenAI nos Secrets da Supabase Edge/);
});

test("shared Edge CORS reflects authenticated HTTPS production origins", async () => {
  const runtime = await read("supabase/functions/_shared/runtime-config.ts");
  assert.match(runtime, /origin\.startsWith\("https:\/\/"\)/);
  assert.match(runtime, /"Access-Control-Allow-Origin": responseOrigin/);
  assert.match(runtime, /Vary: "Origin, Access-Control-Request-Headers"/);
});

test("admin status tests the OpenAI secret inside the Edge runtime", async () => {
  const status = await read("supabase/functions/admin-status/index.ts");
  assert.match(status, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(status, /fetch\("https:\/\/api\.openai\.com\/v1\/models"/);
  assert.match(status, /openaiConnection: edgeOpenAiConnection/);
});
