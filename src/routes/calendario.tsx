import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, ChevronRight, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarView,
  CreativeReviewModal,
  EmptyState,
  ErrorState,
  LoadingState,
  PublishControlPanel,
} from "@/components/social-components";
import { useAuth } from "@/lib/auth";
import {
  approvePost,
  archivePost,
  contentCommentRepository,
  generatePostContent,
  generatePostImage,
  hydratePostRelations,
  postRepository,
  publishPostNow,
  updatePostContent,
} from "@/lib/repositories/post-repository";
import { processPublishQueue, schedulePost } from "@/lib/repositories/publish-queue-repository";
import { postRowToSocialPost } from "@/lib/social-mappers";
import type { PostRow } from "@/lib/supabase/types";
import type { SocialPost } from "@/lib/social-types";

export const Route = createFileRoute("/calendario")({
  head: () => ({ meta: [{ title: "Calendário — MYINC" }] }),
  component: Calendario,
});

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

function Calendario() {
  const { session, profile } = useAuth();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selected, setSelected] = useState<SocialPost | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const min = startOfMonth(month).toISOString();
      const max = endOfMonth(month).toISOString();
      const filter = `scheduled_at=gte.${encodeURIComponent(min)}&scheduled_at=lte.${encodeURIComponent(max)}&deleted_at=is.null&order=scheduled_at.asc`;
      const rows = profile?.brand_id
        ? await postRepository.listByBrand(session.access_token, profile.brand_id, filter, false)
        : await postRepository.list(session.access_token, `select=*&${filter}`);
      const relations = await hydratePostRelations(session.access_token, rows);
      const mapped = rows.map((row) =>
        postRowToSocialPost(
          row,
          relations.versions.get(row.id) ?? [],
          relations.comments.get(row.id) ?? [],
        ),
      );
      setPosts(mapped);
      setSelected((current) =>
        current ? (mapped.find((post) => post.id === current.id) ?? null) : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar calendário real.");
    } finally {
      setLoading(false);
    }
  }, [month, profile?.brand_id, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(
    label: string,
    action: () => Promise<unknown>,
    options: { closeModal?: boolean } = {},
  ) {
    setLoading(true);
    setError("");
    try {
      await action();
      toast.success(label);
      if (options.closeModal) setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ação do calendário falhou.");
    } finally {
      setLoading(false);
    }
  }

  const approved = useMemo(() => posts.filter((post) => post.status === "aprovado"), [posts]);
  const scheduled = useMemo(
    () => posts.filter((post) => ["agendado", "publicado", "erro"].includes(post.status)),
    [posts],
  );

  async function scheduleApproved() {
    await Promise.all(
      approved.map((post) =>
        schedulePost(session!.access_token, post as unknown as PostRow, post.scheduledAt),
      ),
    );
  }

  async function publishFirstReady() {
    const ready = posts.find((post) => ["aprovado", "agendado"].includes(post.status));
    if (!ready) throw new Error("Nenhum post aprovado/agendado para publicar agora.");
    await publishPostNow(session!.access_token, ready.id);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <PageHeader
        title="Calendário e Fila de Publicação"
        description="Mês real, agendamento persistente, publicação imediata, processamento de fila e revisão por post."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading}
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Mês anterior
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading}
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              Próximo mês <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || !approved.length}
              onClick={() => run("Aprovados enviados para fila de publicação.", scheduleApproved)}
            >
              <CalendarDays className="h-4 w-4" /> Agendar aprovados
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading}
              onClick={() =>
                run("Fila de publicação processada.", () =>
                  processPublishQueue(session!.access_token, 5),
                )
              }
            >
              <RefreshCw className="h-4 w-4" /> Processar fila
            </Button>
            <Button
              className="rounded-full bg-gradient-primary text-primary-foreground"
              disabled={loading}
              onClick={() => run("Publicação Meta solicitada.", publishFirstReady)}
            >
              <Play className="h-4 w-4" /> Publicar agora
            </Button>
          </div>
        }
      />
      {loading ? <LoadingState label="Sincronizando calendário, posts e fila real..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      <Tabs defaultValue="mes" className="space-y-5">
        <TabsList className="flex h-auto flex-wrap justify-start rounded-2xl bg-muted p-1">
          <TabsTrigger value="mes">Mês</TabsTrigger>
          <TabsTrigger value="semana">Semana</TabsTrigger>
          <TabsTrigger value="lista">Lista e fila</TabsTrigger>
          <TabsTrigger value="agendados">Agendados/publicados</TabsTrigger>
        </TabsList>
        <TabsContent value="mes">
          {posts.length ? (
            <CalendarView posts={posts} onOpen={setSelected} />
          ) : (
            <EmptyState
              title="Nenhum post neste mês"
              description="Aprove e agende posts para preencher o calendário editorial."
            />
          )}
        </TabsContent>
        <TabsContent value="semana">
          {posts.length ? (
            <CalendarView posts={posts.slice(0, 7)} onOpen={setSelected} />
          ) : (
            <EmptyState
              title="Semana vazia"
              description="Nenhum post real encontrado para a semana."
            />
          )}
        </TabsContent>
        <TabsContent value="lista">
          {posts.length ? (
            <PublishControlPanel
              posts={posts}
              onOpen={setSelected}
              onSchedule={(post, scheduledAt) =>
                run("Post agendado na fila real.", () =>
                  schedulePost(session!.access_token, post as unknown as PostRow, scheduledAt),
                )
              }
              onArchive={(post) =>
                run("Post arquivado.", () => archivePost(session!.access_token, post.id))
              }
            />
          ) : (
            <EmptyState
              title="Fila vazia"
              description="Aprove posts e use Agendar aprovados para criar itens em publish_queue."
            />
          )}
        </TabsContent>
        <TabsContent value="agendados">
          {scheduled.length ? (
            <PublishControlPanel
              posts={scheduled}
              onOpen={setSelected}
              onSchedule={(post, scheduledAt) =>
                run("Post reagendado.", () =>
                  schedulePost(session!.access_token, post as unknown as PostRow, scheduledAt),
                )
              }
              onArchive={(post) =>
                run("Post arquivado.", () => archivePost(session!.access_token, post.id))
              }
            />
          ) : (
            <EmptyState
              title="Nenhum agendamento ativo"
              description="Quando um post for agendado/publicado, ele fica rastreável aqui."
            />
          )}
        </TabsContent>
      </Tabs>
      <CreativeReviewModal
        post={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onSave={(patch) =>
          run(
            "Edição salva no calendário.",
            () =>
              updatePostContent(session!.access_token, selected!.id, {
                title: patch.title,
                caption: patch.caption,
                hashtags: patch.hashtags,
                cta: patch.cta,
                image_prompt: patch.imagePrompt,
                creative_brief: patch.creativeBrief,
                scheduled_at: patch.scheduledAt,
              } as Partial<PostRow>),
            { closeModal: true },
          )
        }
        onApprove={() =>
          run("Post aprovado.", () => approvePost(session!.access_token, selected!.id), {
            closeModal: true,
          })
        }
        onSchedule={(scheduledAt) =>
          run(
            "Post agendado.",
            () => schedulePost(session!.access_token, selected as unknown as PostRow, scheduledAt),
            { closeModal: true },
          )
        }
        onPublish={() =>
          run(
            "Publicação Meta solicitada.",
            () => publishPostNow(session!.access_token, selected!.id),
            { closeModal: true },
          )
        }
        onRegenerate={(feedback) =>
          run("Nova versão solicitada.", () =>
            generatePostContent(session!.access_token, selected!.id, feedback),
          )
        }
        onGenerateImage={(feedback) =>
          run("Imagem gerada.", () =>
            generatePostImage(session!.access_token, selected!.id, feedback),
          )
        }
        onArchive={() =>
          run("Post arquivado.", () => archivePost(session!.access_token, selected!.id), {
            closeModal: true,
          })
        }
        onAddComment={(comment) =>
          run("Comentário salvo.", () =>
            contentCommentRepository.create(session!.access_token, {
              post_id: selected!.id,
              comment,
              status: "aberto",
              feedback_for_ai: true,
            }),
          )
        }
      />
    </div>
  );
}
