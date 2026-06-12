import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCheck, ImagePlus, Play, RefreshCw, Rocket, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CreativeReviewModal,
  EmptyState,
  ErrorState,
  HumanCommentsPanel,
  LoadingState,
  PostCard,
  PromptViewer,
  QueuePanel,
} from "@/components/social-components";
import { useAuth } from "@/lib/auth";
import { callEdgeFunction } from "@/lib/supabase/client";
import {
  approvePost,
  archivePost,
  contentCommentRepository,
  createLocalBackup,
  createProductionBatch,
  generateImagesBatch,
  generatePostContent,
  generatePostImage,
  generateVideosBatch,
  hydratePostRelations,
  improvePost,
  reviewPostQuality,
  renderPostTemplate,
  renderTemplatesBatch,
  postRepository,
  publishPostNow,
  requestPostChanges,
  restorePost,
  updatePostContent,
} from "@/lib/repositories/post-repository";
import { schedulePost } from "@/lib/repositories/publish-queue-repository";
import { postRowToSocialPost } from "@/lib/social-mappers";
import type { PostRow } from "@/lib/supabase/types";
import type { SocialPost } from "@/lib/social-types";

export const Route = createFileRoute("/conteudos")({
  head: () => ({
    meta: [
      { title: "Estúdio Criativo — MYINC" },
      {
        name: "description",
        content: "Produção de copy, prompts, criativos, comentários humanos, versões e aprovação.",
      },
    ],
  }),
  component: Conteudos,
});

const HIDDEN_STATUSES = new Set(["arquivado", "excluido", "excluído", "deletado", "deleted"]);
const PRODUCTION_STATUSES = new Set([
  "rascunho",
  "tema_aprovado",
  "em_producao",
  "em_fila",
  "ajuste_solicitado",
  "erro",
  "erro_ia",
  "aguardando_revisao",
  "aprovado",
  "agendado",
]);

function isOperationalPost(post: SocialPost) {
  const status = String(post.status ?? "").toLowerCase();
  return !post.archivedAt && !HIDDEN_STATUSES.has(status);
}

function needsMedia(post: SocialPost) {
  const status = String(post.status ?? "").toLowerCase();
  return isOperationalPost(post) && !post.mediaUrl && status !== "publicado";
}

function triggerWorkerNow(
  token: string,
  payload: { passes?: number; stopWhenEmpty?: boolean } = {},
) {
  return callEdgeFunction<{
    ok: true;
    processed: number;
    passes: number;
    results: unknown[];
    message?: string;
  }>("trigger-worker-now", token, {
    passes: payload.passes ?? 8,
    stopWhenEmpty: payload.stopWhenEmpty ?? true,
  });
}

function Conteudos() {
  const { session, profile } = useAuth();
  const [selected, setSelected] = useState<SocialPost | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingNow, setProcessingNow] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const rows = profile?.brand_id
        ? await postRepository.listByBrand(
            session.access_token,
            profile.brand_id,
            "order=updated_at.desc",
            false,
          )
        : await postRepository.list(
            session.access_token,
            "select=*&deleted_at=is.null&order=updated_at.desc",
          );
      const relations = await hydratePostRelations(session.access_token, rows);
      const mapped = rows.map((row) =>
        postRowToSocialPost(
          row,
          relations.versions.get(row.id) ?? [],
          relations.comments.get(row.id) ?? [],
        ),
      );
      setPosts(mapped);
      setSelected((current) => (current ? (mapped.find((post) => post.id === current.id) ?? null) : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar posts locais.");
    } finally {
      setLoading(false);
    }
  }, [profile?.brand_id, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runPostAction(
    label: string,
    action: () => Promise<unknown>,
    options: { closeModal?: boolean } = {},
  ) {
    setLoading(true);
    setError("");
    try {
      const result = await action();
      const successMessage =
        result &&
        typeof result === "object" &&
        "message" in result &&
        typeof result.message === "string"
          ? result.message
          : label;
      toast.success(successMessage);
      if (options.closeModal) setSelected(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ação do estúdio falhou.");
      setError(err instanceof Error ? err.message : "Ação do estúdio falhou.");
    } finally {
      setLoading(false);
    }
  }

  const archived = posts.filter((post) => post.archivedAt || HIDDEN_STATUSES.has(String(post.status).toLowerCase()));
  const activePosts = posts.filter(isOperationalPost);
  const productionTargets = activePosts.filter((post) => PRODUCTION_STATUSES.has(String(post.status).toLowerCase()));
  const readyForProduction = productionTargets.filter((post) => String(post.status).toLowerCase() !== "publicado");
  const waitingReview = activePosts.filter((post) => post.status === "aguardando_revisao");
  const imageTargets = activePosts.filter(needsMedia);
  const videoTargets = activePosts.filter((post) =>
    ["reels", "vídeo", "video"].some((term) => post.format.toLowerCase().includes(term)),
  );
  const carouselTargets = activePosts.filter((post) =>
    post.format.toLowerCase().includes("carrossel"),
  );

  async function processNow(passes = 10) {
    if (!session) return;
    setProcessingNow(true);
    try {
      const result = await triggerWorkerNow(session.access_token, { passes, stopWhenEmpty: true });
      toast.success(result.message ?? `Worker acionado em ${result.passes} passada(s).`);
      await load();
      return result;
    } finally {
      setProcessingNow(false);
    }
  }

  async function produceAll() {
    if (!session || !readyForProduction.length) return;
    const brandId = profile?.brand_id ?? readyForProduction[0]?.brandId;
    const result = await createProductionBatch(session.access_token, {
      brandId,
      postIds: readyForProduction.map((post) => post.id),
      instruction:
        "Produção em massa definitiva: usar memória da marca, Cérebro IA, biblioteca, formato, carrossel, vídeo/reels e critérios premium MYINC.",
    });
    return {
      message: `${result.queued ?? readyForProduction.length} job(s) criados na fila externa. Use Processar agora para executar sem travar a tela.`,
    };
  }

  async function produceAndProcessAll() {
    if (!session) return;
    if (readyForProduction.length) await produceAll();
    return processNow(12);
  }

  async function generateAllImages() {
    if (!session) return;
    const targets = imageTargets.length ? imageTargets : activePosts.filter((post) => !post.mediaUrl);
    if (!targets.length) {
      toast.info("Todos os posts ativos já possuem mídia ou não precisam de imagem.");
      return { message: "Nenhum post ativo pendente de imagem." };
    }
    const result = await generateImagesBatch(session.access_token, {
      brandId: profile?.brand_id ?? targets[0]?.brandId,
      postIds: targets.map((post) => post.id),
      onlyMissing: true,
      limit: targets.length,
    });
    return {
      message: result.message ?? `${result.queued ?? targets.length} job(s) de imagem enviados para a fila externa.`,
    };
  }

  async function generateAllVideos() {
    if (!session) return;
    if (!videoTargets.length) {
      toast.info("Nenhum Reels/Vídeo ativo para gerar.");
      return { message: "Nenhum Reels/Vídeo ativo para gerar." };
    }
    const result = await generateVideosBatch(session.access_token, {
      brandId: profile?.brand_id ?? videoTargets[0]?.brandId,
      postIds: videoTargets.map((post) => post.id),
      force: true,
      limit: videoTargets.length,
    });
    return {
      message: result.message ?? `${result.queued ?? videoTargets.length} job(s) de vídeo/Reels enviados para a fila externa.`,
    };
  }

  async function renderAllTemplates() {
    if (!session) return;
    const targets = activePosts.filter((post) => post.mediaUrl || post.caption || post.headline);
    if (!targets.length) {
      toast.info("Nenhum post ativo para aplicar template.");
      return { message: "Nenhum post ativo para aplicar template." };
    }
    await renderTemplatesBatch(session.access_token, {
      brandId: profile?.brand_id ?? targets[0]?.brandId,
      postIds: targets.map((post) => post.id),
    });
    return { message: `${targets.length} template(s) marcado(s) para revisão visual.` };
  }

  async function backupNow() {
    if (!session) return;
    return createLocalBackup(session.access_token, `studio-${new Date().toISOString()}`);
  }

  const byStatus = useMemo(
    () => ({
      producao: activePosts.filter((post) =>
        ["rascunho", "tema_aprovado", "em_producao", "em_fila", "ajuste_solicitado"].includes(post.status),
      ),
      revisao: activePosts.filter((post) => post.status === "aguardando_revisao"),
      aprovados: activePosts.filter((post) => ["aprovado", "agendado"].includes(post.status)),
      publicados: activePosts.filter((post) => post.status === "publicado"),
      erros: activePosts.filter((post) => ["erro", "erro_ia", "failed"].includes(post.status)),
    }),
    [activePosts],
  );

  function renderCards(items: SocialPost[]) {
    return items.length ? (
      items.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onOpen={() => setSelected(post)}
          onApprove={() =>
            runPostAction("Post aprovado.", () => approvePost(session!.access_token, post.id))
          }
          onRegenerate={() =>
            runPostAction("Nova versão premium solicitada ao Cérebro IA.", () =>
              generatePostContent(
                session!.access_token,
                post.id,
                "Regerar com qualidade premium MYINC, usando Cérebro IA, biblioteca e formato correto.",
              ),
            )
          }
          onGenerateImage={() =>
            runPostAction("Mídia enviada para a fila externa.", () =>
              generatePostImage(session!.access_token, post.id),
            )
          }
          onPublish={() =>
            runPostAction("Publicação solicitada.", () =>
              publishPostNow(session!.access_token, post.id),
            )
          }
          onArchive={() =>
            runPostAction("Post arquivado com histórico preservado.", () =>
              archivePost(session!.access_token, post.id),
            )
          }
        />
      ))
    ) : (
      <EmptyState
        title="Nada nesta etapa"
        description="Quando a fila avançar, os posts aparecem automaticamente aqui."
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <PageHeader
        title="Estúdio Criativo / Revisão Humana"
        description="Produção em massa com fila externa, worker Vercel, Cérebro MYINC, carrossel, vídeo/reels, imagens, aprovação e publicação."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-full bg-gradient-primary text-primary-foreground shadow-glow"
              disabled={loading || processingNow || (!readyForProduction.length && !activePosts.length)}
              onClick={() => runPostAction("Produção criada e worker acionado.", produceAndProcessAll)}
            >
              <Rocket className="h-4 w-4" /> Fazer tudo 100% automático
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || processingNow || !readyForProduction.length}
              onClick={() =>
                runPostAction("Fila de produção criada.", produceAll)
              }
            >
              <Sparkles className="h-4 w-4" /> Enviar todos para fila
            </Button>
            <Button
              variant="outline"
              className="rounded-full border-primary/50 text-primary"
              disabled={loading || processingNow}
              onClick={() => void processNow(12)}
            >
              <Play className="h-4 w-4" /> {processingNow ? "Processando..." : "Processar agora"}
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || processingNow || !activePosts.length}
              onClick={() => runPostAction("Jobs de imagem enviados para fila.", generateAllImages)}
            >
              <ImagePlus className="h-4 w-4" /> Gerar imagens em todos
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || processingNow || !videoTargets.length}
              onClick={() => runPostAction("Jobs de vídeo/Reels enviados para fila.", generateAllVideos)}
            >
              <Wand2 className="h-4 w-4" /> Gerar vídeos/Reels
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || processingNow || !activePosts.length}
              onClick={() =>
                runPostAction("Templates MYINC marcados para revisão.", renderAllTemplates)
              }
            >
              <Sparkles className="h-4 w-4" /> Aplicar template em todos
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || processingNow}
              onClick={() => runPostAction("Backup lógico criado.", backupNow)}
            >
              <CheckCheck className="h-4 w-4" /> Backup agora
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || processingNow || !waitingReview.length}
              onClick={() =>
                runPostAction("Posts aguardando revisão aprovados.", () =>
                  Promise.all(
                    waitingReview.map((post) => approvePost(session!.access_token, post.id)),
                  ),
                )
              }
            >
              <CheckCheck className="h-4 w-4" /> Aprovar em revisão
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || processingNow}
              onClick={() => void load()}
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
          </div>
        }
      />
      {loading ? (
        <LoadingState label="Sincronizando posts, fila, mídia e revisão..." />
      ) : null}
      {processingNow ? (
        <LoadingState label="Processando fila externa sem travar a produção em massa..." />
      ) : null}
      {error ? <ErrorState message={error} /> : null}
      <QueuePanel posts={posts} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Carrosséis</p>
          <h3 className="mt-2 text-2xl font-bold">{carouselTargets.length}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Jobs por página, mídia por slide e revisão antes da publicação.
          </p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Reels/Vídeos</p>
          <h3 className="mt-2 text-2xl font-bold">{videoTargets.length}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Geração via fila externa e worker Vercel com polling.
          </p>
        </div>
        <div className="rounded-3xl border border-border bg-sidebar p-5 text-sidebar-foreground shadow-elevated">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sidebar-primary">
            Fluxo oficial
          </p>
          <p className="mt-2 text-sm text-sidebar-foreground/70">
            Enviar para fila → Processar agora → Atualizar → revisar → aprovar/agendar/publicar.
          </p>
        </div>
      </div>
      <Tabs defaultValue="cards" className="space-y-5">
        <TabsList className="flex h-auto flex-wrap justify-start rounded-2xl bg-muted p-1">
          <TabsTrigger value="cards">Todos ativos</TabsTrigger>
          <TabsTrigger value="producao">Produção</TabsTrigger>
          <TabsTrigger value="revisao">Revisão</TabsTrigger>
          <TabsTrigger value="aprovados">Aprovados</TabsTrigger>
          <TabsTrigger value="publicados">Publicados</TabsTrigger>
          <TabsTrigger value="erros">Erros</TabsTrigger>
          <TabsTrigger value="arquivados">Arquivados</TabsTrigger>
          <TabsTrigger value="detalhes">Detalhado</TabsTrigger>
        </TabsList>
        <TabsContent value="cards" className="grid gap-4 lg:grid-cols-2">
          {renderCards(activePosts)}
        </TabsContent>
        <TabsContent value="producao" className="grid gap-4 lg:grid-cols-2">
          {renderCards(byStatus.producao)}
        </TabsContent>
        <TabsContent value="revisao" className="grid gap-4 lg:grid-cols-2">
          {renderCards(byStatus.revisao)}
        </TabsContent>
        <TabsContent value="aprovados" className="grid gap-4 lg:grid-cols-2">
          {renderCards(byStatus.aprovados)}
        </TabsContent>
        <TabsContent value="publicados" className="grid gap-4 lg:grid-cols-2">
          {renderCards(byStatus.publicados)}
        </TabsContent>
        <TabsContent value="erros" className="grid gap-4 lg:grid-cols-2">
          {renderCards(byStatus.erros)}
        </TabsContent>
        <TabsContent value="arquivados" className="grid gap-4 lg:grid-cols-2">
          {archived.length ? (
            archived.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onOpen={() => setSelected(post)}
                onApprove={() =>
                  runPostAction("Post restaurado para revisão.", () =>
                    restorePost(session!.access_token, post.id),
                  )
                }
                onRegenerate={() =>
                  runPostAction("Post restaurado e regenerado.", async () => {
                    await restorePost(session!.access_token, post.id);
                    await generatePostContent(
                      session!.access_token,
                      post.id,
                      "Restaurar e melhorar",
                    );
                  })
                }
              />
            ))
          ) : (
            <EmptyState
              title="Nenhum post arquivado"
              description="Arquivar remove da operação ativa, mas preserva histórico, versões, mídia e logs."
            />
          )}
        </TabsContent>
        <TabsContent value="detalhes" className="space-y-5">
          {activePosts.map((post) => (
            <div key={post.id} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-xl font-bold">{post.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {post.theme} · {post.objective} · {post.channel} · {post.format}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading || processingNow}
                    onClick={() =>
                      runPostAction("Copy/design regenerados com IA.", () =>
                        generatePostContent(session!.access_token, post.id),
                      )
                    }
                  >
                    <Wand2 className="h-4 w-4" /> Melhorar copy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading || processingNow}
                    onClick={() =>
                      runPostAction("Mídia enviada para fila externa.", () =>
                        generatePostImage(session!.access_token, post.id),
                      )
                    }
                  >
                    <ImagePlus className="h-4 w-4" /> Enviar mídia
                  </Button>
                  <Button
                    size="sm"
                    className="bg-gradient-primary text-primary-foreground"
                    disabled={loading || processingNow}
                    onClick={() =>
                      runPostAction("Post aprovado.", () =>
                        approvePost(session!.access_token, post.id),
                      )
                    }
                  >
                    Aprovar
                  </Button>
                </div>
              </div>
              <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
                <div className="space-y-4">
                  <PromptViewer post={post} />
                  <HumanCommentsPanel
                    comments={post.comments}
                    onAdd={(comment) =>
                      runPostAction("Comentário salvo.", () =>
                        contentCommentRepository.create(session!.access_token, {
                          post_id: post.id,
                          comment,
                          status: "aberto",
                          feedback_for_ai: true,
                        }),
                      )
                    }
                  />
                </div>
                <div className="space-y-3 rounded-2xl border border-border bg-background/60 p-4">
                  <Button
                    className="w-full justify-start rounded-xl"
                    variant="outline"
                    onClick={() =>
                      runPostAction("Template MYINC marcado para revisão.", () =>
                        renderPostTemplate(session!.access_token, post.id),
                      )
                    }
                  >
                    Aplicar template MYINC
                  </Button>
                  <Button
                    className="w-full justify-start rounded-xl"
                    variant="outline"
                    onClick={() =>
                      runPostAction("Revisão de qualidade registrada.", () =>
                        reviewPostQuality(session!.access_token, post.id),
                      )
                    }
                  >
                    Revisar qualidade
                  </Button>
                  <Button
                    className="w-full justify-start rounded-xl"
                    variant="outline"
                    onClick={() =>
                      runPostAction("Versão melhorada solicitada.", () =>
                        improvePost(session!.access_token, post.id, "premium", false),
                      )
                    }
                  >
                    Melhorar premium
                  </Button>
                  <Button
                    className="w-full justify-start rounded-xl"
                    variant="outline"
                    onClick={() =>
                      runPostAction("Ajustes solicitados.", () =>
                        requestPostChanges(session!.access_token, post.id, "Ajuste solicitado na revisão humana."),
                      )
                    }
                  >
                    Solicitar ajuste
                  </Button>
                  <Button
                    className="w-full justify-start rounded-xl"
                    variant="outline"
                    onClick={() =>
                      runPostAction("Post agendado.", () =>
                        schedulePost(session!.access_token, post as unknown as PostRow, post.scheduledAt),
                      )
                    }
                  >
                    Agendar
                  </Button>
                  <Button
                    className="w-full justify-start rounded-xl"
                    variant="outline"
                    onClick={() =>
                      runPostAction("Publicação solicitada.", () =>
                        publishPostNow(session!.access_token, post.id),
                      )
                    }
                  >
                    Publicar
                  </Button>
                  <Button
                    className="w-full justify-start rounded-xl"
                    variant="destructive"
                    onClick={() =>
                      runPostAction("Post arquivado.", () => archivePost(session!.access_token, post.id))
                    }
                  >
                    Arquivar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
      <CreativeReviewModal
        post={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onSave={(patch) =>
          runPostAction("Edição salva.", () =>
            updatePostContent(session!.access_token, selected!.id, {
              title: patch.title,
              caption: patch.caption,
              hashtags: patch.hashtags,
              cta: patch.cta,
              image_prompt: patch.imagePrompt,
              creative_brief: patch.creativeBrief,
              scheduled_at: patch.scheduledAt,
            } as Partial<PostRow>),
          )
        }
        onApprove={() =>
          runPostAction("Post aprovado.", () => approvePost(session!.access_token, selected!.id), {
            closeModal: true,
          })
        }
        onSchedule={(scheduledAt) =>
          runPostAction("Post agendado.", () =>
            schedulePost(session!.access_token, selected as unknown as PostRow, scheduledAt),
          )
        }
        onPublish={() =>
          runPostAction("Publicação solicitada.", () => publishPostNow(session!.access_token, selected!.id))
        }
        onRegenerate={(feedback) =>
          runPostAction("Nova versão solicitada.", () =>
            generatePostContent(session!.access_token, selected!.id, feedback),
          )
        }
        onGenerateImage={() =>
          runPostAction("Mídia enviada para fila externa.", () =>
            generatePostImage(session!.access_token, selected!.id),
          )
        }
        onArchive={() =>
          runPostAction("Post arquivado.", () => archivePost(session!.access_token, selected!.id), {
            closeModal: true,
          })
        }
        onAddComment={(comment) =>
          runPostAction("Comentário salvo.", () =>
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
