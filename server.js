/* ============================================================
   Mon Français — tiny sync server.

   Zero dependencies: Node built-ins only, so there is nothing to
   install and nothing to go stale.

   Responsibilities
     - serve the static app
     - check a single shared password (APP_PASSWORD)
     - hand out a signed, httpOnly session cookie
     - read/write one progress file on a persistent volume

   Required Railway settings
     APP_PASSWORD   your password        (Variables)
     a Volume mounted anywhere           (Railway sets
                                          RAILWAY_VOLUME_MOUNT_PATH)
   ============================================================ */

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.APP_PASSWORD || "";
const ON_RAILWAY = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);

// Railway exports RAILWAY_VOLUME_MOUNT_PATH only when a volume is actually
// attached — that is the one reliable signal that writes will survive a
// redeploy. Without it we still run, but we say so loudly.
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || "";
const PERSISTENT = Boolean(VOLUME);
const DATA_DIR = VOLUME || path.join(__dirname, ".data");
const DATA_FILE = path.join(DATA_DIR, "progress.json");
const BACKUP_FILE = path.join(DATA_DIR, "progress.bak.json");

// Rotating the password invalidates old sessions, which is the behaviour
// you want if you ever think it leaked.
const SECRET = process.env.SESSION_SECRET ||
  crypto.createHash("sha256").update("mf:" + PASSWORD).digest("hex");

const SESSION_DAYS = 90;
const MAX_BODY = 4 * 1024 * 1024;
const ROOT = __dirname;

/* ---------------- Startup checks ---------------- */

if (!PASSWORD) {
  console.error("\n  ✗ APP_PASSWORD is not set. Sync is disabled until you add it.");
  console.error("    Railway → your service → Variables → APP_PASSWORD\n");
} else if (PASSWORD.length < 8) {
  console.warn("\n  ! APP_PASSWORD is shorter than 8 characters. Use something longer.\n");
}
if (ON_RAILWAY && !PERSISTENT) {
  console.error("\n  ✗ No volume attached. Progress will be ERASED on every redeploy.");
  console.error("    Railway → your service → Settings → Volumes → add one\n");
}
fs.mkdirSync(DATA_DIR, { recursive: true });
console.log(`  Mon Français → port ${PORT}`);
console.log(`  storage: ${DATA_FILE} (${PERSISTENT ? "persistent volume" : "EPHEMERAL"})`);

/* ---------------- Sessions ---------------- */

const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("base64url");

function issueToken() {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  return `${exp}.${sign(String(exp))}`;
}

function tokenValid(token) {
  if (!token || !token.includes(".")) return false;
  const [exp, mac] = token.split(".");
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = sign(exp);
  const a = Buffer.from(mac || "");
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function passwordMatches(given) {
  if (!PASSWORD) return false;
  // Hash both sides first so timingSafeEqual never sees mismatched lengths.
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((pair) => {
    const i = pair.indexOf("=");
    if (i > 0) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

const isHttps = (req) => (req.headers["x-forwarded-proto"] || "").split(",")[0] === "https";

function sessionCookie(req, token) {
  const bits = [
    `mf_session=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    token ? `Max-Age=${SESSION_DAYS * 86400}` : "Max-Age=0"
  ];
  if (isHttps(req)) bits.push("Secure");
  return bits.join("; ");
}

const authed = (req) => tokenValid(cookies(req).mf_session);

/* ---------------- Login throttling ---------------- */

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function throttled(ip) {
  const rec = attempts.get(ip);
  if (!rec || Date.now() > rec.resetAt) return false;
  return rec.count >= MAX_ATTEMPTS;
}
function noteFailure(ip) {
  const rec = attempts.get(ip);
  if (!rec || Date.now() > rec.resetAt) attempts.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
  else rec.count += 1;
}
const clearFailures = (ip) => attempts.delete(ip);

/* ---------------- Progress storage ---------------- */

async function readProgress() {
  try {
    return JSON.parse(await fsp.readFile(DATA_FILE, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    console.error("progress read failed, trying backup:", e.message);
    try { return JSON.parse(await fsp.readFile(BACKUP_FILE, "utf8")); }
    catch { return null; }
  }
}

async function writeProgress(data) {
  // Keep the previous good copy, then write via a temp file and rename so a
  // crash mid-write cannot leave truncated JSON behind.
  try { await fsp.copyFile(DATA_FILE, BACKUP_FILE); } catch { /* first write */ }
  const tmp = DATA_FILE + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(data), "utf8");
  await fsp.rename(tmp, DATA_FILE);
}

/* ---------------- HTTP helpers ---------------- */

function json(res, code, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("payload too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
  ".woff2":"font/woff2",
  ".md":   "text/plain; charset=utf-8"
};

const SERVE_DIRS = ["css", "js", "data"];

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";

  const abs = path.normalize(path.join(ROOT, rel));
  // Path-traversal guard: resolved path must stay inside the project, and
  // only the app's own directories and root files are reachable.
  if (!abs.startsWith(ROOT + path.sep)) return json(res, 403, { error: "forbidden" });

  const top = path.relative(ROOT, abs).split(path.sep)[0];
  const isRootFile = !path.relative(ROOT, abs).includes(path.sep);
  if (!isRootFile && !SERVE_DIRS.includes(top)) return json(res, 404, { error: "not found" });
  if (isRootFile && ![".html", ".ico", ".svg", ".md", ".txt"].includes(path.extname(abs))) {
    return json(res, 404, { error: "not found" });
  }

  try {
    const stat = await fsp.stat(abs);
    if (!stat.isFile()) throw new Error("not a file");
    const ext = path.extname(abs);
    const body = await fsp.readFile(abs);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(body);
  } catch {
    json(res, 404, { error: "not found" });
  }
}

/* ---------------- Router ---------------- */

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
          || req.socket.remoteAddress || "unknown";

  try {
    if (url === "/api/status") {
      return json(res, 200, {
        syncEnabled: Boolean(PASSWORD),
        persistent: PERSISTENT,
        authenticated: authed(req)
      });
    }

    if (url === "/api/login" && req.method === "POST") {
      if (!PASSWORD) return json(res, 503, { error: "Sync is not configured on the server." });
      if (throttled(ip)) return json(res, 429, { error: "Too many attempts. Try again in 15 minutes." });
      const body = await readBody(req);
      if (!passwordMatches(body.password || "")) {
        noteFailure(ip);
        return json(res, 401, { error: "Wrong password." });
      }
      clearFailures(ip);
      return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, issueToken()) });
    }

    if (url === "/api/logout" && req.method === "POST") {
      return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "") });
    }

    if (url === "/api/progress") {
      if (!authed(req)) return json(res, 401, { error: "Not signed in." });

      if (req.method === "GET") {
        return json(res, 200, { data: await readProgress(), persistent: PERSISTENT });
      }
      if (req.method === "PUT") {
        const body = await readBody(req);
        if (!body || typeof body !== "object" || !body.progress) {
          return json(res, 400, { error: "Malformed progress payload." });
        }
        // Settings are per-device (dark mode, voice speed). The client already
        // strips them; enforce it here too so one device can never push its
        // display preferences onto the others.
        if (body.user && body.user.settings) delete body.user.settings;
        body._updatedAt = new Date().toISOString();
        await writeProgress(body);
        return json(res, 200, { ok: true, persistent: PERSISTENT });
      }
      return json(res, 405, { error: "method not allowed" });
    }

    if (url.startsWith("/api/")) return json(res, 404, { error: "not found" });

    return serveStatic(req, res, url);
  } catch (e) {
    console.error("request failed:", e.message);
    json(res, e.message === "invalid JSON" || e.message === "payload too large" ? 400 : 500,
         { error: e.message });
  }
});

server.listen(PORT, () => console.log(`  listening on :${PORT}`));
