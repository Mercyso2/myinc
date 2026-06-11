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
import { EmptyState, ErrorState, LoadingState, MediaLibraryGrid } from "@/components/social-components";
import { useAuth } from "@/lib/auth";
import { getFirstAccessibleBrand } from "@/lib/repositories/brand-repository";
import { libraryRepository, markReferenceApproved, markReferenceForbidden, mediaRepository } from "@/lib/repositories/media-repository";
import { uploadStorageObject } from "@/lib/supabase/client";
import type { LibraryItemRow, MediaAssetRow } from "@/lib/supabase/types";
import type { MediaAsset } from "@/lib/social-types";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({ meta: [{ title: "Biblioteca de Mídia — MYINC" }] }),
  component: Biblioteca,
});

const uploadTypes = ["Logo", "Foto pessoal / retrato", "Referência visual", "Template", "Empreendimento", "Vídeo", "Documento"];

function normalizeUploadType(file: File, selected: string) {
  const lowerName = file.name.toLowerCase();
  if (selected === "Logo" || lowerName.includes("logo")) return "Logo";
  if (selected.includes("Foto") || lowerName.includes("rosto") || lowerName.includes("perfil") || lowerName.includes("retrato")) return "Foto pessoal / retrato";
  if (file.type.startsWith("video/")) return "Vídeo";
  return selected || "Referência visual";
}

function usageRule(type: string) {
  if (type === "Logo") return "Usar como identidade visual/assinatura da marca. Não recriar, deformar, inventar ou gerar variação falsa do logo.";
  if (type === "Foto pessoal / retrato") return "Usar como referência autorizada da pessoa/rosto para posts com área de foto. Não usar em cenas sensíveis, não modificar identidade, não caricaturar.";
  if (type === "Template") return "Usar como estrutura visual/editável, respeitando área segura, hierarquia e padrão claro MYINC.";
  return "Usar apenas como inspiração de composição, estética, enquadramento e linguagem visual quando marcada como referência aprovada.";
}

function defaultStatus(type: string) {
  return type === "Logo" || type === "Foto pessoal / retrato" ? "referência aprovada" : "ativo";
}

function defaultAiAllowed(type: string) {
  return type === "Logo" || type === "Foto pessoal / retrato";
}

function mapAsset(row: MediaAssetRow | LibraryItemRow): MediaAsset {
  const isLibrary = "item_type" in row;
  const type = String((isLibrary ? row.item_type : row.media_type) ?? "Referência visual");
  return {
    id: row.id,
    name: row.name,
    type: type as MediaAsset["type"],
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
  const [uploadType, setUploadType] = useState("Logo");
  const [tags, setTags] = useState("logo, marca, MYINC, claro");
  const [notes, setNotes] = useState("Logo/identidade visual oficial. Deve aparecer inteiro, sem cortar, sem fundo escuro e sem distorcer.");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const brandId = profile?.brand_id ?? (await getFirstAccessibleBrand(session.access_token))?.id;
      if (!brandId) throw new Error("Nenhuma marca encontrada para carregar biblioteca.");
      const [media, library] = await Promise.all([
        mediaRepository.listByBrand(session.access_token, brandId, "order=created_at.desc", false),
        libraryRepository.listByBrand(session.access_token, brandId, "order=created_at.desc", false),
      ]);
      setLibraryRows(library);
      const ids = new Set(library.map((row) => row.media_asset_id).filter(Boolean));
      setItems([...library.map(mapAsset), ...media.filter((row) => !ids.has(row.id)).map(mapAsset)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar biblioteca real.");
    } finally {
      setLoading(false);
    }
  }, [profile?.brand_id, session]);

  useEffect(() => { void load(); }, [load]);

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
    await run("Arquivo enviado, classificado e disponível na biblioteca.", async () => {
      const brandId = profile?.brand_id ?? (await getFirstAccessibleBrand(session.access_token))?.id;
      if (!brandId) throw new Error("Nenhuma marca encontrada para vincular upload.");
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/") && file.type !== "application/pdf") throw new Error("Formato não suportado. Envie PNG/JPG/WebP/SVG, vídeo ou PDF.");
      const finalType = normalizeUploadType(file, uploadType);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const path = `${brandId}/library/${finalType.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/${crypto.randomUUID()}-${safeName}`;
      const uploaded = await uploadStorageObject("library", path, session.access_token, file);
      const tagList = Array.from(new Set([
        ...tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        finalType === "Logo" ? "logo" : "",
        finalType === "Foto pessoal / retrato" ? "foto-pessoal" : "",
        file.type.includes("png") ? "png" : "",
        "tema-claro",
      ].filter(Boolean)));
      const status = defaultStatus(finalType);
      const aiAllowed = defaultAiAllowed(finalType);
      const rule = usageRule(finalType);
      const finalNotes = notes || rule;
      const asset = await mediaRepository.create(session.access_token, {
        brand_id: brandId,
        name: file.name,
        type: finalType,
        media_type: finalType,
        url: uploaded.publicUrl,
        public_url: uploaded.publicUrl,
        preview_url: uploaded.publicUrl,
        mime_type: file.type || null,
        size_bytes: file.size,
        status,
        tags: tagList,
        notes: finalNotes,
        origin: "upload",
        ai_allowed: aiAllowed,
        storage_bucket: "library",
        storage_path: path,
        asset_role: finalType,
        usage_context: finalType === "Logo" ? "logo_oficial" : finalType === "Foto pessoal / retrato" ? "foto_pessoal_autorizada" : "biblioteca",
        metadata: { upload_type: finalType, file_name: file.name, mime_type: file.type, theme_policy: "light_only" },
      } as Partial<MediaAssetRow>);
      await libraryRepository.create(session.access_token, {
        brand_id: brandId,
        media_asset_id: asset.id,
        name: file.name,
        type: finalType,
        item_type: finalType,
        url: uploaded.publicUrl,
        source_url: uploaded.publicUrl,
        status,
        tags: tagList,
        notes: finalNotes,
        format: finalType === "Logo" ? "Logo oficial" : finalType === "Foto pessoal / retrato" ? "Foto pessoal" : "Todos",
        ai_usage_rule: rule,
        ai_allowed: aiAllowed,
        asset_role: finalType,
        usage_context: finalType === "Logo" ? "logo_oficial" : finalType === "Foto pessoal / retrato" ? "foto_pessoal_autorizada" : "referência visual",
        metadata: { upload_type: finalType, file_name: file.name, mime_type: file.type, theme_policy: "light_only" },
      } as Partial<LibraryItemRow>);
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function makeTemplate(item: MediaAsset) {
    await run("Item marcado como template e liberado para a IA.", () => {
      const libraryRow = rowByItem(item);
      if (libraryRow) return libraryRepository.update(session!.access_token, item.id, { status: "template", ai_allowed: true, item_type: "Template" } as Partial<LibraryItemRow>);
      return mediaRepository.update(session!.access_token, item.id, { status: "template", ai_allowed: true, media_type: "Template" } as Partial<MediaAssetRow>);
    });
  }

  async function deleteItem(item: MediaAsset) {
    await run("Item excluído definitivamente da biblioteca.", async () => {
      const libraryRow = rowByItem(item);
      if (libraryRow) {
        await libraryRepository.hardDelete(session!.access_token, libraryRow.id);
        if (libraryRow.media_asset_id) await mediaRepository.hardDelete(session!.access_token, libraryRow.media_asset_id);
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
  const logos = items.filter((i) => String(i.type).toLowerCase().includes("logo") || i.tags.includes("logo"));
  const people = items.filter((i) => String(i.type).toLowerCase().includes("foto") || i.tags.includes("foto-pessoal"));

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <PageHeader
        title="Biblioteca de Mídia"
        description="Upload de logos PNG, fotos pessoais/retratos, referências claras, templates e insumos que alimentam a IA com segurança."
        actions={
          <>
            <input ref={inputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/svg+xml,video/*,.pdf" onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} />
            <Button className="rounded-full bg-gradient-primary text-primary-foreground" disabled={loading} onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4" /> Upload de arquivos</Button>
          </>
        }
      />
      {loading ? <LoadingState label="Sincronizando Biblioteca/Storage..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-soft">
          <div className="flex items-center gap-3"><Images className="h-8 w-8 text-primary" /><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Referências de Alto Padrão</p><h2 className="text-2xl font-bold">Tema claro obrigatório em todas as criações.</h2></div></div>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">Logos PNG aparecem inteiros, sem corte e com fundo claro. Fotos pessoais/retratos ficam classificadas para posts com área de foto, sem uso indevido.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-5"><Badge variant="outline">{active.length} ativos</Badge><Badge className="bg-success/15 text-success hover:bg-success/15">{approved.length} aprovados IA</Badge><Badge variant="outline">{logos.length} logos</Badge><Badge variant="outline">{people.length} fotos pessoais</Badge><Badge variant="outline">{templates.length} templates</Badge></div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <h3 className="font-bold">Configuração do próximo upload</h3>
          <div className="mt-4 grid gap-3">
            <select value={uploadType} onChange={(e) => setUploadType(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {uploadTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags separadas por vírgula" />
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"><b className="text-foreground">Regra:</b> Logo e foto pessoal entram aprovados por padrão; referências comuns só entram na IA depois de Aprovar IA.</div>
          </div>
        </div>
      </div>
      <Tabs defaultValue="todos" className="space-y-5">
        <TabsList className="flex h-auto flex-wrap justify-start rounded-2xl bg-muted p-1"><TabsTrigger value="todos">Todos</TabsTrigger><TabsTrigger value="logos">Logos ({logos.length})</TabsTrigger><TabsTrigger value="pessoas">Fotos pessoais ({people.length})</TabsTrigger><TabsTrigger value="referencias">Referências aprovadas</TabsTrigger><TabsTrigger value="templates">Templates</TabsTrigger><TabsTrigger value="proibidas">Proibidas</TabsTrigger><TabsTrigger value="arquivadas">Arquivadas</TabsTrigger></TabsList>
        <TabsContent value="todos"><MediaLibraryGrid items={active} onApproveReference={(item) => run("Referência liberada para IA.", () => rowByItem(item) ? markReferenceApproved(session!.access_token, item.id) : mediaRepository.update(session!.access_token, item.id, { status: "referência aprovada", ai_allowed: true } as Partial<MediaAssetRow>))} onForbidReference={(item) => run("Referência bloqueada para IA.", () => rowByItem(item) ? markReferenceForbidden(session!.access_token, item.id) : mediaRepository.update(session!.access_token, item.id, { status: "referência proibida", ai_allowed: false } as Partial<MediaAssetRow>))} onArchive={(item) => run("Item arquivado.", () => rowByItem(item) ? libraryRepository.archive(session!.access_token, item.id, { status: "arquivado", ai_allowed: false } as Partial<LibraryItemRow>) : mediaRepository.archive(session!.access_token, item.id, { status: "arquivado", ai_allowed: false } as Partial<MediaAssetRow>))} onMakeTemplate={makeTemplate} onDelete={deleteItem} /></TabsContent>
        <TabsContent value="logos"><MediaLibraryGrid items={logos} onArchive={(item) => run("Logo arquivado.", () => rowByItem(item) ? libraryRepository.archive(session!.access_token, item.id, { status: "arquivado", ai_allowed: false } as Partial<LibraryItemRow>) : mediaRepository.archive(session!.access_token, item.id, { status: "arquivado", ai_allowed: false } as Partial<MediaAssetRow>))} onDelete={deleteItem} /></TabsContent>
        <TabsContent value="pessoas"><MediaLibraryGrid items={people} onArchive={(item) => run("Foto pessoal arquivada.", () => rowByItem(item) ? libraryRepository.archive(session!.access_token, item.id, { status: "arquivado", ai_allowed: false } as Partial<LibraryItemRow>) : mediaRepository.archive(session!.access_token, item.id, { status: "arquivado", ai_allowed: false } as Partial<MediaAssetRow>))} onDelete={deleteItem} /></TabsContent>
        <TabsContent value="referencias"><MediaLibraryGrid items={approved} onForbidReference={(item) => run("Referência bloqueada.", () => markReferenceForbidden(session!.access_token, item.id))} onArchive={(item) => run("Item arquivado.", () => libraryRepository.archive(session!.access_token, item.id, { status: "arquivado", ai_allowed: false } as Partial<LibraryItemRow>))} onMakeTemplate={makeTemplate} onDelete={deleteItem} /></TabsContent>
        <TabsContent value="templates"><MediaLibraryGrid items={templates} onApproveReference={(item) => run("Template também liberado como referência.", () => markReferenceApproved(session!.access_token, item.id))} onArchive={(item) => run("Template arquivado.", () => libraryRepository.archive(session!.access_token, item.id, { status: "arquivado", ai_allowed: false } as Partial<LibraryItemRow>))} onDelete={deleteItem} /></TabsContent>
        <TabsContent value="proibidas"><div className="mb-4 rounded-3xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"><XCircle className="mr-2 inline h-4 w-4" />Referências proibidas ficam preservadas para histórico, mas nunca entram nos prompts.</div><MediaLibraryGrid items={forbidden} onApproveReference={(item) => run("Referência reabilitada para IA.", () => markReferenceApproved(session!.access_token, item.id))} onArchive={(item) => run("Referência proibida arquivada.", () => libraryRepository.archive(session!.access_token, item.id, { status: "arquivado", ai_allowed: false } as Partial<LibraryItemRow>))} onDelete={deleteItem} /></TabsContent>
        <TabsContent value="arquivadas"><div className="mb-4 rounded-3xl border border-border bg-card p-4 text-sm text-muted-foreground"><Archive className="mr-2 inline h-4 w-4" />Arquivar não apaga arquivo nem histórico. Restaurar volta como ativo, ainda sem entrar na IA até ser aprovado.</div><MediaLibraryGrid items={archived} onRestore={(item) => run("Item restaurado como ativo.", () => rowByItem(item) ? libraryRepository.restore(session!.access_token, item.id, { status: "ativo", ai_allowed: false } as Partial<LibraryItemRow>) : mediaRepository.restore(session!.access_token, item.id, { status: "ativo", ai_allowed: false } as Partial<MediaAssetRow>))} onDelete={deleteItem} /></TabsContent>
      </Tabs>
      <div className="grid gap-3 md:grid-cols-3"><div className="rounded-2xl border border-border bg-card p-4 shadow-soft"><ShieldCheck className="h-5 w-5 text-success" /><h3 className="mt-2 font-bold">Logo PNG</h3><p className="mt-1 text-sm text-muted-foreground">Aparece inteiro, preserva transparência e entra como identidade visual.</p></div><div className="rounded-2xl border border-border bg-card p-4 shadow-soft"><Images className="h-5 w-5 text-primary" /><h3 className="mt-2 font-bold">Foto pessoal</h3><p className="mt-1 text-sm text-muted-foreground">Usada como referência autorizada para posts com área de foto/retrato.</p></div><div className="rounded-2xl border border-border bg-card p-4 shadow-soft"><RotateCcw className="h-5 w-5 text-primary" /><h3 className="mt-2 font-bold">Tema claro</h3><p className="mt-1 text-sm text-muted-foreground">Todas as referências e prompts seguem visual claro/lite MYINC.</p></div></div>
    </div>
  );
}
