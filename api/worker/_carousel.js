export function carouselInput(job) {
  const input = job?.input_json || {};
  return {
    page: Number(input.page || 1),
    totalPages: Number(input.total_pages || input.totalPages || 5),
  };
}

export function carouselPrompt({ post, contextText, page, totalPages }) {
  return [
    `Pagina ${page} de ${totalPages} de um carrossel premium MYINC.`,
    "Formato carrossel imobiliario premium, visual claro, off-white, areia, arquitetura contemporanea, alto padrao e muito respiro.",
    "Sem texto renderizado na imagem, sem logo falso, sem letras, sem numeros e sem watermark.",
    "Deixe areas seguras para texto ser aplicado depois pelo app ou designer.",
    `Tema geral: ${post.title || post.theme || "MYINC"}.`,
    `Brief: ${post.creative_brief || post.image_prompt || post.caption || "carrossel institucional premium"}.`,
    `Contexto: ${contextText}`,
  ].join("\n");
}

export function mergeCarouselUrls(existingAssets, newUrl) {
  const items = [...(Array.isArray(existingAssets) ? existingAssets : []), { public_url: newUrl, url: newUrl, metadata: { page: 999 } }];
  return items
    .filter((item, index, arr) => {
      const url = item.public_url || item.url;
      return url && arr.findIndex((x) => (x.public_url || x.url) === url) === index;
    })
    .sort((a, b) => Number(a.metadata?.page || 999) - Number(b.metadata?.page || 999))
    .map((item) => item.public_url || item.url);
}
