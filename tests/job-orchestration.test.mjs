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
  assert.match(repository, /fetch\("\/api\/jobs\/process-next"/);
  assert.match(repository, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(repository, /"process-next-generation-job",\s*token/);
});

test("secrets stay server-side and health endpoint returns booleans only", async () => {
  const files = await Promise.all([
    read("src/lib/repositories/generation-worker-repository.ts"),
    read("api/debug/health.js"),
  ]);
  assert.doesNotMatch(files.join("\n"), /NEXT_PUBLIC_(OPENAI|META|SUPABASE_SERVICE)/);
  assert.match(files[1], /openaiConfigured:/);
  assert.doesNotMatch(files[1], /OPENAI_API_KEY:\s*value/);
});

test("Meta publication asset update has one valid table selector", async () => {
  const publish = await read("supabase/functions/publish-meta/index.ts");
  assert.doesNotMatch(publish, /\.from\("media_assets"\)\s*\.from\("media_assets"\)/);
});
