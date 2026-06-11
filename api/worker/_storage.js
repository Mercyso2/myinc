export function storageConfig() {
  const required = (name) => {
    const value = process.env[name] || "";
    if (!value) throw new Error(`${name} ausente na Vercel Function.`);
    return value;
  };
  return {
    supabaseUrl: required("SUPABASE_URL").replace(/\/$/, ""),
    serviceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    bucket: process.env.MEDIA_BUCKET || "creative-media",
    forcePublic: String(process.env.STORAGE_FORCE_PUBLIC_BUCKET || "true").toLowerCase() !== "false",
  };
}

function headers(serviceKey, extra = {}) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...extra };
}

export async function ensurePublicBucket() {
  const { supabaseUrl, serviceKey, bucket, forcePublic } = storageConfig();
  if (!forcePublic) return { ok: true, bucket, public: false, skipped: true };

  const read = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, { headers: headers(serviceKey) });
  if (read.status === 404) {
    const create = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: "POST",
      headers: headers(serviceKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({ id: bucket, name: bucket, public: true }),
    });
    const body = await create.text();
    if (!create.ok && create.status !== 409) throw new Error(`Nao consegui criar bucket ${bucket}: ${body}`);
    return { ok: true, bucket, public: true, created: true };
  }

  const info = await read.json().catch(() => ({}));
  if (!read.ok) throw new Error(`Nao consegui verificar bucket ${bucket}: ${JSON.stringify(info)}`);
  if (info.public === false) {
    const update = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, {
      method: "PUT",
      headers: headers(serviceKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({ id: bucket, name: bucket, public: true }),
    });
    const body = await update.text();
    if (!update.ok) throw new Error(`Bucket ${bucket} existe, mas nao consegui tornar publico: ${body}`);
  }
  return { ok: true, bucket, public: true };
}
