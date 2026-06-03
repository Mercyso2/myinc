import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, Images, RotateCcw, ShieldCheck, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MediaLibraryGrid,
} from "@/components/social-components";
import { useAuth } from "@/lib/auth";
import { getFirstAccessibleBrand } from "@/lib/repositories/brand-repository";
import {
  libraryRepository,
  markReferenceApproved,
  markReferenceForbidden,
  mediaRepository,
} from "@/lib/repositories/media-repository";
import { uploadStorageObject } from "@/lib/supabase/client";
import type { LibraryItemRow, MediaAssetRow } from "@/lib/supabase/types";
import type { MediaAsset } from "@/lib/social-types";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({ meta: [{ title: "Biblioteca de Mídia — MYINC" }] }),
  component: Biblioteca,
});

function mapAsset(row: MediaAssetRow | LibraryItemRow): MediaAsset {
  const isLibrary = "item_type" in row;
  return {
    id: row.id,
    name: row.name,
    type: (isLibrary ? row.item_type : row.media_type) as MediaAsset["type"],
    url: (row.url ?? "") as string,
    status: row.archived_at ? "arquivado" : (row.status as MediaAsset["status"]),
    tags: row.tags ?? [],
    notes: row.notes ?? "",
    uploadedAt: row.created_at ? new Date(row.created_at).toLocaleDateString("pt-BR") : "—",
    origin: isLibrary ? (row.source_url ?? "Biblioteca") : (row.origin ?? "Local"),
    aiAllowed: isLibrary ? Boolean(row.ai_allowed) : row.ai_allowed,
    campaign: isLibrary ? (row.campaign ?? "") : (row.related_campaign_id ?? ""),
    format: isLibrary ? (row.format ?? "") : (row.usage_context ?? ""),
  };
}

function Biblioteca() {
  const { session, profile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [libraryRows, setLibraryRows] = useState<LibraryItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadType, setUploadType] = useState("Referência visual");
  const [tags, setTags] = useState("arquitetura, alto padrão, MYINC");
  const [notes, setNotes] = useState(
    "Referência enviada para alimentar a IA somente quando aprovada.",
  );

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const brandId =
        profile?.brand_id ?? (await getFirstAccessibleBrand(session.access_token))?.id;
      if (!brandId) throw new Error("Nenhuma marca encontrada para carregar biblioteca.");
      const [media, library] = await Promise.all([
        mediaRepository.listByBrand(session.access_token, brandId, "order=created_at.desc", false),
        libraryRepository.listByBrand(
          session.access_token,
          brandId,
          "order=created_at.desc",
          false,
        ),
      ]);
      setLibraryRows(library);
      const ids = new Set(library.map((row) => row.media_asset_id).filter(Boolean));
      setItems([
        ...library.map(mapAsset),
        ...media.filter((row) => !ids.has(row.id)).map(mapAsset),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar biblioteca real.");
    } finally {
      setLoading(false);
    }
  }, [profile?.brand_id, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(label: string, action: () => Promise<unknown>) {
    setLoading(true);
    setError("");
    try {
      await action();
      toast.success(label);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ação da biblioteca falhou.");
    } finally {
      setLoading(false);
    }
  }

  function rowByItem(item: MediaAsset) {
    return libraryRows.find((row) => row.id === item.id);
  }

  async function upload(file: File) {
    if (!session) return;
    await run("Arquivo enviado, indexado e disponível para classificação.", async () => {
      const brandId =
        profile?.brand_id ?? (await getFirstAccessibleBrand(session.access_token))?.id;
      if (!brandId) throw new Error("Nenhuma marca encontrada para vincular upload.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const path = `${brandId}/library/${crypto.randomUUID()}-${safeName}`;
      const uploaded = await uploadStorageObject("library", path, session.access_token, file);
      const tagList = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const asset = await mediaRepository.create(session.access_token, {
        brand_id: brandId,
        name: file.name,
        media_type: uploadType,
        url: uploaded.publicUrl,
        preview_url: uploaded.publicUrl,
        status: "ativo",
        tags: tagList,
        notes,
        origin: "upload",
        ai_allowed: false,
        storage_bucket: "library",
        storage_path: path,
        asset_role: uploadType,
        usage_context: "biblioteca",
      } as Partial<MediaAssetRow>);
      await libraryRepository.create(session.access_token, {
        brand_id: brandId,
        media_asset_id: asset.id,
        name: file.name,
        item_type: uploadType,
        url: uploaded.publicUrl,
        status: "ativo",
        tags: tagList,
        notes,
        format: "Todos",
        ai_usage_rule:
          "Usar apenas como inspiração de composição/estética quando marcada como referência aprovada.",
        ai_allowed: false,
        asset_role: uploadType,
        usage_context: "referência visual",
      } as Partial<LibraryItemRow>);
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function makeTemplate(item: MediaAsset) {
    await run("Item marcado como template e liberado para a IA.", () => {
      const libraryRow = rowByItem(item);
      if (libraryRow) {
        return libraryRepository.update(session!.access_token, item.id, {
          status: "template",
          ai_allowed: true,
          item_type: "Template",
        } as Partial<LibraryItemRow>);
      }
      return mediaRepository.update(session!.access_token, item.id, {
        status: "template",
        ai_allowed: true,
        media_type: "Template",
      } as Partial<MediaAssetRow>);
    });
  }

  async function deleteItem(item: MediaAsset) {
    await run("Item excluído definitivamente da biblioteca.", async () => {
      const libraryRow = rowByItem(item);
      if (libraryRow) {
        await libraryRepository.hardDelete(session!.access_token, libraryRow.id);
        if (libraryRow.media_asset_id) {
          await mediaRepository.hardDelete(session!.access_token, libraryRow.media_asset_id);
        }
        return;
      }
      await mediaRepository.hardDelete(session!.access_token, item.id);
    });
  }

  const approved = items.filter((i) => i.status === "referência aprovada");
  const templates = items.filter((i) => i.status === "template");
  const forbidden = items.filter((i) => i.status === "referência proibida");
  const archived = items.filter((i) => i.status === "arquivado");
  const active = items.filter((i) => i.status !== "arquivado");

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <PageHeader
        title="Biblioteca de Mídia"
        description="Upload, tags, referência aprovada/proibida, templates, arquivamento e insumos que alimentam a IA com segurança."
        actions={
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,.pdf"
              onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])}
            />
            <Button
              className="rounded-full bg-gradient-primary text-primary-foreground"
              disabled={loading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> Upload de arquivos
            </Button>
          </>
        }
      />
      {loading ? <LoadingState label="Sincronizando Biblioteca/Storage..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-3xl border border-border bg-sidebar p-6 text-sidebar-foreground shadow-elevated">
          <div className="flex items-center gap-3">
            <Images className="h-8 w-8 text-sidebar-primary" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sidebar-primary">
                Referências de Alto Padrão
              </p>
              <h2 className="text-2xl font-bold">A IA só consulta o que você aprovar.</h2>
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm text-sidebar-foreground/65">
            Arquivos arquivados ou proibidos nunca entram nos prompts. Isso evita cópia de
            concorrente, visual amador e referência fora da marca.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <Badge variant="outline">{active.length} ativos</Badge>
            <Badge className="bg-success/15 text-success hover:bg-success/15">
              {approved.length} aprovados IA
            </Badge>
            <Badge variant="outline">{templates.length} templates</Badge>
            <Badge variant="outline">{archived.length} arquivados</Badge>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <h3 className="font-bold">Configuração do próximo upload</h3>
          <div className="mt-4 grid gap-3">
            <Input
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value)}
              placeholder="Tipo"
            />
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tags separadas por vírgula"
            />
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </div>
      <Tabs defaultValue="todos" className="space-y-5">
        <TabsList className="flex h-auto flex-wrap justify-start rounded-2xl bg-muted p-1">
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="referencias">Referências aprovadas</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="proibidas">Proibidas</TabsTrigger>
          <TabsTrigger value="arquivadas">Arquivadas</TabsTrigger>
        </TabsList>
        <TabsContent value="todos">
          {items.length ? (
            <MediaLibraryGrid
              items={active}
              onApproveReference={(item) =>
                run("Referência liberada para IA.", () =>
                  rowByItem(item)
                    ? markReferenceApproved(session!.access_token, item.id)
                    : mediaRepository.update(session!.access_token, item.id, {
                        status: "referência aprovada",
                        ai_allowed: true,
                      } as Partial<MediaAssetRow>),
                )
              }
              onForbidReference={(item) =>
                run("Referência bloqueada para IA.", () =>
                  rowByItem(item)
                    ? markReferenceForbidden(session!.access_token, item.id)
                    : mediaRepository.update(session!.access_token, item.id, {
                        status: "referência proibida",
                        ai_allowed: false,
                      } as Partial<MediaAssetRow>),
                )
              }
              onArchive={(item) =>
                run("Item arquivado.", () =>
                  rowByItem(item)
                    ? libraryRepository.archive(session!.access_token, item.id, {
                        status: "arquivado",
                        ai_allowed: false,
                      } as Partial<LibraryItemRow>)
                    : mediaRepository.archive(session!.access_token, item.id, {
                        status: "arquivado",
                        ai_allowed: false,
                      } as Partial<MediaAssetRow>),
                )
              }
              onMakeTemplate={makeTemplate}
              onDelete={deleteItem}
            />
          ) : (
            <EmptyState
              title="Biblioteca vazia"
              description="Faça upload local ou gere imagens no Estúdio."
            />
          )}
        </TabsContent>
        <TabsContent value="referencias">
          <MediaLibraryGrid
            items={approved}
            onForbidReference={(item) =>
              run("Referência bloqueada.", () =>
                markReferenceForbidden(session!.access_token, item.id),
              )
            }
            onArchive={(item) =>
              run("Item arquivado.", () =>
                libraryRepository.archive(session!.access_token, item.id, {
                  status: "arquivado",
                  ai_allowed: false,
                } as Partial<LibraryItemRow>),
              )
            }
            onMakeTemplate={makeTemplate}
            onDelete={deleteItem}
          />
        </TabsContent>
        <TabsContent value="templates">
          <MediaLibraryGrid
            items={templates}
            onApproveReference={(item) =>
              run("Template também liberado como referência.", () =>
                markReferenceApproved(session!.access_token, item.id),
              )
            }
            onArchive={(item) =>
              run("Template arquivado.", () =>
                libraryRepository.archive(session!.access_token, item.id, {
                  status: "arquivado",
                  ai_allowed: false,
                } as Partial<LibraryItemRow>),
              )
            }
            onDelete={deleteItem}
          />
        </TabsContent>
        <TabsContent value="proibidas">
          <div className="mb-4 rounded-3xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <XCircle className="mr-2 inline h-4 w-4" />
            Referências proibidas ficam preservadas para histórico, mas nunca entram nos prompts.
          </div>
          <MediaLibraryGrid
            items={forbidden}
            onApproveReference={(item) =>
              run("Referência reabilitada para IA.", () =>
                markReferenceApproved(session!.access_token, item.id),
              )
            }
            onArchive={(item) =>
              run("Referência proibida arquivada.", () =>
                libraryRepository.archive(session!.access_token, item.id, {
                  status: "arquivado",
                  ai_allowed: false,
                } as Partial<LibraryItemRow>),
              )
            }
            onDelete={deleteItem}
          />
        </TabsContent>
        <TabsContent value="arquivadas">
          <div className="mb-4 rounded-3xl border border-border bg-card p-4 text-sm text-muted-foreground">
            <Archive className="mr-2 inline h-4 w-4" />
            Arquivar não apaga arquivo nem histórico. Restaurar volta como ativo, ainda sem entrar
            na IA até ser aprovado.
          </div>
          <MediaLibraryGrid
            items={archived}
            onRestore={(item) =>
              run("Item restaurado como ativo.", () =>
                rowByItem(item)
                  ? libraryRepository.restore(session!.access_token, item.id, {
                      status: "ativo",
                      ai_allowed: false,
                    } as Partial<LibraryItemRow>)
                  : mediaRepository.restore(session!.access_token, item.id, {
                      status: "ativo",
                      ai_allowed: false,
                    } as Partial<MediaAssetRow>),
              )
            }
            onDelete={deleteItem}
          />
        </TabsContent>
      </Tabs>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <ShieldCheck className="h-5 w-5 text-success" />
          <h3 className="mt-2 font-bold">Aprovada</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pode entrar no prompt como inspiração de marca.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <XCircle className="h-5 w-5 text-destructive" />
          <h3 className="mt-2 font-bold">Proibida</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Nunca entra nos prompts, mas fica registrada.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <RotateCcw className="h-5 w-5 text-primary" />
          <h3 className="mt-2 font-bold">Arquivada</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Sai da operação ativa sem apagar histórico.
          </p>
        </div>
      </div>
    </div>
  );
}
