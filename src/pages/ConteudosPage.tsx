import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPost, brandScoped, currentBrandId, patchRow, selectRows } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { GenerationJob, SocialPost } from "../lib/types";

type BatchResult = { ok: boolean; batchId: string; queued: number; jobs: GenerationJob[]; message: string };
type ProcessResult = { ok: boolean; processed: number; job?: GenerationJob | null; message?: string; error?: string };

const activeStatuses = new Set(["rascunho", "tema_aprovado", "em_fila", "copy_gerada", "ajuste_solicitado", "erro_ia", "aguardando_revisao", "aprovado"]);

export function ConteudosPage() {
  const { session, profile } = useAuth();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [selected, setSelected] = useState<SocialPost | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    const [p, j] = await Promise.all([
      selectRows<SocialPost>("posts", session.access_token, brandScoped("select=*&order=updated_at.desc&limit=200", currentBrandId(profile))),
      selectRows<GenerationJob>("generation_jobs", session.access_token, brandScoped("select=*&order=created_at.desc&limit=200", currentBrandId(profile)))
    ]);
    setPosts(p);
    setJobs(j);
    setSelected((current) => current ? p.find((item) => item.id === current.id) ?? null : null);
  }, [session, profile]);

  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : String(err))); }, [load]);

  const activePosts = useMemo(() => posts.filter((p) => activeStatuses.has(String(p.status))), [posts]);
  const reviewPosts = useMemo(() => posts.filter((p) => p.status === "aguardando_revisao"), [posts]);
  const errorPosts = useMemo(() => posts.filter((p) => p.status === "erro_ia"), [posts]);

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true); setError(""); setLog((l) => [`▶ ${label}`, ...l].slice(0, 60));
    try {
      const result = await action();
      setLog((l) => [`✅ ${label}: ${JSON.stringify(result).slice(0, 280)}`, ...l].slice(0, 60));
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg); setLog((l) => [`❌ ${label}: ${msg}`, ...l].slice(0, 60));
    } finally { setBusy(false); }
  }

  async function createBatch(postIds: string[]) {
    if (!session) return;
    const brandId = currentBrandId(profile);
    if (!brandId) throw new Error("Nenhum brand_id encontrado. Crie uma marca/brand no Supabase.");
    return apiPost<BatchResult>("/api/jobs/create-batch", session, {
      brandId,
      postIds,
      instruction: "Produção premium MYINC: copy, imagem, carrossel e vídeo com memória de marca e prompt forte."
    });
  }

  async function processLoop(max = 25) {
    if (!session) return;
    const results: ProcessResult[] = [];
    for (let i = 0; i < max; i++) {
      const result = await apiPost<ProcessResult>("/api/jobs/process-next", session, {});
      results.push(result);
      setLog((l) => [`⚙️ Passo ${i + 1}: ${result.message ?? JSON.stringify(result).slice(0, 180)}`, ...l].slice(0, 60));
      if (!result.ok || result.processed === 0) break;
    }
    return { ok: true, steps: results.length, processed: results.reduce((s, r) => s + Number(r.processed || 0), 0) };
  }

  async function approve(id: string) {
    if (!session) return;
    return patchRow<SocialPost>("posts", session.access_token, id, { status: "aprovado", updated_at: new Date().toISOString() } as Partial<SocialPost>);
  }

  return <section className="page-stack">
    <header className="page-header"><div><p className="eyebrow">Estúdio criativo</p><h1>Conteúdos e fila IA</h1><p>Geração pesada na Vercel. Supabase só guarda fila, mídia, logs e status.</p></div></header>
    {error ? <div className="alert error">{error}</div> : null}
    <div className="action-bar">
      <button disabled={busy || !activePosts.length} className="primary-btn" onClick={() => run("Fazer tudo automático", async () => { await createBatch(activePosts.map((p) => p.id)); return processLoop(35); })}>Fazer tudo 100% automático</button>
      <button disabled={busy || !activePosts.length} onClick={() => run("Enviar todos para fila", () => createBatch(activePosts.map((p) => p.id)))}>Enviar todos para fila</button>
      <button disabled={busy} onClick={() => run("Processar agora", () => processLoop(25))}>Processar agora</button>
      <button disabled={busy || !reviewPosts.length} onClick={() => run("Aprovar em revisão", () => Promise.all(reviewPosts.map((p) => approve(p.id))))}>Aprovar revisão</button>
      <button disabled={busy || !errorPosts.length} onClick={() => run("Reprocessar erros", () => apiPost("/api/jobs/retry", session, { mode: "failed-posts" }))}>Reprocessar erros</button>
      <button disabled={busy} onClick={() => run("Atualizar", load)}>Atualizar</button>
    </div>
    <div className="stats-grid small">
      <div className="stat-card"><span>Ativos</span><strong>{activePosts.length}</strong></div>
      <div className="stat-card"><span>Revisão</span><strong>{reviewPosts.length}</strong></div>
      <div className="stat-card"><span>Jobs</span><strong>{jobs.length}</strong></div>
      <div className="stat-card"><span>Erros</span><strong>{errorPosts.length}</strong></div>
    </div>
    <div className="content-layout">
      <div className="cards-grid">
        {activePosts.map((post) => <article key={post.id} className="post-card" onClick={() => setSelected(post)}>
          <div className="media-preview">{post.media_url ? <img src={post.media_url} /> : <span>sem mídia</span>}</div>
          <div className="post-body"><span className={`pill status-${String(post.status).replace("_", "-")}`}>{post.status}</span><h3>{post.title}</h3><p>{post.caption || post.creative_brief || post.theme || "Aguardando geração do cérebro MYINC."}</p></div>
          {post.error_message ? <div className="alert tiny error">{post.error_message}</div> : null}
        </article>)}
      </div>
      <aside className="detail-panel glass-card">
        <h2>{selected ? selected.title : "Selecione um post"}</h2>
        {selected ? <>
          <p><b>Status:</b> {selected.status}</p>
          <p><b>Formato:</b> {selected.format || "Feed/Stories"}</p>
          <p><b>Headline:</b> {selected.headline || "—"}</p>
          <p><b>Legenda:</b> {selected.caption || "—"}</p>
          <p><b>Prompt imagem:</b> {selected.image_prompt || "—"}</p>
          <div className="button-stack"><button onClick={() => run("Enviar post para fila", () => createBatch([selected.id]))}>Enviar este para fila</button><button onClick={() => run("Aprovar post", () => approve(selected.id))}>Aprovar</button></div>
        </> : <p>Abra um card para ver copy, prompt, mídia, logs e ações.</p>}
        <h3>Log da sessão</h3>
        <div className="console-log">{log.map((line, idx) => <div key={idx}>{line}</div>)}</div>
      </aside>
    </div>
  </section>;
}
