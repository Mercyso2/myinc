import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, Check, CheckCheck, ChevronLeft, ChevronRight, Rocket, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChannelBadge, EmptyState, ErrorState, FormatDistributionSelector, LoadingState, StatusBadge } from "@/components/social-components";
import { AI_FOCUS_MODES, MYINC_LIGHT_PROFILE_RULE, type AiFocusMode } from "@/lib/ai/focus-modes";
import { useAuth } from "@/lib/auth";
import { getFirstAccessibleBrand } from "@/lib/repositories/brand-repository";
import { generateMonthlyPlan, postIdeaRepository } from "@/lib/repositories/planning-repository";
import { processGenerationBatchSequentially } from "@/lib/repositories/generation-worker-repository";
import { createProductionBatch, postRepository } from "@/lib/repositories/post-repository";
import type { ContentFormat } from "@/lib/social-types";
import type { PostIdeaRow, PostRow } from "@/lib/supabase/types";

export const Route = createFileRoute("/planejamento")({
  head: () => ({
    meta: [
      { title: "Planejamento Mensal — MYINC" },
      {
        name: "description",
        content: "Wizard premium para gerar, editar, aprovar e enviar ideias para produção em massa.",
      },
    ],
  }),
  component: Planejamento,
});

const formatDefaults = {
  "Feed 1080x1350": 8,
  "Feed quadrado 1080x1080": 2,
  "Story 1080x1920": 8,
  "Reels 1080x1920": 6,
  "Carrossel 5 páginas": 4,
  "Carrossel 8 páginas": 0,
  "Facebook 1200x630": 2,
  "Vídeo curto": 0,
  Thumbnail: 0,
} satisfies Record<ContentFormat, number>;

type WizardStep = 0 | 1 | 2 | 3 | 4;

function toInputDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

async function runSequential<T>(items: T[], worker: (item: T) => Promise<unknown>) {
  for (const item of items) await worker(item);
}

function Planejamento() {
  const { session, profile } = useAuth();
  const [step, setStep] = useState<WizardStep>(0);
  const [brandId, setBrandId] = useState("");
  const [brandName, setBrandName] = useState("MYINC");
  const [focusMode, setFocusMode] = useState<AiFocusMode>("equilibrado");
  const [niche, setNiche] = useState("Incorporadora e construtora premium de empreendimentos residenciais e comerciais de alto padrão");
  const [monthlyObjective, setMonthlyObjective] = useState("gerar autoridade, relacionamento, conteúdos úteis e oportunidades comerciais qualificadas");
  const [mainOffer, setMainOffer] = useState("Empreendimentos premium MYINC, arquitetura funcional, localização estratégica e qualidade de vida");
  const [targetAudience, setTargetAudience] = useState("Famílias, investidores e compradores exigentes que buscam imóvel de alto padrão, segurança e valorização");
  const [tone, setTone] = useState("Premium, humano, claro, sofisticado e direto. Linguagem de incorporadora de alto padrão, sem exageros.");
  const [region, setRegion] = useState("Londrina e região");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [campaign, setCampaign] = useState("Planejamento editorial mensal MYINC");
  const [totalPosts, setTotalPosts] = useState(30);
  const [channels, setChannels] = useState("Instagram, Facebook e publicação combinada quando fizer sentido");
  const [pillars, setPillars] = useState("Venda consultiva, autoridade técnica, obra e bastidores, arquitetura e design, localização, lifestyle, prova social, institucional e relacionamento.");
  const [importantDates, setImportantDates] = useState("Datas comerciais do mês, andamento de obras, eventos, entregas, lançamentos e chamadas para atendimento pelo WhatsApp.");
  const [restrictions, setRestrictions] = useState("Evitar promessas absolutas de valorização, poluição visual, textos longos na arte, linguagem genérica e imagens com estética amadora.");
  const [ideas, setIdeas] = useState<PostIdeaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [productionProgress, setProductionProgress] = useState("");

  const formats = useMemo(() => formatDefaults, []);
  const selectedFocus = AI_FOCUS_MODES.find((item) => item.value === focusMode) ?? AI_FOCUS_MODES[0];
  const approved = ideas.filter((idea) => ["tema_aprovado", "aprovado"].includes(idea.status ?? ""));
  const rejected = ideas.filter((idea) => idea.status === "reprovado");
  const archived = ideas.filter((idea) => idea.status === "arquivado" || idea.archived_at);
  const activeIdeas = ideas.filter((idea) => !idea.archived_at && idea.status !== "arquivado");

  const loadBrand = useCallback(async () => {
    if (!session) return;
    const brand = profile?.brand_id ? { id: profile.brand_id } : await getFirstAccessibleBrand(session.access_token);
    if (brand?.id) setBrandId(brand.id);
  }, [profile?.brand_id, session]);

  useEffect(() => {
    void loadBrand();
  }, [loadBrand]);

  async function resolveBrandId() {
    if (!session) throw new Error("Sessão expirada. Faça login novamente.");
    if (brandId) return brandId;
    const brand = await getFirstAccessibleBrand(session.access_token);
    if (!brand) throw new Error("Nenhuma marca encontrada. Rode a seed MYINC ou cadastre a marca antes de gerar planejamento.");
    setBrandId(brand.id);
    return brand.id;
  }

  async function generatePlan() {
    if (!session) return;
    setLoading(true);
    setError("");
    setProductionProgress("");
    try {
      const resolvedBrandId = await resolveBrandId();
      const result = await generateMonthlyPlan(session.access_token, {
        brandId: resolvedBrandId,
        brandName,
        focusMode,
        lightProfileMode: true,
        lightProfileRule: MYINC_LIGHT_PROFILE_RULE,
        niche,
        monthlyObjective,
        mainOffer,
        targetAudience,
        tone,
        region,
        month,
        year,
        campaign,
        totalPosts,
        channels: channels.split(",").map((item) => item.trim()).filter(Boolean),
        formats,
        pillars,
        importantDates,
        restrictions: `${restrictions}\n${MYINC_LIGHT_PROFILE_RULE}\nA IA deve usar o Cérebro IA, prompts, biblioteca e referências aprovadas como fonte principal.`,
      });
      setIdeas(result.ideas);
      toast.success(`${result.ideas.length} ideias geradas com foco em ${selectedFocus.label}.`);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar planejamento real.");
    } finally {
      setLoading(false);
    }
  }

  async function updateIdea(id: string, patch: Partial<PostIdeaRow>) {
    if (!session) return;
    const next = { ...patch };
    if (patch.status === "tema_aprovado") next.approved_at = new Date().toISOString();
    await postIdeaRepository.update(session.access_token, id, next);
    setIdeas((current) => current.map((idea) => (idea.id === id ? { ...idea, ...next } : idea)));
  }

  async function saveIdeaField(id: string, key: keyof PostIdeaRow, value: string | number | null) {
    try {
      await updateIdea(id, { [key]: value } as Partial<PostIdeaRow>);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar ideia.");
    }
  }

  async function approveAll() {
    if (!session) return;
    setLoading(true);
    setError("");
    setProductionProgress("");
    try {
      await runSequential(activeIdeas, (idea) => updateIdea(idea.id, { status: "tema_aprovado" }));
      toast.success("Todos os temas ativos foram aprovados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aprovar em lote.");
    } finally {
      setLoading(false);
    }
  }

  async function sendApprovedToProduction() {
    if (!session) return;
    if (!approved.length) {
      setError("Nenhuma ideia aprovada para produção.");
      return;
    }
    setLoading(true);
    setError("");
    setProductionProgress("Preparando posts e criando fila segura...");
    try {
      const batchId = crypto.randomUUID();
      const rows: Partial<PostRow>[] = approved.map((idea) => ({
        brand_id: idea.brand_id,
        monthly_plan_id: idea.monthly_plan_id,
        source_idea_id: idea.id,
        batch_id: batchId,
        title: idea.theme ?? idea.headline ?? "Post MYINC",
        channel: idea.channel ?? "Instagram",
        format: idea.format ?? "Feed 1080x1350",
        scheduled_at: idea.suggested_at ?? new Date(year, month - 1, 1, 9).toISOString(),
        objective: idea.objective,
        theme: idea.theme,
        headline: idea.headline,
        short_text: idea.short_text,
        caption: idea.short_text,
        cta: idea.cta,
        image_prompt: idea.initial_prompt,
        creative_brief: idea.visual_idea,
        quality_score: idea.predicted_score ?? 0,
        status: "tema_aprovado",
      }));
      const posts = await postRepository.upsert(session.access_token, rows, "source_idea_id");
      await runSequential(posts, (post) => post.source_idea_id ? postIdeaRepository.update(session.access_token, post.source_idea_id, { converted_post_id: post.id } as Partial<PostIdeaRow>) : Promise.resolve());
      const queue = await createProductionBatch(session.access_token, {
        brandId: await resolveBrandId(),
        postIds: posts.map((post) => post.id),
        instruction: `Produção controlada com modo foco ${selectedFocus.label}. Usar visual claro/lite e Cérebro IA completo.`,
      });
      const queued = Number(queue.queued ?? posts.length);
      setProductionProgress(`Fila criada: ${queued} tarefas. Processando uma por vez...`);
      await processGenerationBatchSequentially(session.access_token, {
        batchId: queue.batchId ?? batchId,
        maxSteps: Math.max(queued + 5, posts.length * 10),
        onStep: ({ index, result }) => {
          setProductionProgress(result.processed === 0 ? "Fila finalizada." : `Processando fila segura: tarefa ${index}/${queued}`);
        },
      });
      toast.success(`${posts.length} posts enviados e processados em fila segura.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar aprovados para produção.");
    } finally {
      setLoading(false);
    }
  }

  const steps = ["Objetivo", "Canais", "Pilares", "Restrições", "Ideias"];
  const next = () => setStep((current) => Math.min(4, current + 1) as WizardStep);
  const prev = () => setStep((current) => Math.max(0, current - 1) as WizardStep);

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <PageHeader
        title="Planejamento Mensal"
        description="Wizard premium com modo foco, perfil visual claro e produção controlada pela IA."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" disabled={step === 0 || loading} onClick={prev}><ChevronLeft className="h-4 w-4" /> Voltar</Button>
            <Button variant="outline" className="rounded-full" disabled={step === 4 || loading} onClick={next}>Próximo <ChevronRight className="h-4 w-4" /></Button>
            <Button className="rounded-full bg-gradient-primary text-primary-foreground shadow-glow" disabled={loading} onClick={generatePlan}><Wand2 className="h-4 w-4" /> Gerar {totalPosts} ideias</Button>
          </div>
        }
      />
      {loading ? <LoadingState label={productionProgress || "Executando planejamento com IA, modo foco e Cérebro MYINC..."} /> : null}
      {error ? <ErrorState message={error} /> : null}
      <div className="grid gap-3 md:grid-cols-5">
        {steps.map((label, index) => (
          <button key={label} type="button" onClick={() => setStep(index as WizardStep)} className={`rounded-2xl border p-4 text-left shadow-soft ${step === index ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
            <Badge variant="outline">Etapa {index + 1}</Badge><p className="mt-2 font-bold">{label}</p>
          </button>
        ))}
      </div>

      {step === 0 && (
        <Card className="rounded-3xl shadow-soft"><CardHeader><CardTitle>Briefing principal e modo foco</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
          <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Marca" />
          <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Região" />
          <Input type="number" value={month} onChange={(e) => setMonth(Number(e.target.value))} placeholder="Mês" />
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} placeholder="Ano" />
          <div className="md:col-span-2 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-bold">Modo foco da IA</p>
            <p className="mt-1 text-sm text-muted-foreground">{selectedFocus.description}</p>
            <select value={focusMode} onChange={(e) => setFocusMode(e.target.value as AiFocusMode)} className="mt-3 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {AI_FOCUS_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <Textarea className="md:col-span-2" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Nicho" />
          <Textarea className="md:col-span-2" value={monthlyObjective} onChange={(e) => setMonthlyObjective(e.target.value)} placeholder="Objetivo mensal" />
          <Textarea value={mainOffer} onChange={(e) => setMainOffer(e.target.value)} placeholder="Empreendimento/oferta foco" />
          <Textarea value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Público alvo" />
        </CardContent></Card>
      )}

      {step === 1 && <Card className="rounded-3xl shadow-soft"><CardHeader><CardTitle>Canais e distribuição de formatos</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><Input type="number" value={totalPosts} onChange={(e) => setTotalPosts(Number(e.target.value))} /><Textarea value={channels} onChange={(e) => setChannels(e.target.value)} /></div><FormatDistributionSelector formats={formats} /></CardContent></Card>}
      {step === 2 && <Card className="rounded-3xl shadow-soft"><CardHeader><CardTitle>Pilares editoriais e tom MYINC</CardTitle></CardHeader><CardContent className="grid gap-4"><Textarea className="min-h-28" value={pillars} onChange={(e) => setPillars(e.target.value)} /><Textarea className="min-h-28" value={tone} onChange={(e) => setTone(e.target.value)} /></CardContent></Card>}
      {step === 3 && <Card className="rounded-3xl shadow-soft"><CardHeader><CardTitle>Datas, restrições e regra visual</CardTitle></CardHeader><CardContent className="grid gap-4"><Input value={campaign} onChange={(e) => setCampaign(e.target.value)} /><Textarea className="min-h-28" value={importantDates} onChange={(e) => setImportantDates(e.target.value)} /><Textarea className="min-h-28" value={restrictions} onChange={(e) => setRestrictions(e.target.value)} /><div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground"><strong className="text-foreground">Regra fixa:</strong> {MYINC_LIGHT_PROFILE_RULE}</div></CardContent></Card>}

      {step === 4 && <div className="space-y-5"><div className="rounded-3xl border border-border bg-sidebar p-6 text-sidebar-foreground shadow-elevated"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sidebar-primary">Produção em massa</p><h2 className="mt-2 text-2xl font-bold">{ideas.length || 0} ideias geradas · {approved.length} aprovadas · {rejected.length} reprovadas</h2><p className="mt-2 text-sm text-sidebar-foreground/65">Modo foco: {selectedFocus.label}. Aprove, edite e envie para o Estúdio.</p>{productionProgress ? <p className="mt-2 text-sm font-semibold text-sidebar-primary">{productionProgress}</p> : null}</div><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!activeIdeas.length || loading} onClick={approveAll}><CheckCheck className="h-4 w-4" /> Aprovar todos</Button><Button className="bg-gradient-primary text-primary-foreground" disabled={!approved.length || loading} onClick={sendApprovedToProduction}><Rocket className="h-4 w-4" /> Produzir aprovados</Button></div></div></div><Tabs defaultValue="ativas"><TabsList className="flex h-auto flex-wrap justify-start rounded-2xl bg-muted p-1"><TabsTrigger value="ativas">Ativas</TabsTrigger><TabsTrigger value="arquivadas">Arquivadas ({archived.length})</TabsTrigger></TabsList><TabsContent value="ativas" className="grid gap-4">{activeIdeas.length ? activeIdeas.map((idea, index) => <IdeaCard key={idea.id} idea={idea} index={index} onSave={saveIdeaField} onStatus={(status) => updateIdea(idea.id, { status })} />) : <EmptyState title="Nenhuma ideia ativa" description="Gere um planejamento para revisar temas." />}</TabsContent><TabsContent value="arquivadas" className="grid gap-4">{archived.map((idea, index) => <IdeaCard key={idea.id} idea={idea} index={index} onSave={saveIdeaField} onStatus={(status) => updateIdea(idea.id, { status, archived_at: status === "arquivado" ? new Date().toISOString() : null })} />)}</TabsContent></Tabs></div>}
    </div>
  );
}

function IdeaCard({ idea, index, onSave, onStatus }: { idea: PostIdeaRow; index: number; onSave: (id: string, key: keyof PostIdeaRow, value: string | number | null) => void | Promise<void>; onStatus: (status: string) => void | Promise<void>; }) {
  const [theme, setTheme] = useState(idea.theme ?? "");
  const [headline, setHeadline] = useState(idea.headline ?? "");
  const [format, setFormat] = useState(idea.format ?? "Feed 1080x1350");
  const [channel, setChannel] = useState(idea.channel ?? "Instagram");
  const [cta, setCta] = useState(idea.cta ?? "");
  const [visualIdea, setVisualIdea] = useState(idea.visual_idea ?? "");
  const [suggestedAt, setSuggestedAt] = useState(toInputDate(idea.suggested_at));
  useEffect(() => { setTheme(idea.theme ?? ""); setHeadline(idea.headline ?? ""); setFormat(idea.format ?? "Feed 1080x1350"); setChannel(idea.channel ?? "Instagram"); setCta(idea.cta ?? ""); setVisualIdea(idea.visual_idea ?? ""); setSuggestedAt(toInputDate(idea.suggested_at)); }, [idea]);
  return <Card className="rounded-3xl shadow-soft"><CardContent className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="flex-1"><div className="flex flex-wrap gap-2"><Badge variant="outline">#{index + 1}</Badge><ChannelBadge channel={idea.channel ?? "Instagram"} /><Badge variant="outline">{idea.format ?? "Feed 1080x1350"}</Badge><StatusBadge status={idea.status ?? "rascunho"} /><Badge variant="outline">Score {idea.predicted_score ?? 0}</Badge></div><div className="mt-4 grid gap-3 md:grid-cols-2"><Input value={theme} onChange={(e) => setTheme(e.target.value)} onBlur={() => void onSave(idea.id, "theme", theme)} /><Input value={headline} onChange={(e) => setHeadline(e.target.value)} onBlur={() => void onSave(idea.id, "headline", headline)} /><select value={format} onChange={(e) => { setFormat(e.target.value); void onSave(idea.id, "format", e.target.value); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm">{Object.keys(formatDefaults).map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={channel} onChange={(e) => { setChannel(e.target.value); void onSave(idea.id, "channel", e.target.value); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="Instagram">Instagram</option><option value="Facebook">Facebook</option><option value="Ambos">Ambos</option></select><Input value={cta} onChange={(e) => setCta(e.target.value)} onBlur={() => void onSave(idea.id, "cta", cta)} /><Input type="datetime-local" value={suggestedAt} onChange={(e) => setSuggestedAt(e.target.value)} onBlur={() => suggestedAt && void onSave(idea.id, "suggested_at", new Date(suggestedAt).toISOString())} /><Textarea className="md:col-span-2" value={visualIdea} onChange={(e) => setVisualIdea(e.target.value)} onBlur={() => void onSave(idea.id, "visual_idea", visualIdea)} /></div></div><div className="flex min-w-52 flex-wrap gap-2 lg:justify-end"><Button size="sm" className="bg-gradient-primary text-primary-foreground" onClick={() => void onStatus("tema_aprovado")}><Check className="h-4 w-4" /> Aprovar</Button><Button size="sm" variant="outline" onClick={() => void onStatus("reprovado")}><X className="h-4 w-4" /> Reprovar</Button><Button size="sm" variant="outline" onClick={() => void onStatus("arquivado")}><Archive className="h-4 w-4" /> Arquivar</Button></div></div></CardContent></Card>;
}
