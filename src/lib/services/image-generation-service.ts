import { AIContentService } from "@/lib/services/ai-content-service";
import type { MediaAsset, SocialPost } from "@/lib/social-types";

export interface ImageGenerationRequest {
  post: Partial<SocialPost>;
  format: string;
  dimension: string;
  references?: MediaAsset[];
  negativePrompt?: string;
}

export class ImageGenerationService {
  static buildImagePrompt(request: ImageGenerationRequest) {
    const basePrompt = AIContentService.buildImagePrompt(request.post, request.dimension);
    const references = request.references
      ?.filter((item) => item.aiAllowed)
      .map((item) => `${item.name}: ${item.notes}`)
      .join(" | ");
    return `${basePrompt}\n\nFormato: ${request.format}. Dimensão: ${request.dimension}. Referências permitidas: ${references || "nenhuma referência anexada"}. Negative prompt adicional: ${request.negativePrompt || "usar negative prompt padrão MYINC"}.`;
  }

  static async generateImage(request: ImageGenerationRequest) {
    const prompt = this.buildImagePrompt(request);
    const useAiImages = import.meta.env.SSR ? process.env.USE_AI_IMAGES === "1" : false;
    const endpoint = import.meta.env.SSR ? process.env.IMAGE_GENERATION_API_URL : undefined;
    const apiKey = import.meta.env.SSR ? process.env.IMAGE_API_KEY : undefined;

    if (!useAiImages || !endpoint || !apiKey) {
      throw new Error(
        "Geração local desativada. Use a Edge Function generate-image com OPENAI_API_KEY/OPENAI_IMAGE_MODEL.",
      );
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        prompt,
        size: request.dimension,
        model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
      }),
    });

    if (!response.ok) throw new Error(`Falha ao gerar imagem: ${response.status}`);
    const data = await response.json();
    return {
      mode: "real" as const,
      url: data.url ?? data.output?.[0]?.url,
      prompt,
      message: "Imagem gerada com provedor configurado.",
    };
  }

  static saveGeneratedImage(asset: Partial<MediaAsset>) {
    return {
      ...asset,
      id: asset.id ?? `media-${Date.now()}`,
      uploadedAt: new Date().toISOString(),
      origin: "Geração IA",
    };
  }

  static async regenerateImage(request: ImageGenerationRequest, humanFeedback: string) {
    return this.generateImage({
      ...request,
      negativePrompt: `${request.negativePrompt ?? ""}. Comentário humano: ${humanFeedback}`,
    });
  }

  static validateImageUrl(url?: string) {
    if (!url) return { ok: false, message: "URL da imagem ausente." };
    if (!url.startsWith("https://"))
      return { ok: false, message: "A mídia precisa estar em uma URL pública HTTPS." };
    return { ok: true, message: "URL pública HTTPS válida." };
  }
}
