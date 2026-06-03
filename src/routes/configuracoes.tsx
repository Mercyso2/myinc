import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArchiveRestore, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, LoadingState } from "@/components/social-components";
import { useAuth } from "@/lib/auth";
import {
  brandProfileRepository,
  brandRepository,
  getFirstAccessibleBrand,
} from "@/lib/repositories/brand-repository";
import { logRepository } from "@/lib/repositories/log-repository";
import { libraryRepository, mediaRepository } from "@/lib/repositories/media-repository";
import { uploadStorageObject } from "@/lib/supabase/client";
import type { LibraryItemRow, MediaAssetRow } from "@/lib/supabase/types";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Memória da Marca — MYINC" }] }),
  component: Configuracoes,
});

type MemoryFields = Record<string, string>;

const fieldGroups = {
  principal: [
    "name",
    "public_name",
    "site",
    "instagram",
    "facebook",
    "whatsapp",
    "commercial_email",
    "region",
    "niche",
    "segment",
    "primary_audience",
    "persona",
    "products",
    "services",
    "average_ticket",
    "objections",
    "guarantees",
    "social_proof",
    "cases",
    "testimonials",
    "faq",
  ],
  verbal: ["tone", "preferred_words", "forbidden_words", "forbidden_phrases", "forbidden_promises"],
  visual: [
    "primary_palette",
    "secondary_palette",
    "forbidden_colors",
    "brand_fonts",
    "preferred_visual_style",
    "logo_rules",
    "composition_rules",
    "image_text_rules",
    "approved_references",
    "bad_references",
  ],
};

const labels: Record<string, string> = {
  name: "Nome da empresa",
  public_name: "Nome público",
  commercial_email: "E-mail",
  primary_audience: "Público-alvo",
  average_ticket: "Ticket médio",
  social_proof: "Provas sociais",
  preferred_words: "Palavras preferidas",
  forbidden_words: "Palavras proibidas",
  forbidden_phrases: "Frases proibidas",
  forbidden_promises: "Promessas proibidas",
  primary_palette: "Paleta principal",
  secondary_palette: "Paleta secundária",
  forbidden_colors: "Cores proibidas",
  brand_fonts: "Fontes",
  preferred_visual_style: "Estilo visual",
  logo_rules: "Regras de logo",
  composition_rules: "Regras de composição",
  image_text_rules: "Regras de texto em imagem",
  approved_references: "Referências boas",
  bad_references: "Referências ruins",
};

function Configuracoes() {
  const { session, profile } = useAuth();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [brandId, setBrandId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [fields, setFields] = useState<MemoryFields>({});
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);

  const allKeys = useMemo(
    () => [...fieldGroups.principal, ...fieldGroups.verbal, ...fieldGroups.visual],
    [],
  );

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const brand = profile?.brand_id
        ? await brandRepository.getById(session.access_token, profile.brand_id)
        : await getFirstAccessibleBrand(session.access_token);
      if (!brand) {
        setError("Nenhuma marca encontrada. Reinicie o backend local para criar a seed MYINC.");
        return;
      }
      setBrandId(brand.id);
      const [brandProfile] = await brandProfileRepository.listByBrand(
        session.access_token,
        brand.id,
        "limit=1",
      );
      setProfileId(brandProfile?.id ?? "");
      setFields({
        name: brand.name ?? "",
        public_name: brand.public_name ?? "",
        ...((brandProfile ?? {}) as unknown as MemoryFields),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar memória da marca.");
    } finally {
      setLoading(false);
    }
  }, [profile?.brand_id, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!brandId || !session || !Object.keys(fields).length) return;
    const timer = window.setTimeout(() => void save(true), 1200);
    return () => window.clearTimeout(timer);
  }, [fields]);

  async function save(auto = false) {
    if (!session || !brandId) return;
    setLoading(true);
    setError("");
    try {
      await brandRepository.update(session.access_token, brandId, {
        name: fields.name || "Marca",
        public_name: fields.public_name,
      } as never);
      const payload = Object.fromEntries(
        Object.entries(fields).filter(([key]) => !["name", "public_name"].includes(key)),
      );
      if (profileId)
        await brandProfileRepository.update(session.access_token, profileId, payload as never);
      else {
        const created = await brandProfileRepository.create(session.access_token, {
          brand_id: brandId,
          ...payload,
        } as never);
        setProfileId(created.id);
      }
      await logRepository.create(session.access_token, {
        brand_id: brandId,
        module: "memoria",
        type: "brand",
        status: "sucesso",
        friendly_message: auto
          ? "Auto-save da memória da marca concluído."
          : "Memória da marca salva.",
        technical_detail: "brand_profiles atualizado",
      } as never);
      setSaved(true);
      if (!auto) toast.success("Memória salva no banco local.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar memória.");
    } finally {
      setLoading(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!session || !brandId) return;
    setLogoUploading(true);
    setError("");
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const storagePath = `${brandId}/logos/${crypto.randomUUID()}-${safeName}`;
      const uploaded = await uploadStorageObject(
        "brand-assets",
        storagePath,
        session.access_token,
        file,
      );
      const asset = await mediaRepository.create(session.access_token, {
        brand_id: brandId,
        name: file.name,
        media_type: "Logo",
        url: uploaded.publicUrl,
        preview_url: uploaded.publicUrl,
        status: "ativo",
        tags: ["logo", "myinc", "marca"],
        notes: "Logo enviada pela tela Memória da Marca.",
        origin: "upload-logo",
        ai_allowed: true,
        storage_bucket: "brand-assets",
        storage_path: storagePath,
        asset_role: "Logo",
        usage_context: "marca",
      } as Partial<MediaAssetRow>);
      await libraryRepository.create(session.access_token, {
        brand_id: brandId,
        media_asset_id: asset.id,
        name: file.name,
        item_type: "Logo",
        url: uploaded.publicUrl,
        status: "referência aprovada",
        tags: ["logo", "marca", "myinc"],
        notes: "Logo oficial aprovada para orientar composição visual da IA.",
        format: "Todos",
        ai_usage_rule:
          "Usar como referência de marca, composição, respiro e contraste. Não distorcer a logo.",
        ai_allowed: true,
        asset_role: "Logo",
        usage_context: "identidade visual",
      } as Partial<LibraryItemRow>);
      await logRepository.create(session.access_token, {
        brand_id: brandId,
        module: "memoria",
        type: "logo",
        status: "sucesso",
        friendly_message: "Logo enviada e aprovada para a IA.",
        technical_detail: storagePath,
      } as never);
      toast.success("Logo enviada, salva e liberada como referência da IA.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar logo.");
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  function renderFields(keys: string[]) {
    if (!brandId && !loading)
      return (
        <EmptyState
          title="Nenhuma marca encontrada"
          description="Cadastre uma marca no Supabase para habilitar a memória real."
        />
      );
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {keys.map((key) => (
          <label key={key} className="space-y-2">
            <span className="text-sm font-semibold">{labels[key] ?? key}</span>
            {(fields[key] ?? "").length > 90 ||
            ["faq", "cases", "testimonials", "approved_references", "bad_references"].includes(
              key,
            ) ? (
              <Textarea
                value={fields[key] ?? ""}
                onChange={(e) => {
                  setSaved(false);
                  setFields((current) => ({ ...current, [key]: e.target.value }));
                }}
                className="min-h-24"
              />
            ) : (
              <Input
                value={fields[key] ?? ""}
                onChange={(e) => {
                  setSaved(false);
                  setFields((current) => ({ ...current, [key]: e.target.value }));
                }}
              />
            )}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <PageHeader
        title="Memória da Marca"
        description="Dados reais persistidos no banco local e usados pelos prompts do Cérebro IA."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-full bg-gradient-primary text-primary-foreground"
              disabled={loading || !brandId}
              onClick={() => void save(false)}
            >
              <Save className="h-4 w-4" />
              Salvar agora
            </Button>
            <Button variant="outline" className="rounded-full" disabled>
              <ArchiveRestore className="h-4 w-4" />
              Restaurar arquivados
            </Button>
          </div>
        }
      />
      {loading ? <LoadingState label="Sincronizando memória local..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {saved ? (
        <div className="rounded-2xl border border-success/30 bg-success/10 p-3 text-sm text-success">
          Salvo no banco local.
        </div>
      ) : null}
      <div className="rounded-3xl border border-border bg-sidebar p-6 text-sidebar-foreground shadow-elevated">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sidebar-primary">
          Base de conhecimento da IA
        </p>
        <h2 className="mt-2 text-2xl font-bold">
          A IA só cria como a marca quando entende a marca profundamente.
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-sidebar-foreground/65">
          Auto-save com debounce e botão salvar persistem em brands/brand_profiles.
        </p>
      </div>
      <Tabs defaultValue="principal" className="space-y-5">
        <TabsList className="flex h-auto flex-wrap justify-start rounded-2xl bg-muted p-1">
          <TabsTrigger value="principal">Informações principais</TabsTrigger>
          <TabsTrigger value="verbal">Identidade verbal</TabsTrigger>
          <TabsTrigger value="visual">Identidade visual</TabsTrigger>
          <TabsTrigger value="logos">Logos e uploads</TabsTrigger>
        </TabsList>
        <TabsContent value="principal">{renderFields(fieldGroups.principal)}</TabsContent>
        <TabsContent value="verbal">{renderFields(fieldGroups.verbal)}</TabsContent>
        <TabsContent value="visual">{renderFields(fieldGroups.visual)}</TabsContent>
        <TabsContent value="logos">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) =>
                event.target.files?.[0] && void uploadLogo(event.target.files[0])
              }
            />
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-xl font-bold">Logos oficiais e uploads da marca</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Envie logos branca, escura, horizontal, vertical ou símbolo. Elas entram na
                  Biblioteca como referência aprovada para o Cérebro IA.
                </p>
              </div>
              <Button
                className="rounded-full bg-gradient-primary text-primary-foreground"
                disabled={logoUploading || loading || !brandId}
                onClick={() => logoInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {logoUploading ? "Enviando..." : "Enviar logo oficial"}
              </Button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">
                Logo enviada vira item de Biblioteca.
              </div>
              <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">
                Status: referência aprovada para IA.
              </div>
              <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">
                Storage local corrigido para aceitar subpastas.
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
