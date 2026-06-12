import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Archive,
  CalendarCheck,
  CheckCheck,
  Clock,
  Database,
  Gauge,
  RadioTower,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import {
  CalendarView,
  ConnectionStatus,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PostCard,
} from "@/components/social-components";
import { ReleaseStatusCard } from "@/components/release-status";
import { useAuth } from "@/lib/auth";
import { postRepository } from "@/lib/repositories/post-repository";
import { postRowToSocialPost } from "@/lib/social-mappers";
import type { SocialPost } from "@/lib/social-types";
import type { PostRow } from "@/lib/supabase/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Central — MYINC Social Media AI" },
      {
        name: "description",
        content:
          "Central de comando para planejar, revisar, aprovar, agendar e publicar conteúdo com IA.",
      },
    ],
  }),
  component: Dashboard,
});

const HIDDEN_STATUSES = new Set(["arquivado", "excluido", "excluído", "deletado", "deleted"]);

function isVisiblePost(row: PostRow) {
  return (
    !row.deleted_at &&
    !row.archived_at &&
    !HIDDEN_STATUSES.has(String(row.status ?? "").toLowerCase())
  );
}

function isArchivedPost(row: PostRow) {
  return Boolean(row.archived_at || HIDDEN_STATUSES.has(String(row.status ?? "").toLowerCase()));
}

function Dashboard() {
  const { session, isLocalFallback } = useAuth();
  const [activePosts, setActivePosts] = useState<SocialPost[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (isLocalFallback) {
          throw new Error(
            "Fallback local não carrega dados falsos. Configure Supabase para dados reais.",
          );
        }
        if (!session) throw new Error("Sessão expirada. Faça login novamente.");
        const rows = await postRepository.list(
          session.access_token,
          "select=*&order=scheduled_at.asc",
        );
        const visibleRows = rows.filter(isVisiblePost);
        if (!cancelled) {
          setActivePosts(visibleRows.map((row) => postRowToSocialPost(row)));
          setArchivedCount(rows.filter(isArchivedPost).length);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar posts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isLocalFallback, session]);

  const posts = activePosts;
  const approved = posts.filter((p) => p.status === "aprovado").length;
  const pending = posts.filter((p) =>
    ["rascunho", "em_producao", "aguardando_revisao"].includes(p.status),
  ).length;
  const published = posts.filter((p) => p.status === "publicado").length;
  const errors = posts.filter((p) => ["erro", "erro_ia"].includes(String(p.status))).length;
  const calendarPosts = useMemo(
    () =>
      posts.filter(
        (p) => Boolean(p.scheduledAt) && !HIDDEN_STATUSES.has(String(p.status).toLowerCase()),
      ),
    [posts],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <PageHeader
        title="Central MYINC Social Media AI"
        description="Planeje 30 publicações mensais, aprove criativos e controle Instagram/Facebook em uma experiência premium guiada. Arquivados não entram nos números operacionais."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              className="rounded-full bg-gradient-primary text-primary-foreground shadow-glow"
            >
              <Link to="/planejamento">
                <Wand2 className="h-4 w-4" />
                Criar planejamento mensal
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/conteudos">
                <Sparkles className="h-4 w-4" />
                Criar post agora
              </Link>
            </Button>
          </div>
        }
      />

      {loading ? <LoadingState label="Carregando dados reais do Supabase..." /> : null}
      {error ? <ErrorState message={error} /> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <MetricCard
          label="Posts ativos"
          value={posts.length}
          helper="operacional"
          icon={Sparkles}
        />
        <MetricCard
          label="Aprovados"
          value={approved}
          helper="prontos"
          icon={CheckCheck}
          tone="success"
        />
        <MetricCard
          label="Pendentes"
          value={pending}
          helper="revisar"
          icon={Clock}
          tone="warning"
        />
        <MetricCard
          label="Publicados"
          value={published}
          helper="Meta"
          icon={RadioTower}
          tone="success"
        />
        <MetricCard
          label="Com erro"
          value={errors}
          helper="reprocessar"
          icon={AlertTriangle}
          tone="destructive"
        />
        <MetricCard label="Arquivados" value={archivedCount} helper="histórico" icon={Archive} />
      </div>

      <ReleaseStatusCard />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Calendário compacto</h2>
              <p className="text-sm text-muted-foreground">
                Mostra apenas posts ativos com data agendada. Arquivados ficam fora da operação.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/calendario">Abrir calendário</Link>
            </Button>
          </div>
          {calendarPosts.length ? (
            <CalendarView posts={calendarPosts} />
          ) : (
            <EmptyState
              title="Nenhum post ativo agendado"
              description="Aprove e agende posts para preencher o calendário editorial."
            />
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-sidebar p-6 text-sidebar-foreground shadow-elevated">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sidebar-primary">
                  Saúde do sistema
                </p>
                <h2 className="mt-2 text-2xl font-bold">Operação com dados reais</h2>
              </div>
              <Gauge className="h-10 w-10 text-sidebar-primary" />
            </div>
            <div className="mt-5 space-y-3">
              <ConnectionStatus
                label="IA"
                status="warning"
                detail="OpenAI roda no worker Vercel e nas Edge Functions configuradas."
              />
              <ConnectionStatus
                label="Meta"
                status="warning"
                detail="Publicação real exige token, Page ID, IG Business ID e mídia HTTPS."
              />
              <ConnectionStatus
                label="Banco de dados"
                status={error ? "offline" : "online"}
                detail="Dashboard consulta posts via Supabase REST."
              />
              <ConnectionStatus
                label="Mocks"
                status={isLocalFallback ? "warning" : "online"}
                detail={
                  isLocalFallback
                    ? "Fallback local sem dados falsos."
                    : "Mock bloqueado no fluxo principal."
                }
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {[
              ["Estúdio Criativo", "/conteudos"],
              ["Biblioteca", "/biblioteca"],
              ["Cérebro da IA", "/cerebro-ia"],
              ["Painel ADM", "/admin"],
            ].map(([label, to]) => (
              <Button key={label} asChild variant="outline" className="justify-between rounded-2xl">
                <Link to={to}>
                  {label}
                  <CalendarCheck className="h-4 w-4" />
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {posts.slice(0, 2).map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Database className="h-4 w-4 text-primary" /> Dados do painel vêm do Supabase; mocks só
          entram em DEMO_MODE=true ou fallback local de desenvolvimento.
        </div>
      </div>
    </div>
  );
}
