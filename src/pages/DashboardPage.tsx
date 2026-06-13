import { useEffect, useMemo, useState } from "react";
import { brandScoped, currentBrandId, selectRows } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { GenerationJob, SocialPost } from "../lib/types";

export function DashboardPage() {
  const { session, profile } = useAuth();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!session) return;
    Promise.all([
      selectRows<SocialPost>("posts", session.access_token, brandScoped("select=*&order=updated_at.desc&limit=80", currentBrandId(profile))),
      selectRows<GenerationJob>("generation_jobs", session.access_token, brandScoped("select=*&order=created_at.desc&limit=80", currentBrandId(profile)))
    ]).then(([p, j]) => { setPosts(p); setJobs(j); }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [session, profile]);
  const stats = useMemo(() => ({
    total: posts.length,
    fila: jobs.filter((j) => ["queued", "processing", "retrying"].includes(j.status)).length,
    revisao: posts.filter((p) => p.status === "aguardando_revisao").length,
    erros: posts.filter((p) => p.status === "erro_ia").length,
    publicados: posts.filter((p) => p.status === "publicado").length
  }), [posts, jobs]);
  return <section className="page-stack">
    <header className="page-header">
      <div><p className="eyebrow">Arquitetura Vercel + Supabase</p><h1>Central de produção MYINC</h1><p>Motor compute-safe: um job por chamada, sem IA pesada no Supabase Edge.</p></div>
    </header>
    {error ? <div className="alert error">{error}</div> : null}
    <div className="stats-grid">
      <div className="stat-card"><span>Posts</span><strong>{stats.total}</strong><small>conteúdos ativos e históricos</small></div>
      <div className="stat-card"><span>Fila IA</span><strong>{stats.fila}</strong><small>jobs aguardando/processando</small></div>
      <div className="stat-card"><span>Revisão</span><strong>{stats.revisao}</strong><small>prontos para aprovação humana</small></div>
      <div className="stat-card"><span>Erros</span><strong>{stats.erros}</strong><small>reprocessáveis pelo painel</small></div>
      <div className="stat-card"><span>Publicados</span><strong>{stats.publicados}</strong><small>saída Meta registrada</small></div>
    </div>
    <div className="grid-2">
      <article className="glass-card"><h2>Fluxo oficial</h2><ol className="timeline"><li>Planeje posts do mês.</li><li>Envie para fila.</li><li>Processe na Vercel, 1 job por chamada.</li><li>Revise, aprove e publique.</li></ol></article>
      <article className="glass-card"><h2>Status do motor</h2><p>Chaves ficam em <code>runtime_secrets</code>. A Vercel usa apenas <code>SUPABASE_SERVICE_ROLE_KEY</code> para buscar credenciais e processar IA fora do Supabase Free.</p></article>
    </div>
  </section>;
}
