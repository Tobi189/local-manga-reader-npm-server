const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const multer = require("multer");
const unzipper = require("unzipper");
const { createExtractorFromData } = require("node-unrar-js");

const app = express();
const PORT = 5173;

const ACCESS_PASSWORD = process.env.MANGA_PASSWORD || ""; // REQUIRED for LAN access

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public"), { index: "library.html" }));

const LIBRARY_ROOT = path.join(__dirname, "library");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const COVER_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

/* -----------------------------
   Helpers
------------------------------ */
function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function safeJoin(root, ...parts) {
  const resolved = path.resolve(root, ...parts);
  const rootResolved = path.resolve(root);
  if (!resolved.startsWith(rootResolved)) throw new Error("Invalid path");
  return resolved;
}
function sanitizeName(name) {
  return String(name || "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\.+/g, ".")
    .trim()
    .slice(0, 120);
}
function uniqueFolder(parent, baseName) {
  let name = baseName;
  let i = 1;
  while (fs.existsSync(path.join(parent, name))) name = `${baseName}-${i++}`;
  return name;
}

// Fix mojibake for multipart header filenames (multer/busboy)
function fixMultipartFilename(name) {
  try {
    const s = String(name ?? "");
    return Buffer.from(s, "latin1").toString("utf8");
  } catch {
    return String(name ?? "");
  }
}

function extractFirstNumber(s) {
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
function sortPages(files) {
  return files.sort((a, b) => {
    const an = extractFirstNumber(a);
    const bn = extractFirstNumber(b);
    if (an !== null && bn !== null && an !== bn) return an - bn;
    if (an !== null && bn === null) return -1;
    if (an === null && bn !== null) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
}

/* -----------------------------
   LAN-only + password auth
------------------------------ */
function parseCookies(header = "") {
  const out = {};
  header.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(v.join("=") || "");
  });
  return out;
}

// Express req.ip can look like "::ffff:192.168.1.20"
function normalizeIp(ip = "") {
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  if (ip === "::1") return "127.0.0.1";
  return ip;
}

function isPrivateIpv4(ip) {
  // very small parser: a.b.c.d
  const parts = ip.split(".").map(n => Number(n));
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;                // localhost
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

// Gate: only allow private IPv4 + localhost.
// (If you later want IPv6 LAN too, we can extend this.)
function isAllowedNetwork(req) {
  const ip = normalizeIp(req.ip || req.socket?.remoteAddress || "");
  return isPrivateIpv4(ip);
}

function isAuthed(req) {
  if (!ACCESS_PASSWORD) return false; // force password when sharing
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies.mr_auth === ACCESS_PASSWORD;
}

// Auth middleware: blocks everything except /login (and a couple of tiny assets)
app.use((req, res, next) => {
  // allow login endpoints always (still LAN-only)
  if (req.path === "/login" || req.path === "/logout") {
    if (!isAllowedNetwork(req)) return res.status(403).send("LAN only");
    return next();
  }

  // block non-LAN
  if (!isAllowedNetwork(req)) return res.status(403).send("LAN only");

  // require password for everything else
  if (!isAuthed(req)) {
    // If it's an API request, return JSON; otherwise redirect to login
    if (req.path.startsWith("/api/")) return res.status(401).json({ error: "auth_required" });
    return res.redirect("/login");
  }

  next();
});

// Login page + login submit
app.get("/login", (req, res) => {
  res.type("html").send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Login</title>
  <style>
    body{font-family:system-ui,Arial,sans-serif;margin:0;padding:24px;background:#fafafa}
    .card{max-width:420px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:14px;padding:18px}
    input{width:100%;padding:12px;border:1px solid #e9e9e9;border-radius:10px;font-size:16px}
    button{margin-top:12px;padding:10px 14px;border:1px solid #eee;border-radius:10px;background:#fff;font-size:16px;cursor:pointer}
    .muted{color:#666;margin-top:8px;font-size:14px}
  </style>
</head>
<body>
  <div class="card">
    <div style="font-weight:700;font-size:18px;margin-bottom:10px;">Local Manga Reader</div>
    <form method="POST" action="/login">
      <input type="password" name="pw" placeholder="Password" autofocus />
      <button type="submit">Enter</button>
    </form>
    <div class="muted">Ask the host for the password.</div>
  </div>
</body>
</html>
  `);
});

app.post("/login", express.urlencoded({ extended: false }), (req, res) => {
  const pw = String(req.body?.pw || "");
  if (!ACCESS_PASSWORD) return res.status(500).send("Server password not set.");
  if (pw !== ACCESS_PASSWORD) return res.status(401).send("Wrong password.");

  res.setHeader("Set-Cookie", `mr_auth=${encodeURIComponent(pw)}; Path=/; SameSite=Lax`);
  res.redirect("/");
});

app.get("/logout", (req, res) => {
  res.setHeader("Set-Cookie", `mr_auth=; Path=/; Max-Age=0; SameSite=Lax`);
  res.redirect("/login");
});

/* -----------------------------
   Share info endpoint (LAN URLs)
------------------------------ */
function getLanIps() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

app.get("/api/server-info", (req, res) => {
  const ips = getLanIps();
  res.json({
    port: PORT,
    urls: ips.map(ip => `http://${ip}:${PORT}`)
  });
});

/* -----------------------------
   Prefs saved to ./data/state.json (GLOBAL shared)
------------------------------ */
const DATA_DIR = path.join(__dirname, "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");

const DEFAULT_STATE = {
  version: 1,
  mode: "vertical",
  lastChapterByManga: {},
  lastOpened: { manga: "", chapter: "", at: "" },
  settings: {
    librarySort: "name",
    showDownloadSides: false,
    downloadFormat: "png",
    jpgQuality: 0.9
  }
};

function readState() {
  try {
    ensureDir(DATA_DIR);
    if (!fs.existsSync(STATE_PATH)) {
      fs.writeFileSync(STATE_PATH, JSON.stringify(DEFAULT_STATE, null, 2), "utf8");
      return { ...DEFAULT_STATE };
    }
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    if (!raw.trim()) return { ...DEFAULT_STATE };
    const obj = JSON.parse(raw);

    return {
      version: 1,
      mode: obj.mode === "horizontal" ? "horizontal" : "vertical",
      lastChapterByManga: (obj.lastChapterByManga && typeof obj.lastChapterByManga === "object")
        ? obj.lastChapterByManga
        : {},
      lastOpened: (obj.lastOpened && typeof obj.lastOpened === "object")
        ? {
            manga: typeof obj.lastOpened.manga === "string" ? obj.lastOpened.manga : "",
            chapter: typeof obj.lastOpened.chapter === "string" ? obj.lastOpened.chapter : "",
            at: typeof obj.lastOpened.at === "string" ? obj.lastOpened.at : ""
          }
        : { manga: "", chapter: "", at: "" },
      settings: (obj.settings && typeof obj.settings === "object")
        ? {
            librarySort: obj.settings.librarySort === "lastOpened" ? "lastOpened" : "name",
            showDownloadSides: !!obj.settings.showDownloadSides,
            downloadFormat: obj.settings.downloadFormat === "jpg" ? "jpg" : "png",
            jpgQuality:
              (typeof obj.settings.jpgQuality === "number" && obj.settings.jpgQuality >= 0.1 && obj.settings.jpgQuality <= 1)
                ? obj.settings.jpgQuality
                : 0.9
          }
        : { ...DEFAULT_STATE.settings }
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeState(state) {
  ensureDir(DATA_DIR);
  const tmp = STATE_PATH + ".tmp";
  const json = JSON.stringify(state, null, 2);
  fs.writeFileSync(tmp, json, "utf8");
  fs.copyFileSync(tmp, STATE_PATH);
  try { fs.unlinkSync(tmp); } catch {}
}

app.get("/api/prefs", (req, res) => {
  res.json(readState());
});

app.post("/api/prefs", (req, res) => {
  const patch = req.body || {};
  const state = readState();

  if (patch.mode === "horizontal" || patch.mode === "vertical") state.mode = patch.mode;

  if (patch.lastChapterByManga && typeof patch.lastChapterByManga === "object") {
    state.lastChapterByManga = patch.lastChapterByManga;
  }

  if (patch.lastOpened && typeof patch.lastOpened === "object") {
    state.lastOpened = {
      manga: typeof patch.lastOpened.manga === "string" ? patch.lastOpened.manga : state.lastOpened.manga,
      chapter: typeof patch.lastOpened.chapter === "string" ? patch.lastOpened.chapter : state.lastOpened.chapter,
      at: typeof patch.lastOpened.at === "string" ? patch.lastOpened.at : state.lastOpened.at
    };
  }

  if (patch.settings && typeof patch.settings === "object") {
    state.settings = state.settings && typeof state.settings === "object"
      ? state.settings
      : { ...DEFAULT_STATE.settings };

    if (patch.settings.librarySort === "name" || patch.settings.librarySort === "lastOpened") {
      state.settings.librarySort = patch.settings.librarySort;
    }
    if (typeof patch.settings.showDownloadSides === "boolean") {
      state.settings.showDownloadSides = patch.settings.showDownloadSides;
    }
    if (patch.settings.downloadFormat === "png" || patch.settings.downloadFormat === "jpg") {
      state.settings.downloadFormat = patch.settings.downloadFormat;
    }
    if (typeof patch.settings.jpgQuality === "number") {
      const q = patch.settings.jpgQuality;
      if (q >= 0.1 && q <= 1) state.settings.jpgQuality = q;
    }
  }

  writeState(state);
  res.json({ ok: true });
});

/* -----------------------------
   Library APIs
------------------------------ */
app.get("/api/manga", (req, res) => {
  if (!isDir(LIBRARY_ROOT)) return res.json([]);
  const manga = fs
    .readdirSync(LIBRARY_ROOT)
    .filter((name) => isDir(path.join(LIBRARY_ROOT, name)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  res.json(manga);
});

app.get("/api/chapters", (req, res) => {
  const { manga } = req.query;
  if (!manga) return res.status(400).json({ error: "manga is required" });

  let mangaPath;
  try { mangaPath = safeJoin(LIBRARY_ROOT, manga); }
  catch { return res.status(400).json({ error: "bad manga path" }); }

  if (!isDir(mangaPath)) return res.status(404).json({ error: "not found" });

  const chapters = fs
    .readdirSync(mangaPath)
    .filter((name) => isDir(path.join(mangaPath, name)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  res.json(chapters);
});

app.get("/api/pages", (req, res) => {
  const { manga, chapter } = req.query;
  if (!manga || !chapter) return res.status(400).json({ error: "manga and chapter are required" });

  let chapterPath;
  try { chapterPath = safeJoin(LIBRARY_ROOT, manga, chapter); }
  catch { return res.status(400).json({ error: "bad path" }); }

  if (!isDir(chapterPath)) return res.status(404).json({ error: "not found" });

  const pages = fs
    .readdirSync(chapterPath)
    .filter((name) => isFile(path.join(chapterPath, name)) && IMAGE_EXTS.has(path.extname(name).toLowerCase()));

  res.json(sortPages(pages));
});

app.get("/img", (req, res) => {
  const { manga, chapter, file } = req.query;
  if (!manga || !chapter || !file) return res.status(400).send("missing params");

  let filePath;
  try { filePath = safeJoin(LIBRARY_ROOT, manga, chapter, file); }
  catch { return res.status(400).send("bad path"); }

  if (!isFile(filePath)) return res.status(404).send("not found");

  res.type(filePath);
  fs.createReadStream(filePath).pipe(res);
});

app.get("/placeholder.jpg", (req, res) => {
  const p = path.join(__dirname, "placeholder.jpg");
  if (!isFile(p)) return res.status(404).send("placeholder.jpg not found next to server.js");
  res.type(p);
  fs.createReadStream(p).pipe(res);
});

app.get("/cover", (req, res) => {
  const { manga } = req.query;
  if (!manga) return res.status(400).send("missing manga");

  let folder;
  try { folder = safeJoin(LIBRARY_ROOT, manga); }
  catch { return res.status(400).send("bad path"); }

  let coverPath = null;
  for (const ext of COVER_EXTS) {
    const p = path.join(folder, "cover" + ext);
    if (isFile(p)) { coverPath = p; break; }
  }

  const fallback = path.join(__dirname, "public", "cover-placeholder.png");
  const toSend = coverPath ?? fallback;

  if (!isFile(toSend)) return res.status(404).send("no cover + no fallback");

  res.type(toSend);
  fs.createReadStream(toSend).pipe(res);
});

app.post("/api/cover", (req, res) => {
  const { manga, filename, data } = req.body || {};
  if (!manga || !filename || !data) return res.status(400).json({ error: "missing fields" });

  let folder;
  try { folder = safeJoin(LIBRARY_ROOT, manga); }
  catch { return res.status(400).json({ error: "bad path" }); }

  if (!isDir(folder)) return res.status(404).json({ error: "manga not found" });

  const ext = path.extname(filename).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) return res.status(400).json({ error: "unsupported file type" });

  const base64 = String(data).replace(/^data:.*;base64,/, "");
  const buffer = Buffer.from(base64, "base64");

  try {
    fs.writeFileSync(path.join(folder, "cover" + ext), buffer);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "failed to save file" });
  }
});

/* -----------------------------
   Add Manga + Upload Chapters
------------------------------ */
const UPLOAD_DIR = path.join(__dirname, "data", "_uploads");
ensureDir(UPLOAD_DIR);

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 1024 * 1024 * 1024 }
});

app.post("/api/manga/create", upload.single("cover"), (req, res) => {
  try {
    ensureDir(LIBRARY_ROOT);

    const rawName = fixMultipartFilename(req.body?.name);
    const name = sanitizeName(rawName);
    if (!name) return res.status(400).json({ error: "name is required" });

    const folderName = uniqueFolder(LIBRARY_ROOT, name);
    const mangaPath = path.join(LIBRARY_ROOT, folderName);
    fs.mkdirSync(mangaPath, { recursive: true });

    if (req.file) {
      const oname = fixMultipartFilename(req.file.originalname);
      const ext = path.extname(oname).toLowerCase();
      if (IMAGE_EXTS.has(ext)) fs.copyFileSync(req.file.path, path.join(mangaPath, "cover" + ext));
      try { fs.unlinkSync(req.file.path); } catch {}
    }

    res.json({ ok: true, manga: folderName });
  } catch {
    res.status(500).json({ error: "failed to create manga" });
  }
});

function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: destDir }))
      .on("close", resolve)
      .on("error", reject);
  });
}

function extractRar(rarPath, destDir) {
  const buffer = fs.readFileSync(rarPath);
  const extractor = createExtractorFromData({ data: new Uint8Array(buffer) });

  const list = extractor.getFileList();
  if (list[0]?.state !== "SUCCESS") throw new Error("RAR list failed");

  const files = list[1].fileHeaders
    .filter(h => !h.flags.directory)
    .map(h => h.name);

  const extracted = extractor.extract({ files });
  if (extracted[0]?.state !== "SUCCESS") throw new Error("RAR extract failed");

  for (const f of extracted[1].files) {
    const rel = f.fileHeader.name.replace(/\\/g, "/");
    const outPath = path.join(destDir, rel);
    ensureDir(path.dirname(outPath));
    fs.writeFileSync(outPath, Buffer.from(f.extraction));
  }
}

app.post("/api/chapters/upload", upload.array("archives", 50), async (req, res) => {
  try {
    const mangaRaw = req.query.manga;
    const manga = sanitizeName(mangaRaw);
    if (!manga) return res.status(400).json({ error: "manga is required" });

    const mangaPath = safeJoin(LIBRARY_ROOT, manga);
    if (!isDir(mangaPath)) return res.status(404).json({ error: "manga not found" });

    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: "no files uploaded" });

    const created = [];

    for (const f of files) {
      const original = fixMultipartFilename(f.originalname);
      const ext = path.extname(original).toLowerCase();
      if (ext !== ".zip" && ext !== ".rar" && ext !== ".cbz") {
        try { fs.unlinkSync(f.path); } catch {}
        continue;
      }

      const base = sanitizeName(path.basename(original, ext));
      const chapterFolder = uniqueFolder(mangaPath, base || "chapter");
      const dest = path.join(mangaPath, chapterFolder);
      fs.mkdirSync(dest, { recursive: true });

      if (ext === ".zip" || ext === ".cbz") await extractZip(f.path, dest);
      else extractRar(f.path, dest);

      created.push(chapterFolder);
      try { fs.unlinkSync(f.path); } catch {}
    }

    res.json({ ok: true, created });
  } catch {
    res.status(500).json({ error: "failed to upload/extract" });
  }
});

app.listen(PORT, () => {
  console.log(`Manga reader running at http://localhost:${PORT}`);
  console.log("LAN URLs:", getLanIps().map(ip => `http://${ip}:${PORT}`).join(" , "));
  console.log("Password required:", ACCESS_PASSWORD ? "YES" : "NO (set MANGA_PASSWORD!)");
});