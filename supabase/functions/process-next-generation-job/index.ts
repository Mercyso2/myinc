import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { callFunction, errorJson, requireActiveUser, serviceClient } from "../_shared/function-utils.ts";
import { json, options } from "../_shared/runtime-config.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    await requireActiveUser(req, supabase);
    const payload = await req.json().catch(() => ({}));
    const result = await callFunction(req, "process-next-generation-job-v2", payload);
    return json(req, result);
  } catch (error) {
    return errorJson(req, error);
  }
});
