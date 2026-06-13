import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RuntimeHealth } from "../lib/types";

const defaultSettings = {
  OPENAI_API_KEY: "",
  OPENAI_TEXT_MODEL: "gpt-4.1",
  OPENAI_IMAGE_MODEL: "gpt-image-1",
  OPENAI_IMAGE_FALLBACK_MODELS: "gpt-image-1",
  OPENAI_IMAGE_QUALITY: "high",
  MEDIA_BUCKET: "creative-media",
  PUBLIC_MEDIA_BASE_URL: "",
  META_GRAPH_VERSION: "v23.0",
  META_PAGE_ACCESS_TOKEN: "",
  META_PAGE_ID: "",
  META_INSTAGRAM_BUSINESS_ID: "",
  OPENAI_VIDEO_ENDPOINT: "",
  OPENAI_VIDEO_MODEL: "",
  WORKER_BRAND_ID: "",
  DEFAULT_BRAND_ID: "",
  ISOLATED_ENVIRONMENT_NAME: "myinc-vercel-isolado"
};

export function AdminPage() {
  const { session, isAdmin } = useAuth();
  const [form, setForm] = useState(defaultSettings);
  const [health, setHealth] = useState<RuntimeHealth | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadHealth() {
    if (!session) return;
    setHealth(await apiGet<RuntimeHealth>("/api/debug/health", session));
  }
  useEffect(() => { void loadHealth().catch((err) => setError(err instanceof Error ? err.message : String(err))); }, [session]);

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const settings = Object.fromEntries(Object.entries(form).filter(([, v]) => String(v).trim()));
      await apiPost("/api/admin/save-settings", session, { settings });
      setForm((f) => ({ ...f, OPENAI_API_KEY: "", META_PAGE_ACCESS_TOKEN: "" }));
      await loadHealth();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  return <section className="page-stack">
    <header className="page-header"><div><p className="eyebrow">Painel ADM</p><h1>Configurações, diagnóstico e chaves</h1><p>As chaves ficam no Supabase <code>runtime_secrets</code> e são lidas pelo Worker Vercel em tempo de execução.</p></div></header>
    {!isAdmin ? <div className="alert error">Seu perfil não é admin. O salvamento de chaves será bloqueado.</div> : null}
    {error ? <div className="alert error">{error}</div> : null}
    <div className="grid-2">
      <form className="glass-card settings-form" onSubmit={save}>
        <h2>Credenciais seguras</h2>
        {Object.entries(form).map(([key, value]) => <label key={key}>{key}<input type={key.includes("KEY") || key.includes("TOKEN") ? "password" : "text"} value={value} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={key} /></label>)}
        <button className="primary-btn" disabled={busy}>{busy ? "Salvando..." : "Salvar no runtime_secrets"}</button>
      </form>
      <article className="glass-card">
        <div className="split"><h2>Diagnóstico real</h2><button onClick={() => void loadHealth()}>Atualizar</button></div>
        {health ? <div className="health-list">
          <Health label="Supabase" ok={health.supabase.connected} detail={health.supabase.configured ? "configurado" : "env ausente"} />
          <Health label="Worker Vercel" ok={health.worker.configured && health.worker.reachable} detail="1 job por chamada" />
          <Health label="Fila" ok={health.queue.reachable} detail={`pendentes ${health.queue.pending} · falhas ${health.queue.failed}`} />
          <Health label="OpenAI API Key" ok={Boolean(health.credentials.OPENAI_API_KEY)} detail="runtime_secrets" />
          <Health label="Modelo texto" ok={Boolean(health.credentials.OPENAI_TEXT_MODEL)} detail={String(health.credentials.OPENAI_TEXT_MODEL || "ausente")} />
          <Health label="Modelo imagem" ok={Boolean(health.credentials.OPENAI_IMAGE_MODEL)} detail={String(health.credentials.OPENAI_IMAGE_MODEL || "ausente")} />
          <Health label="Storage público" ok={health.storage.publicBaseUrl} detail={health.storage.bucket} />
          <Health label="Isolamento brand" ok={Boolean(health.credentials.WORKER_BRAND_ID)} detail={String(health.credentials.WORKER_BRAND_ID || "não configurado")} />
          <Health label="Meta" ok={Boolean(health.credentials.META_PAGE_ACCESS_TOKEN && health.credentials.META_INSTAGRAM_BUSINESS_ID)} detail="token/page/instagram" />
          {health.error ? <div className="alert error">{health.error}</div> : null}
        </div> : <p>Carregando diagnóstico...</p>}
      </article>
    </div>
  </section>;
}

function Health({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return <div className="health-row"><span className={ok ? "dot ok" : "dot fail"}></span><strong>{label}</strong><small>{detail}</small></div>;
}
