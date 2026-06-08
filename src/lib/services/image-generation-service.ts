import { callEdgeFunction } from "@/lib/supabase/client";
import type { MediaAsset, SocialPost } from "@/lib/social-types";

export type ImageGenerationStage =
  | "preparando_prompt"
  | "gerando_imagem"
  | "salvando_midia"
  | "atualizando_post"
  | "concluido";

export interface ImageGenerationResult {
  ok: true;
  mediaUrl: string;
  carouselMediaUrls: string[];
  model: string;
  prompt: string;
  mediaAsset: Partial<MediaAsset> & { id: string };
  post: SocialPost;
  message?: string;
}

export interface ImageGenerationOptions {
  token: string;
  postId: string;
  feedback?: string;
  onStage?: (stage: ImageGenerationStage) => void;
}

/** Production-only wrapper. Image generation and secrets always stay in generate-image. */
export class ImageGenerationService {
  static async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const { token, postId, feedback, onStage } = options;
    if (!token) throw new Error("Sua sessão expirou. Entre novamente antes de gerar a imagem.");
    if (!postId) throw new Error("Não foi possível identificar o post para gerar a imagem.");

    onStage?.("preparando_prompt");
    try {
      onStage?.("gerando_imagem");
      const result = await callEdgeFunction<ImageGenerationResult>("generate-image", token, {
        postId,
        feedback: feedback?.trim() || undefined,
      });
      onStage?.("salvando_midia");

      if (!result?.ok || !result.mediaUrl || !result.mediaAsset?.id || !result.post) {
        throw new Error(
          "A geração terminou com resposta incompleta. Nenhuma mídia foi considerada pronta.",
        );
      }
      if (!result.mediaUrl.startsWith("https://")) {
        throw new Error("A imagem foi criada, mas não possui uma URL pública HTTPS válida.");
      }

      onStage?.("atualizando_post");
      onStage?.("concluido");
      return { ...result, carouselMediaUrls: result.carouselMediaUrls ?? [] };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Não foi possível gerar a imagem deste post. ${detail}`);
    }
  }

  static regenerateImage(options: ImageGenerationOptions & { feedback: string }) {
    if (!options.feedback.trim()) {
      throw new Error("Informe um feedback humano para regenerar a imagem.");
    }
    return this.generateImage(options);
  }

  static validateImageUrl(url?: string) {
    if (!url) return { ok: false, message: "URL da imagem ausente." };
    if (!url.startsWith("https://"))
      return { ok: false, message: "A mídia precisa estar em uma URL pública HTTPS." };
    return { ok: true, message: "URL pública HTTPS válida." };
  }
}
