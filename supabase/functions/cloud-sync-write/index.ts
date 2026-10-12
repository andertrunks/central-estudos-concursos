import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const responseHeaders = {
  ...corsHeaders,
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

const secured = withSupabase({ auth: "user" }, async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "invalid_body" }, 400);
  const input = body as { userId?: unknown; mutations?: unknown };
  if ("userId" in input) return json({ error: "user_id_must_not_be_supplied" }, 400);
  if (!Array.isArray(input.mutations) || input.mutations.length < 1 || input.mutations.length > 50)
    return json({ error: "invalid_mutation_batch" }, 422);

  const userId = ctx.userClaims?.id;
  if (!userId) return json({ error: "unauthorized" }, 401);

  const { data, error } = await ctx.supabaseAdmin.rpc("central_apply_cloud_mutations", {
    p_user_id: userId,
    p_mutations: input.mutations,
  });

  if (error) {
    const message = error.message ?? "writer_error";
    if (message.includes("INTEGRITY_CONFLICT")) return json({ error: "integrity_conflict" }, 409);
    if (
      message.includes("INVALID_") ||
      message.includes("FORBIDDEN") ||
      message.includes("HASH_MISMATCH") ||
      message.includes("DELETE_REQUIRES")
    ) return json({ error: "invalid_mutation" }, 422);
    return json({ error: "writer_error" }, 500);
  }

  return json({ results: data });
});

export default {
  fetch(req: Request) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });
    return secured(req);
  },
};
