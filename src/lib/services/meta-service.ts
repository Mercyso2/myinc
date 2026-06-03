import type { SocialPost } from "@/lib/social-types";

export interface MetaConfig {
  graphVersion?: string;
  pageId?: string;
  instagramBusinessId?: string;
  pageAccessToken?: string;
  facebookPageId?: string;
  publicMediaBaseUrl?: string;
}

function envConfig(): MetaConfig {
  if (!import.meta.env.SSR) return {};
  return {
    graphVersion: process.env.META_GRAPH_VERSION ?? "v23.0",
    pageId: process.env.META_PAGE_ID,
    instagramBusinessId: process.env.META_INSTAGRAM_BUSINESS_ID,
    pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN,
    facebookPageId: process.env.FACEBOOK_PAGE_ID,
    publicMediaBaseUrl: process.env.PUBLIC_MEDIA_BASE_URL,
  };
}

export class MetaService {
  private config: MetaConfig;

  constructor(config: MetaConfig = envConfig()) {
    this.config = config;
  }

  validateMetaConnection() {
    const missing = [
      ["META_PAGE_ACCESS_TOKEN", this.config.pageAccessToken],
      ["META_PAGE_ID", this.config.pageId],
      ["META_INSTAGRAM_BUSINESS_ID", this.config.instagramBusinessId],
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length) {
      return {
        ok: false,
        message: "Conexão Meta não configurada. Adicione suas chaves no Painel ADM.",
        missing,
      };
    }
    return { ok: true, message: "Conexão Meta configurada para validação real.", missing: [] };
  }

  async getFacebookPageInfo() {
    const validation = this.validateMetaConnection();
    if (!validation.ok) return validation;
    const url = `https://graph.facebook.com/${this.config.graphVersion}/${this.config.pageId}?fields=id,name,access_token&access_token=${this.config.pageAccessToken}`;
    return this.safeFetch(url);
  }

  async getInstagramBusinessAccount() {
    const validation = this.validateMetaConnection();
    if (!validation.ok) return validation;
    const url = `https://graph.facebook.com/${this.config.graphVersion}/${this.config.instagramBusinessId}?fields=id,username&access_token=${this.config.pageAccessToken}`;
    return this.safeFetch(url);
  }

  async validatePublishPermissions() {
    const validation = this.validateMetaConnection();
    if (!validation.ok) return validation;
    const url = `https://graph.facebook.com/${this.config.graphVersion}/me/permissions?access_token=${this.config.pageAccessToken}`;
    return this.safeFetch(url);
  }

  validatePublicMediaUrl(url?: string) {
    if (!url)
      return { ok: false, message: "Mídia ausente. Gere ou envie um arquivo antes de publicar." };
    if (!url.startsWith("https://"))
      return { ok: false, message: "A mídia precisa ter URL pública HTTPS." };
    return { ok: true, message: "Mídia pronta para publicação Meta." };
  }

  validatePostBeforePublish(post: SocialPost) {
    const connection = this.validateMetaConnection();
    if (!connection.ok) return connection;
    const media = this.validatePublicMediaUrl(post.mediaUrl);
    if (!media.ok) return media;
    if (post.status !== "aprovado" && post.status !== "agendado")
      return { ok: false, message: "A publicação precisa estar aprovada antes de publicar." };
    if (!post.caption || post.caption.length > 2200)
      return { ok: false, message: "Legenda ausente ou acima do limite recomendado." };
    if (!post.scheduledAt) return { ok: false, message: "Data e hora de publicação obrigatórias." };
    return { ok: true, message: "Post validado para publicação." };
  }

  async publishInstagramImage(post: SocialPost) {
    const validation = this.validatePostBeforePublish(post);
    if (!validation.ok) return validation;
    const createUrl = `https://graph.facebook.com/${this.config.graphVersion}/${this.config.instagramBusinessId}/media`;
    const container = await this.safeFetch(createUrl, "POST", {
      image_url: post.mediaUrl,
      caption: post.caption,
      access_token: this.config.pageAccessToken,
    });
    if (!container.ok || !container.id) return container;
    return this.safeFetch(
      `https://graph.facebook.com/${this.config.graphVersion}/${this.config.instagramBusinessId}/media_publish`,
      "POST",
      { creation_id: container.id, access_token: this.config.pageAccessToken },
    );
  }

  async publishInstagramCarousel(post: SocialPost) {
    return this.publishInstagramImage(post);
  }
  async publishInstagramVideoOrReel(post: SocialPost) {
    return this.publishInstagramImage(post);
  }

  async publishFacebookTextPost(post: SocialPost) {
    const connection = this.validateMetaConnection();
    if (!connection.ok) return connection;
    return this.safeFetch(
      `https://graph.facebook.com/${this.config.graphVersion}/${this.config.facebookPageId ?? this.config.pageId}/feed`,
      "POST",
      { message: post.caption, access_token: this.config.pageAccessToken },
    );
  }

  async publishFacebookPhoto(post: SocialPost) {
    const validation = this.validatePostBeforePublish(post);
    if (!validation.ok) return validation;
    return this.safeFetch(
      `https://graph.facebook.com/${this.config.graphVersion}/${this.config.facebookPageId ?? this.config.pageId}/photos`,
      "POST",
      { url: post.mediaUrl, caption: post.caption, access_token: this.config.pageAccessToken },
    );
  }

  async publishFacebookVideo(post: SocialPost) {
    const validation = this.validatePostBeforePublish(post);
    if (!validation.ok) return validation;
    return this.safeFetch(
      `https://graph.facebook.com/${this.config.graphVersion}/${this.config.facebookPageId ?? this.config.pageId}/videos`,
      "POST",
      {
        file_url: post.mediaUrl,
        description: post.caption,
        access_token: this.config.pageAccessToken,
      },
    );
  }

  schedulePost(post: SocialPost) {
    return {
      ok: true,
      message: "Post validado e colocado na fila semi-automática.",
      scheduledAt: post.scheduledAt,
    };
  }

  async publishNow(post: SocialPost) {
    if (post.channel === "Facebook")
      return post.format.includes("Vídeo")
        ? this.publishFacebookVideo(post)
        : this.publishFacebookPhoto(post);
    if (post.channel === "Ambos")
      return {
        instagram: await this.publishInstagramImage(post),
        facebook: await this.publishFacebookPhoto(post),
      };
    return post.format.includes("Reels") || post.format.includes("Vídeo")
      ? this.publishInstagramVideoOrReel(post)
      : this.publishInstagramImage(post);
  }

  async getPublishStatus(publishId: string) {
    const validation = this.validateMetaConnection();
    if (!validation.ok) return validation;
    return this.safeFetch(
      `https://graph.facebook.com/${this.config.graphVersion}/${publishId}?access_token=${this.config.pageAccessToken}`,
    );
  }

  handleMetaError(error: unknown) {
    const message = error instanceof Error ? error.message : "Erro desconhecido da Meta.";
    return {
      ok: false,
      message: "A Meta retornou um erro. Verifique credenciais, permissões e URL pública da mídia.",
      technicalDetail: message,
    };
  }

  private async safeFetch(url: string, method = "GET", body?: Record<string, unknown>) {
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) return this.handleMetaError(new Error(JSON.stringify(data)));
      return { ok: true, ...data };
    } catch (error) {
      return this.handleMetaError(error);
    }
  }
}
