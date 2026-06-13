import { useEffect, useState } from "react";
import { brandScoped, currentBrandId, selectRows } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { SocialPost } from "../lib/types";

export function CalendarioPage() {
  const { session, profile } = useAuth();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  useEffect(() => { if (session) selectRows<SocialPost>("posts", session.access_token, brandScoped("select=*&order=scheduled_at.asc&limit=150", currentBrandId(profile))).then(setPosts); }, [session, profile]);
  return <section className="page-stack"><header className="page-header"><div><p className="eyebrow">Calendário</p><h1>Agendamento editorial</h1><p>Visualização simples por data. A publicação Meta fica em endpoint separado e com logs.</p></div></header><div className="glass-card table-card"><table><thead><tr><th>Data</th><th>Título</th><th>Formato</th><th>Status</th></tr></thead><tbody>{posts.map((p) => <tr key={p.id}><td>{p.scheduled_at ? new Date(p.scheduled_at).toLocaleString("pt-BR") : "—"}</td><td>{p.title}</td><td>{p.format || "—"}</td><td>{p.status}</td></tr>)}</tbody></table></div></section>;
}
