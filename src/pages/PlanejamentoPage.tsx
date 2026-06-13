import { FormEvent, useState } from "react";
import { currentBrandId, insertRows } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { SocialPost } from "../lib/types";

const ideas = [
  "Tour arquitetônico de fachada premium",
  "Benefícios de morar perto de áreas verdes",
  "Antes e depois de um projeto bem executado",
  "Carrossel educativo sobre valorização com responsabilidade",
  "Reels com bastidores da obra e acabamento",
  "Post institucional sobre confiança e prazo",
  "Story com enquete para captação de leads",
  "Diferenciais de planta inteligente",
  "Materiais nobres e acabamento",
  "Convite para falar com especialista"
];

export function PlanejamentoPage() {
  const { session, profile } = useAuth();
  const [brandId, setBrandId] = useState(currentBrandId(profile));
  const [count, setCount] = useState(10);
  const [message, setMessage] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const rows = ideas.slice(0, count).map((title, i) => ({
      brand_id: brandId,
      title,
      theme: title,
      objective: "Gerar desejo, autoridade e leads qualificados para a MYINC.",
      channel: i % 3 === 0 ? "Instagram Stories" : "Instagram/Facebook",
      format: i % 4 === 0 ? "Carrossel 5 páginas" : i % 5 === 0 ? "Reels/Vídeo" : "Feed 4:5",
      status: "tema_aprovado",
      scheduled_at: new Date(Date.now() + (i + 1) * 86400000).toISOString()
    })) as Partial<SocialPost>[];
    await insertRows<SocialPost>("posts", session.access_token, rows);
    setMessage(`${rows.length} posts planejados e prontos para a fila.`);
  }
  return <section className="page-stack"><header className="page-header"><div><p className="eyebrow">Planejamento mensal</p><h1>Criar temas de produção</h1><p>Crie uma base de posts para depois enviar ao worker de IA.</p></div></header>
    {message ? <div className="alert success">{message}</div> : null}
    <form className="glass-card settings-form" onSubmit={submit}><label>Brand ID<input value={brandId} onChange={(e) => setBrandId(e.target.value)} /></label><label>Quantidade<input type="number" min={1} max={30} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label><button className="primary-btn">Criar planejamento</button></form>
  </section>;
}
