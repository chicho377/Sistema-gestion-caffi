// Servidor HTTP SOLO de pruebas. No es Supabase real ni se importa desde src.
import http from "node:http";
const identities = {
  admin: {
    id: "00000000-0000-4000-8000-000000000001",
    role: "admin",
    status: "active",
    full_name: "Administradora de prueba",
  },
  member: {
    id: "00000000-0000-4000-8000-000000000002",
    role: "collaborator",
    status: "active",
    full_name: "Colaboradora de prueba",
  },
  inactive: {
    id: "00000000-0000-4000-8000-000000000003",
    role: "collaborator",
    status: "inactive",
    full_name: "Cuenta inactiva",
  },
};
const token = (key) =>
  `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: identities[key].id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url")}.fixture-${key}`;
const user = (key) => ({
  id: identities[key].id,
  email: `${key}@example.test`,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: { full_name: identities[key].full_name },
  created_at: "2026-01-01T00:00:00Z",
});
const session = (key) => ({
  access_token: token(key),
  refresh_token: `refresh-${key}`,
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: user(key),
});
let revoked = new Set();
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, "http://localhost:54329");
  const key = Object.keys(identities).find((k) =>
    req.headers.authorization?.endsWith(`fixture-${k}`),
  );
  const reply = (status, data) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (url.pathname === "/health") return reply(200, { ok: true });
  if (url.pathname === "/test/reset") {
    revoked = new Set();
    return reply(200, {});
  }
  if (url.pathname === "/test/revoke") {
    revoked.add(body.key);
    return reply(200, {});
  }
  if (url.pathname === "/auth/v1/token") {
    const k = String(body.email || "").split("@")[0];
    if (!identities[k] || body.password !== "Test-password-123!")
      return reply(400, {
        code: "invalid_credentials",
        msg: "Invalid credentials",
      });
    return reply(200, session(k));
  }
  if (url.pathname === "/auth/v1/user") {
    if (!key || revoked.has(key)) return reply(401, { msg: "Expired token" });
    return reply(200, user(key));
  }
  if (url.pathname === "/auth/v1/verify") {
    if (body.token_hash !== "valid-test-token")
      return reply(403, { msg: "Expired token" });
    return reply(200, session("member"));
  }
  if (url.pathname === "/auth/v1/recover") return reply(200, {});
  if (url.pathname === "/auth/v1/logout") {
    return reply(204, null);
  }
  if (url.pathname === "/auth/v1/invite") {
    if (req.headers.authorization !== "Bearer test-server-key")
      return reply(403, {});
    return reply(200, user("member"));
  }
  if (url.pathname === "/rest/v1/profiles") {
    if (!key || revoked.has(key) || identities[key].status !== "active")
      return reply(200, req.headers.accept?.includes("object") ? null : []);
    let rows = Object.entries(identities)
      .filter(([k]) => key === "admin" || k === key)
      .map(([k, p]) => ({
        ...p,
        email: `${k}@example.test`,
        created_at: "2026-01-01T00:00:00Z",
        last_access_at: null,
      }));
    if (url.searchParams.has("id"))
      rows = rows.filter((p) => `eq.${p.id}` === url.searchParams.get("id"));
    if (req.method === "PATCH")
      return reply(key === "admin" ? 200 : 403, key === "admin" ? rows : []);
    return reply(
      200,
      req.headers.accept?.includes("object") ? rows[0] || null : rows,
    );
  }
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    if (!key || revoked.has(key) || identities[key].status !== "active")
      return reply(403, { message: "Forbidden" });
    if (url.pathname.endsWith("record_invitation") && key !== "admin")
      return reply(403, { message: "Forbidden" });
    return reply(200, null);
  }
  return reply(404, { message: "Unknown fixture route" });
});
server.listen(54329, "127.0.0.1", () =>
  process.stdout.write("Auth fixture ready on 54329\n"),
);
