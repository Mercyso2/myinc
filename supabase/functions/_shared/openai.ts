import { env, envNumber, requiredEnv } from './env.ts';
import { base64ToBytes, detectMime } from './media.ts';
import { sleep } from './http.ts';

async function openaiFetch(path: string, init: RequestInit, timeoutMs = 120000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`https://api.openai.com${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${requiredEnv('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function openaiJson(path: string, body: Record<string, unknown>, timeoutMs = 120000): Promise<Record<string, unknown>> {
  const response = await openaiFetch(path, { method: 'POST', body: JSON.stringify(body) }, timeoutMs);
  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_error) {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = typeof data?.error === 'object' && data.error && 'message' in data.error
      ? String((data.error as Record<string, unknown>).message)
      : `OpenAI retornou HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

export async function generateTextJson(params: {
  system: string;
  user: string;
  schemaHint?: string;
  temperature?: number;
}): Promise<Record<string, unknown>> {
  const model = env('OPENAI_TEXT_MODEL', 'gpt-4.1-mini');
  const data = await openaiJson('/v1/chat/completions', {
    model,
    temperature: params.temperature ?? 0.7,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: `${params.user}\n\nResponda somente JSON válido.${params.schemaHint ? `\nSchema esperado: ${params.schemaHint}` : ''}` },
    ],
  });
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = typeof message?.content === 'string' ? message.content : '{}';
  try {
    return JSON.parse(content);
  } catch (_error) {
    return { raw: content };
  }
}

async function extractImageBytes(data: Record<string, unknown>): Promise<{ bytes: Uint8Array; source: string; mime: string; ext: string }> {
  const arr = Array.isArray(data.data) ? data.data : [];
  const item = arr[0] as Record<string, unknown> | undefined;
  if (!item) throw new Error('OpenAI não retornou dados de imagem.');

  const b64 = item.b64_json ?? item.image_base64 ?? item.base64;
  if (typeof b64 === 'string' && b64.length > 32) {
    const bytes = base64ToBytes(b64);
    const detected = detectMime(bytes);
    if (!detected.valid) throw new Error('Imagem retornada pela OpenAI não tem assinatura PNG/JPEG/WEBP válida.');
    return { bytes, source: 'base64', mime: detected.mime, ext: detected.ext };
  }

  const url = item.url ?? item.image_url;
  if (typeof url === 'string' && url.startsWith('http')) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao baixar imagem da URL OpenAI: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const detected = detectMime(bytes);
    if (!detected.valid) throw new Error('Imagem baixada da OpenAI não tem assinatura PNG/JPEG/WEBP válida.');
    return { bytes, source: 'url', mime: detected.mime, ext: detected.ext };
  }

  throw new Error('OpenAI não retornou imagem em b64_json nem URL.');
}

export async function generateOpenAIImage(params: {
  prompt: string;
  size?: string;
  quality?: string;
  model?: string;
}): Promise<{ bytes: Uint8Array; model: string; mime: string; ext: string; source: string }> {
  const models = [
    params.model || env('OPENAI_IMAGE_MODEL', 'gpt-image-2'),
    ...env('OPENAI_IMAGE_FALLBACK_MODELS', 'gpt-image-1.5,gpt-image-1').split(',').map((x) => x.trim()).filter(Boolean),
  ];

  let lastError: unknown;
  for (const model of [...new Set(models)]) {
    try {
      const data = await openaiJson('/v1/images/generations', {
        model,
        prompt: params.prompt,
        size: params.size || env('OPENAI_IMAGE_SIZE', '1024x1024'),
        quality: params.quality || env('OPENAI_IMAGE_QUALITY', 'high'),
        n: 1,
      });
      const extracted = await extractImageBytes(data);
      return { ...extracted, model };
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Falha na geração de imagem OpenAI.');
}

export async function createAndDownloadVideo(params: {
  prompt: string;
  model?: string;
  size?: string;
  seconds?: number;
}): Promise<{ bytes: Uint8Array; videoId?: string; model: string; status: string }> {
  const model = params.model || env('OPENAI_VIDEO_MODEL', 'sora-2-pro');
  const timeoutSeconds = envNumber('OPENAI_VIDEO_POLL_TIMEOUT_SECONDS', 320);
  const intervalSeconds = envNumber('OPENAI_VIDEO_POLL_INTERVAL_SECONDS', 10);

  const created = await openaiJson('/v1/videos', {
    model,
    prompt: params.prompt,
    size: params.size || env('OPENAI_VIDEO_SIZE', '1080x1920'),
    seconds: params.seconds || envNumber('OPENAI_VIDEO_SECONDS', 8),
  }, 120000);

  const id = String(created.id ?? created.video_id ?? '');
  if (!id) throw new Error('OpenAI não retornou id do job de vídeo.');

  const start = Date.now();
  let lastStatus = String(created.status ?? 'queued');
  let finalPayload = created;

  while ((Date.now() - start) / 1000 < timeoutSeconds) {
    const check = await fetch(`https://api.openai.com/v1/videos/${id}`, {
      headers: { Authorization: `Bearer ${requiredEnv('OPENAI_API_KEY')}` },
    });
    const payload = await check.json().catch(() => ({}));
    if (!check.ok) throw new Error(`Falha ao consultar vídeo OpenAI: HTTP ${check.status}`);
    finalPayload = payload as Record<string, unknown>;
    lastStatus = String(finalPayload.status ?? lastStatus);
    if (['completed', 'succeeded', 'ready'].includes(lastStatus)) break;
    if (['failed', 'cancelled', 'canceled', 'expired'].includes(lastStatus)) {
      throw new Error(`Vídeo OpenAI falhou: ${JSON.stringify(finalPayload).slice(0, 1200)}`);
    }
    await sleep(intervalSeconds * 1000);
  }

  if (!['completed', 'succeeded', 'ready'].includes(lastStatus)) {
    throw new Error(`Timeout aguardando vídeo OpenAI. Último status: ${lastStatus}`);
  }

  const contentUrlCandidates = [
    `https://api.openai.com/v1/videos/${id}/content`,
    typeof finalPayload.output_url === 'string' ? finalPayload.output_url : '',
    typeof finalPayload.url === 'string' ? finalPayload.url : '',
  ].filter(Boolean);

  let lastDownloadError: unknown;
  for (const url of contentUrlCandidates) {
    try {
      const response = await fetch(url, {
        headers: url.includes('api.openai.com') ? { Authorization: `Bearer ${requiredEnv('OPENAI_API_KEY')}` } : {},
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const detected = detectMime(bytes);
      if (!detected.valid || detected.mime !== 'video/mp4') throw new Error('Conteúdo baixado não é MP4 válido.');
      return { bytes, videoId: id, model, status: lastStatus };
    } catch (error) {
      lastDownloadError = error;
    }
  }

  throw lastDownloadError instanceof Error ? lastDownloadError : new Error('Não foi possível baixar MP4 da OpenAI.');
}
