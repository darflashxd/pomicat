/**
 * SafeShare-AI — Cloudflare Worker relay (D1 storage + static viewer)
 * 
 * Features:
 * - Stores ciphertext in Cloudflare D1 (KV fallback); runs without the sender online.
 * - Server-blind: only ciphertext is stored. The decryption key (#fragment) never reaches the server.
 * - Strict 24-Hour Expiration: Auto-purges expired records via SQL timestamp checks.
 * - Atomic Burn-After-Reading: Single-use links shredded immediately upon first retrieval.
 * - Single-Project Serving: Delivers the Web Viewer static assets directly from edge cache.
 */

// Pages allowed to call the API cross-origin (content-script fallback upload).
// The viewer is same-origin and the extension background worker is not subject to CORS.
const ALLOWED_ORIGINS = new Set([
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://claude.ai",
  "https://chat.deepseek.com"
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A shared chat is text: even long ones are well under this. Keeps the relay useless as file hosting.
const MAX_CIPHERTEXT = 512 * 1024;

/**
 * Per-IP limits using Cloudflare's rate-limiting bindings (see wrangler.toml).
 * Returns true if the request may proceed. Without the binding (local tests) everything passes.
 */
async function allowed(limiter, request) {
  if (!limiter) return true;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const { success } = await limiter.limit({ key: ip });
  return success;
}

/** Deletes expired shares; run on upload and once a day by the cron trigger. */
function purgeExpired(env) {
  return env.DB ? env.DB.prepare("DELETE FROM shares WHERE expires_at < ?").bind(Date.now()).run() : Promise.resolve();
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "null",
      "Vary": "Origin",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
      "Access-Control-Allow-Headers": "Content-Type",
      "X-Robots-Tag": "noindex, noarchive, nofollow, nosnippet",
      "Cache-Control": "no-store, private, max-age=0",
      "Referrer-Policy": "no-referrer"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. API: Store Encrypted Chat (POST /api/share or POST /api/create)
    const tooMany = () => new Response(JSON.stringify({ error: "Too many requests, try again in a minute" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" }
    });

    if (request.method === "POST" && (url.pathname === "/api/share" || url.pathname === "/api/create")) {
      if (!(await allowed(env.UPLOAD_LIMITER, request))) return tooMany();
      // Refuse oversized bodies before reading them
      if (Number(request.headers.get("Content-Length") || 0) > MAX_CIPHERTEXT + 4096) {
        return new Response(JSON.stringify({ error: "Share too large (max 512 KB)" }), {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        const body = await request.json();
        const { id, ciphertext, ttl, burn_on_read } = body;

        if (!id || !ciphertext) {
          return new Response(JSON.stringify({ error: "Missing id or ciphertext" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // The ID is generated client-side (crypto.randomUUID) because it is bound inside the
        // ciphertext; only accept a real UUID so it stays unguessable.
        if (typeof id !== "string" || !UUID_RE.test(id)) {
          return new Response(JSON.stringify({ error: "Invalid share ID format" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (typeof ciphertext !== "string" || ciphertext.length > MAX_CIPHERTEXT) {
          return new Response(JSON.stringify({ error: "Share too large (max 512 KB)" }), {
            status: 413,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const isBurn = burn_on_read === true || burn_on_read === 1 || ttl === "burn";
        const burnFlag = isBurn ? 1 : 0;

        // Calculate TTL in seconds (default 86400 = 24h, max 604800 = 7d)
        let ttlSec = 86400;
        if (ttl && !isNaN(parseInt(ttl))) {
          ttlSec = Math.min(Math.max(parseInt(ttl), 300), 604800);
        }

        const now = Date.now();
        const expiresAt = now + (ttlSec * 1000);

        const revokeToken = randomToken();
        const revokeHash = await sha256Hex(revokeToken);
        const conflict = () => new Response(JSON.stringify({ error: "Share ID already exists" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

        // Store into Cloudflare D1 Database if bound
        if (env.DB) {
          try {
            // Plain INSERT: the PRIMARY KEY rejects any attempt to overwrite an existing share.
            await env.DB.prepare(
              "INSERT INTO shares (id, ciphertext, created_at, expires_at, burn_on_read, view_count, revoke_hash) VALUES (?, ?, ?, ?, ?, 0, ?)"
            )
              .bind(id, ciphertext, now, expiresAt, burnFlag, revokeHash)
              .run();
          } catch (e) {
            if (/UNIQUE|constraint/i.test(e.message)) return conflict();
            throw e;
          }

          // Lazy background cleanup of expired records
          if (ctx && ctx.waitUntil) ctx.waitUntil(purgeExpired(env));
        } else if (env.SAFESHARE_KV) {
          const existing = await env.SAFESHARE_KV.get(id);
          if (existing) return conflict();
          // Fallback to KV if configured
          // ponytail: KV get-then-put is not atomic; D1 is the supported backend.
          await env.SAFESHARE_KV.put(id, JSON.stringify({ ciphertext, created_at: now, burn_on_read: burnFlag, revoke_hash: revokeHash }), {
            expirationTtl: ttlSec
          });
        }

        return new Response(
          JSON.stringify({
            status: "stored",
            id,
            revoke_token: revokeToken,
            expires_in: ttlSec,
            expires_at: expiresAt,
            burn_on_read: isBurn
          }),
          {
            status: 201,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 2. API: Revoke (POST /api/revoke/:id with {"token": "<revoke_token from create>"})
    if (url.pathname.startsWith("/api/revoke/")) {
      const json = (body, status) => new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
      // POST only: a GET would let link previewers and prefetchers delete shares.
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

      const shareId = url.pathname.replace(/^\/api\/revoke\//, "").trim();
      try {
        const { token } = await request.json().catch(() => ({}));
        if (typeof token !== "string" || !token) return json({ error: "Missing revoke token" }, 401);
        const tokenHash = await sha256Hex(token);

        let deleted = false;
        if (env.DB) {
          const res = await env.DB.prepare("DELETE FROM shares WHERE id = ? AND revoke_hash = ?")
            .bind(shareId, tokenHash).run();
          deleted = (res.meta?.changes || 0) > 0;
        } else if (env.SAFESHARE_KV) {
          const raw = await env.SAFESHARE_KV.get(shareId);
          if (raw && JSON.parse(raw).revoke_hash === tokenHash) {
            await env.SAFESHARE_KV.delete(shareId);
            deleted = true;
          }
        }
        // Same response for "wrong token" and "not found" so the endpoint can't probe IDs.
        if (!deleted) return json({ error: "Not found or invalid token" }, 404);
        return json({ status: "revoked", id: shareId }, 200);
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // 3. API: Retrieve Ciphertext (GET /api/share/:id or GET /api/:id)
    if (request.method === "GET" && (url.pathname.startsWith("/api/share/") || (url.pathname.startsWith("/api/") && url.pathname.split("/").length === 3))) {
      if (!(await allowed(env.READ_LIMITER, request))) return tooMany();
      const shareId = url.pathname.replace(/^\/api\/(?:share\/)?/, "").trim();
      const now = Date.now();

      try {
        let ciphertext = null;
        let isExpired = false;
        let wasBurned = false;

        if (env.DB) {
          const row = await env.DB.prepare(
            "SELECT ciphertext, expires_at, burn_on_read FROM shares WHERE id = ?"
          )
            .bind(shareId)
            .first();

          if (!row) {
            isExpired = true;
          } else if (now > row.expires_at) {
            isExpired = true;
            if (ctx && ctx.waitUntil) {
              ctx.waitUntil(env.DB.prepare("DELETE FROM shares WHERE id = ?").bind(shareId).run());
            }
          } else {
            ciphertext = row.ciphertext;
            if (row.burn_on_read === 1) {
              // Atomic Single-Use Check (TOCTOU Defense): Atomic update lock
              const updateRes = await env.DB.prepare(
                "UPDATE shares SET view_count = view_count + 1 WHERE id = ? AND view_count = 0"
              ).bind(shareId).run();

              if (!updateRes || updateRes.meta?.changes === 0) {
                // Another concurrent request already burned this record!
                isExpired = true;
              } else {
                wasBurned = true;
                // Immediate shredding from edge database
                await env.DB.prepare("DELETE FROM shares WHERE id = ?").bind(shareId).run();
              }
            } else {
              if (ctx && ctx.waitUntil) {
                ctx.waitUntil(env.DB.prepare("UPDATE shares SET view_count = view_count + 1 WHERE id = ?").bind(shareId).run());
              }
            }
          }
        } else if (env.SAFESHARE_KV) {
          const raw = await env.SAFESHARE_KV.get(shareId);
          if (!raw) {
            isExpired = true;
          } else {
            const item = JSON.parse(raw);
            ciphertext = item.ciphertext;
            if (item.burn_on_read === 1) {
              wasBurned = true;
              await env.SAFESHARE_KV.delete(shareId);
            }
          }
        }

        if (isExpired || !ciphertext) {
          return new Response(
            JSON.stringify({ error: "Link expired, shredded, or not found" }),
            {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
          );
        }

        return new Response(JSON.stringify({ ciphertext, burned: wasBurned }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 3. Static Asset Serving (Web Viewer HTML/CSS/JS with strict no-cache)
    if (env.ASSETS) {
      const handleAssetResponse = async (req) => {
        const assetRes = await env.ASSETS.fetch(req);
        const headers = new Headers(assetRes.headers);
        headers.set("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
        headers.set("Pragma", "no-cache");
        headers.set("Expires", "0");
        return new Response(assetRes.body, {
          status: assetRes.status,
          statusText: assetRes.statusText,
          headers
        });
      };

      // If path contains a dot and starts with /s/ or /v/, rewrite to clean asset path
      if (url.pathname.includes(".")) {
        let assetPath = url.pathname;
        for (const prefix of ["/s/", "/v/"]) {
          if (assetPath.startsWith(prefix)) {
            const stripped = assetPath.slice(prefix.length);
            const parts = stripped.split("/");
            if (parts.length > 1) {
              assetPath = "/" + parts.slice(1).join("/");
            } else {
              assetPath = "/" + stripped;
            }
            break;
          }
        }
        const cleanAssetRequest = new Request(new URL(assetPath, request.url), request);
        return await handleAssetResponse(cleanAssetRequest);
      }
      // Route /s/:id or /v/:id to root index.html so client-side router handles it
      if (url.pathname.startsWith("/s/") || url.pathname.startsWith("/v/")) {
        const indexRequest = new Request(new URL("/", request.url), request);
        return await handleAssetResponse(indexRequest);
      }
      return await handleAssetResponse(request);
    }

    return new Response(
      "SafeShare-AI Production Worker Active. Web Viewer not bound to static assets.",
      {
        status: 200,
        headers: corsHeaders
      }
    );
  },

  // Daily cron (wrangler.toml [triggers]): delete expired shares even when nobody uploads
  async scheduled(event, env, ctx) {
    ctx.waitUntil(purgeExpired(env));
  }
};
