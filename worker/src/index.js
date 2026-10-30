const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
const PLAYER_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
const ID_PATTERN = /^[a-f0-9-]{36}$/i;

function cors(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = env.SITE_ORIGIN || "";
  if (origin && origin !== allowed) return null;
  return {
    "Access-Control-Allow-Origin": origin || allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}

function authorized(request, env) {
  const header = request.headers.get("Authorization") || "";
  const expected = `Bearer ${env.SERVER_TOKEN || ""}`;
  return env.SERVER_TOKEN && header.length === expected.length && header === expected;
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (!headers) return json({ message: "Origin not allowed." }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (!env.DB) return json({ message: "Claim service database is not configured." }, 503, headers);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const now = Math.floor(Date.now() / 1000);

    if (path === "/api/health" && request.method === "GET") return json({ status: "online" }, 200, headers);

    if (path === "/api/claims" && request.method === "POST") {
      let body;
      try { body = await request.json(); }
      catch { return json({ message: "Send a JSON request." }, 400, headers); }
      const player = typeof body.player === "string" ? body.player.trim() : "";
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      if (!PLAYER_PATTERN.test(player)) return json({ message: "Enter a valid Minecraft username." }, 400, headers);
      if (!CODE_PATTERN.test(code)) return json({ message: "That link code format is invalid." }, 400, headers);

      const windowStart = Math.floor(now / 60) * 60;
      const rate = await env.DB.prepare(`INSERT INTO submit_rates(player_key, window_start, count)
        VALUES(lower(?1), ?2, 1)
        ON CONFLICT(player_key) DO UPDATE SET
          count = CASE WHEN submit_rates.window_start = excluded.window_start THEN submit_rates.count + 1 ELSE 1 END,
          window_start = excluded.window_start
        RETURNING count`).bind(player, windowStart).first();
      if (rate && rate.count > 5) return json({ message: "Too many attempts. Wait a minute, then try again." }, 429, headers);

      const existing = await env.DB.prepare(`SELECT id FROM claims
        WHERE lower(player_name) = lower(?1) AND status IN ('queued', 'processing') AND expires_at > ?2 LIMIT 1`)
        .bind(player, now).first();
      if (existing) return json({ message: "You already have a claim request in progress." }, 409, headers);

      const id = crypto.randomUUID();
      const expires = now + 600;
      await env.DB.prepare(`INSERT INTO claims(id, player_name, code, status, created_at, updated_at, expires_at)
        VALUES(?1, ?2, ?3, 'queued', ?4, ?4, ?5)`)
        .bind(id, player, code, now, expires).run();
      return json({ id, status: "queued", message: "Request sent to GlaggleSMP." }, 202, headers);
    }

    const statusMatch = path.match(/^\/api\/claims\/([a-f0-9-]{36})$/i);
    if (statusMatch && request.method === "GET") {
      const row = await env.DB.prepare("SELECT status, message, expires_at FROM claims WHERE id = ?1")
        .bind(statusMatch[1]).first();
      if (!row) return json({ message: "Claim request not found." }, 404, headers);
      if (row.expires_at <= now && ["queued", "processing"].includes(row.status)) {
        await env.DB.prepare("UPDATE claims SET status = 'expired', message = 'The link code expired. Run /kitlink for a new code.', updated_at = ?2 WHERE id = ?1")
          .bind(statusMatch[1], now).run();
        return json({ status: "expired", message: "The link code expired. Run /kitlink for a new code." }, 200, headers);
      }
      return json({ status: row.status, message: row.message }, 200, headers);
    }

    if (path === "/api/server/claims" && request.method === "GET") {
      if (!authorized(request, env)) return json({ message: "Unauthorized." }, 401, headers);
      await env.DB.prepare(`UPDATE claims SET status = 'queued', updated_at = ?1
        WHERE status = 'processing' AND updated_at < ?2 AND expires_at > ?1`).bind(now, now - 90).run();
      await env.DB.prepare(`UPDATE claims SET status = 'expired', message = 'The link code expired.', updated_at = ?1
        WHERE status IN ('queued', 'processing') AND expires_at <= ?1`).bind(now).run();
      const { results = [] } = await env.DB.prepare(`SELECT id, player_name, code FROM claims
        WHERE status = 'queued' AND expires_at > ?1 ORDER BY created_at LIMIT 10`).bind(now).all();
      if (!results.length) return new Response(null, { status: 204, headers });
      const batch = results.map((row) => env.DB.prepare("UPDATE claims SET status = 'processing', updated_at = ?2 WHERE id = ?1 AND status = 'queued'")
        .bind(row.id, now));
      await env.DB.batch(batch);
      const body = results.map((row) => `${row.id}\t${row.player_name}\t${row.code}`).join("\n");
      return new Response(body, { status: 200, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }

    const resultMatch = path.match(/^\/api\/server\/claims\/([a-f0-9-]{36})\/result$/i);
    if (resultMatch && request.method === "POST") {
      if (!authorized(request, env)) return json({ message: "Unauthorized." }, 401, headers);
      let body;
      try { body = await request.json(); }
      catch { return json({ message: "Send a JSON result." }, 400, headers); }
      if (!["fulfilled", "rejected"].includes(body.status)) return json({ message: "Invalid result status." }, 400, headers);
      const message = typeof body.message === "string" ? body.message.slice(0, 180) : "";
      const updated = await env.DB.prepare(`UPDATE claims SET status = ?2, message = ?3, updated_at = ?4
        WHERE id = ?1 AND status IN ('queued', 'processing')`).bind(resultMatch[1], body.status, message, now).run();
      if (!updated.meta.changes) return json({ message: "Claim request is no longer pending." }, 409, headers);
      return new Response(null, { status: 204, headers });
    }

    return json({ message: "Not found." }, 404, headers);
  }
};
