import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCheck, ImagePlus, RefreshCw, Rocket, Sparkles, Wand2 } from "lucide-react";
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
import {
  approvePost,
  archivePost,
  contentCommentRepository,
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
  createLocalBackup,
  postRepository,
  publishPostNow,
  requestPostChanges,
  restorePost,
  runAutonomousProduction,
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

function Conteudos() {
  const { session, profile } = useAuth();
  const [selected, setSelected] = useState<SocialPost | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(false);
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
      toast.error(err instanceof Error ? err.message : "Acao do estudio falhou.");
      setError(err instanceof Error ? err.message : "Ação do estúdio falhou.");
    } finally {
      setLoading(false);
    }
  }

  const archived = posts.filter((post) => post.status === "arquivado" || post.archivedAt);
  const activePosts = posts.filter((post) => post.status !== "arquivado" && !post.archivedAt);
  const readyForProduction = activePosts.filter((post) =>
    ["tema_aprovado", "ajuste_solicitado", "erro", "rascunho"].includes(post.status),
  );
  const waitingReview = activePosts.filter((post) => post.status === "aguardando_revisao");
  const imageTargets = activePosts.filter(
    (post) =>
      !post.mediaUrl &&
      ["aguardando_revisao", "aprovado", "agendado", "tema_aprovado", "ajuste_solicitado"].includes(
        post.status,
      ),
  );
  const videoTargets = activePosts.filter((post) =>
    ["Reels", "Vídeo", "Video"].some((term) =>
      post.format.toLowerCase().includes(term.toLowerCase()),
    ),
  );
  const carouselTargets = activePosts.filter((post) =>
    post.format.toLowerCase().includes("carrossel"),
  );

  async function produceAll() {
    if (!session || !readyForProduction.length) return;
    const brandId = profile?.brand_id ?? readyForProduction[0]?.brandId;
    await createProductionBatch(session.access_token, {
      brandId,
      postIds: readyForProduction.map((post) => post.id),
      instruction:
        "Produção em massa definitiva: usar memória da marca, Cérebro IA, biblioteca, formato, carrossel, vídeo/reels e critérios premium MYINC.",
    });
  }

  async function generateAllImages() {
    if (!session) return;
    const targets = imageTargets.length
      ? imageTargets
      : activePosts.filter((post) => !post.mediaUrl);
    if (!targets.length) {
      toast.info("Todos os posts ativos já possuem mídia.");
      return;
    }
    const result = await generateImagesBatch(session.access_token, {
      brandId: profile?.brand_id ?? targets[0]?.brandId,
      postIds: targets.map((post) => post.id),
      onlyMissing: true,
      limit: 5,
    });
    if (!result.generated) throw new Error("Nenhuma imagem foi gerada pela fila.");
    return {
      message: `${result.generated} imagem(ns) gerada(s).${
        result.remaining
          ? ` Ainda restam ${result.remaining}; clique novamente para continuar.`
          : ""
      }`,
    };
  }

  async function generateAllVideos() {
    if (!session) return;
    if (!videoTargets.length) {
      toast.info("Nenhum Reels/Vídeo ativo para gerar.");
      return;
    }
    await generateVideosBatch(session.access_token, {
      brandId: profile?.brand_id ?? videoTargets[0]?.brandId,
      postIds: videoTargets.map((post) => post.id),
      force: true,
    });
  }

  async function renderAllTemplates() {
    if (!session) return;
    const targets = activePosts.filter((post) => post.mediaUrl || post.caption || post.headline);
    if (!targets.length) {
      toast.info("Nenhum post ativo para aplicar template.");
      return;
    }
    await renderTemplatesBatch(session.access_token, {
      brandId: profile?.brand_id ?? targets[0]?.brandId,
      postIds: targets.map((post) => post.id),
    });
  }

  async function backupNow() {
    if (!session) return;
    await createLocalBackup(session.access_token, `studio-${new Date().toISOString()}`);
  }

  async function runAuto100() {
    if (!session) return;
    await runAutonomousProduction(session.access_token, {
      brandId: profile?.brand_id ?? activePosts[0]?.brandId,
      publish: true,
      approve: true,
      schedule: true,
      generateImages: true,
      applyTemplates: true,
      reviewQuality: true,
    });
  }

  const byStatus = useMemo(
    () => ({
      producao: activePosts.filter((post) =>
        ["rascunho", "tema_aprovado", "em_producao", "ajuste_solicitado"].includes(post.status),
      ),
      revisao: activePosts.filter((post) => post.status === "aguardando_revisao"),
      aprovados: activePosts.filter((post) => ["aprovado", "agendado"].includes(post.status)),
      publicados: activePosts.filter((post) => post.status === "publicado"),
      erros: activePosts.filter((post) => post.status === "erro"),
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
            runPostAction("Mídia gerada pela fila de imagem.", () =>
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
        description="Produção em massa local com IA, Cérebro MYINC, carrossel, vídeo/reels, imagens em fila, aprovação e publicação."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-full bg-gradient-primary text-primary-foreground shadow-glow"
              disabled={loading || (!readyForProduction.length && !activePosts.length)}
              onClick={() => runPostAction("Automação 100% executada.", runAuto100)}
            >
              <Rocket className="h-4 w-4" /> Fazer tudo 100% automático
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || !readyForProduction.length}
              onClick={() =>
                runPostAction("Fila de produção criada/processada para aprovados.", produceAll)
              }
            >
              <Sparkles className="h-4 w-4" /> Produzir todos
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || !activePosts.length}
              onClick={() => runPostAction("Fila de imagens processada.", generateAllImages)}
            >
              <ImagePlus className="h-4 w-4" /> Gerar imagens em todos
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || !videoTargets.length}
              onClick={() => runPostAction("Fila de vídeos/Reels processada.", generateAllVideos)}
            >
              <Wand2 className="h-4 w-4" /> Gerar vídeos/Reels
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || !activePosts.length}
              onClick={() =>
                runPostAction("Templates MYINC aplicados em todos.", renderAllTemplates)
              }
            >
              <Sparkles className="h-4 w-4" /> Aplicar template em todos
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading}
              onClick={() => runPostAction("Backup local criado.", backupNow)}
            >
              <CheckCheck className="h-4 w-4" /> Backup agora
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || !waitingReview.length}
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
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
          </div>
        }
      />
      {loading ? (
        <LoadingState label="Executando fila local com IA e salvando resultados..." />
      ) : null}
      {error ? <ErrorState message={error} /> : null}
      <QueuePanel posts={posts} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Carrosséis</p>
          <h3 className="mt-2 text-2xl font-bold">{carouselTargets.length}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Prévia com setas laterais, páginas IA e mídia por slide.
          </p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Reels/Vídeos</p>
          <h3 className="mt-2 text-2xl font-bold">{videoTargets.length}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Roteiro, capa e storyboard local gerados pelo Cérebro IA.
          </p>
        </div>
        <div className="rounded-3xl border border-border bg-sidebar p-5 text-sidebar-foreground shadow-elevated">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sidebar-primary">
            Sugestão de produção
          </p>
          <p className="mt-2 text-sm text-sidebar-foreground/70">
            Use Produzir todos → Gerar imagens/vídeos → revisar cards → aprovar/agendar. Evite
            publicar sem revisão se for campanha real.
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
                    disabled={loading}
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
                    disabled={loading}
                    onClick={() =>
                      runPostAction("Mídia gerada no storage local.", () =>
                        generatePostImage(session!.access_token, post.id),
                      )
                    }
                  >
                    <ImagePlus className="h-4 w-4" /> Imagem
                  </Button>
                  <Button
                    size="sm"
                    className="bg-gradient-primary text-primary-foreground"
                    disabled={loading}
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
                  <p className="rounded-2xl bg-background p-4 text-sm leading-relaxed">
                    {post.caption || "Copy ainda não gerada."}
                  </p>
                  <p className="rounded-2xl bg-background p-4 text-sm">
                    <b>Hashtags:</b> {post.hashtags.join(" ") || "—"}
                  </p>
                  <p className="rounded-2xl bg-background p-4 text-sm">
                    <b>Briefing:</b> {post.creativeBrief || "—"}
                  </p>
                  <PromptViewer prompt={post.masterPrompt || "Prompt mestre ainda não gerado."} />
                </div>
                <HumanCommentsPanel
                  comments={post.humanComments}
                  onAddComment={(comment) =>
                    runPostAction("Comentário salvo localmente.", () =>
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
            </div>
          ))}
        </TabsContent>
      </Tabs>
      <CreativeReviewModal
        post={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onSave={(patch) =>
          runPostAction(
            "Edição salva no post.",
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
          runPostAction(
            "Post aprovado para publicação.",
            () => approvePost(session!.access_token, selected!.id),
            { closeModal: true },
          )
        }
        onSchedule={(scheduledAt) =>
          runPostAction(
            "Post agendado na fila de publicação.",
            () => schedulePost(session!.access_token, selected as unknown as PostRow, scheduledAt),
            { closeModal: true },
          )
        }
        onPublish={() =>
          runPostAction(
            "Publicação solicitada.",
            () => publishPostNow(session!.access_token, selected!.id),
            { closeModal: true },
          )
        }
        onRegenerate={(feedback) =>
          runPostAction("Nova versão com feedback humano criada.", async () => {
            await contentCommentRepository.create(session!.access_token, {
              post_id: selected!.id,
              comment: feedback,
              status: "aberto",
              feedback_for_ai: true,
            });
            await requestPostChanges(session!.access_token, selected!.id, feedback);
            await generatePostContent(session!.access_token, selected!.id, feedback);
          })
        }
        onGenerateImage={() =>
          runPostAction("Mídia gerada e salva.", () =>
            generatePostImage(session!.access_token, selected!.id),
          )
        }
        onImprove={(mode) =>
          runPostAction(`Variação ${mode} criada pelo Cérebro IA.`, () =>
            improvePost(session!.access_token, selected!.id, mode, mode === "visual"),
          )
        }
        onReviewQuality={() =>
          runPostAction("Revisor IA executado e score atualizado.", () =>
            reviewPostQuality(session!.access_token, selected!.id),
          )
        }
        onRenderTemplate={() =>
          runPostAction("Template visual MYINC aplicado.", () =>
            renderPostTemplate(session!.access_token, selected!.id),
          )
        }
        onArchive={() =>
          runPostAction("Post arquivado.", () => archivePost(session!.access_token, selected!.id), {
            closeModal: true,
          })
        }
        onAddComment={(comment) =>
          runPostAction("Comentário salvo localmente.", () =>
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
