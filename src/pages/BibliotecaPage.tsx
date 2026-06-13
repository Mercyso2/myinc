import { useEffect, useState } from "react";
import { brandScoped, currentBrandId, selectRows } from "../lib/api";
import { useAuth } from "../lib/auth";

type LibraryItem = { id: string; name: string; notes?: string; url?: string; item_type?: string; ai_allowed?: boolean; status?: string };

export function BibliotecaPage() {
  const { session, profile } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { if (session) selectRows<LibraryItem>("library_items", session.access_token, brandScoped("select=*&order=created_at.desc&limit=120", currentBrandId(profile))).then(setItems).catch((e) => setError(e.message)); }, [session, profile]);
  return <section className="page-stack"><header className="page-header"><div><p className="eyebrow">Biblioteca e referências</p><h1>Materiais usados pelo cérebro IA</h1><p>Referências com <code>ai_allowed=true</code> entram nos prompts do worker.</p></div></header>{error ? <div className="alert error">{error}</div> : null}<div className="cards-grid">{items.map((item) => <article className="glass-card" key={item.id}><span className="pill">{item.item_type || "referência"}</span><h3>{item.name}</h3><p>{item.notes || "Sem notas."}</p><small>{item.ai_allowed ? "IA pode usar" : "IA bloqueada"}</small></article>)}</div></section>;
}
