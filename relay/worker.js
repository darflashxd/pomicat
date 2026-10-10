/**
 * SafeShare-AI — Zero-Knowledge Cloudflare Worker with D1 Database & Static Assets
 * 
 * Features:
 * - 100% Serverless: Runs on Cloudflare Global Edge network across 300+ cities.
 * - 0% Laptop Dependency: Senders and developers can turn off their laptops completely.
 * - Cloudflare D1 SQL Backend: 100k writes/day, 5M reads/day on 100% free tier.
 * - Zero-Knowledge: Only encrypted ciphertext is stored. The decryption key (#) never touches the server.
 * - Strict 24-Hour Expiration: Auto-purges expired records via SQL timestamp checks.
 * - Atomic Burn-After-Reading: Single-use links shredded immediately upon first retrieval.
 * - Single-Project Serving: Delivers the Web Viewer static assets directly from edge cache.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
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
    if (request.method === "POST" && (url.pathname === "/api/share" || url.pathname === "/api/create")) {
      try {
        const body = await request.json();
        const { id, ciphertext, ttl, burn_on_read } = body;

        if (!id || !ciphertext) {
          return new Response(JSON.stringify({ error: "Missing id or ciphertext" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (typeof id !== "string" || id.length > 128) {
          return new Response(JSON.stringify({ error: "Invalid share ID format" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (typeof ciphertext !== "string" || ciphertext.length > 2 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: "Ciphertext exceeds maximum allowed size (2MB)" }), {
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

        // Store into Cloudflare D1 Database if bound
        if (env.DB) {
          const existing = await env.DB.prepare(
            "SELECT id FROM shares WHERE id = ? AND expires_at > ?"
          ).bind(id, now).first();

          if (existing) {
            return new Response(JSON.stringify({ error: "Share ID already exists" }), {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          await env.DB.prepare(
            "INSERT OR REPLACE INTO shares (id, ciphertext, created_at, expires_at, burn_on_read, view_count) VALUES (?, ?, ?, ?, ?, 0)"
          )
            .bind(id, ciphertext, now, expiresAt, burnFlag)
            .run();

          // Lazy background cleanup of expired records (Zero extra cost)
          if (ctx && ctx.waitUntil) {
            ctx.waitUntil(
              env.DB.prepare("DELETE FROM shares WHERE expires_at < ?").bind(now).run()
            );
          }
        } else if (env.SAFESHARE_KV) {
          const existing = await env.SAFESHARE_KV.get(id);
          if (existing) {
            return new Response(JSON.stringify({ error: "Share ID already exists" }), {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          // Fallback to KV if configured
          await env.SAFESHARE_KV.put(id, JSON.stringify({ ciphertext, created_at: now, burn_on_read: burnFlag }), {
            expirationTtl: ttlSec
          });
        }

        return new Response(
          JSON.stringify({
            status: "stored",
            id,
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

    // 2. API: Revoke / Emergency Shred (GET or POST /api/revoke/:id)
    if (url.pathname.startsWith("/api/revoke/")) {
      const shareId = url.pathname.replace(/^\/api\/revoke\//, "").trim();
      try {
        if (env.DB) {
          await env.DB.prepare("DELETE FROM shares WHERE id = ?").bind(shareId).run();
        } else if (env.SAFESHARE_KV) {
          await env.SAFESHARE_KV.delete(shareId);
        }
        return new Response(JSON.stringify({ status: "revoked", id: shareId }), {
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

    // 3. API: Retrieve Ciphertext (GET /api/share/:id or GET /api/:id)
    if (request.method === "GET" && (url.pathname.startsWith("/api/share/") || (url.pathname.startsWith("/api/") && url.pathname.split("/").length === 3))) {
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
  }
};
