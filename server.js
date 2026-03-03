const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5173;

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public"), { index: "library.html" }));

const LIBRARY_ROOT = path.join(__dirname, "library");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const COVER_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}
function safeJoin(root, ...parts) {
  const resolved = path.resolve(root, ...parts);
  const rootResolved = path.resolve(root);
  if (!resolved.startsWith(rootResolved)) throw new Error("Invalid path");
  return resolved;
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

// -----------------------------
// Prefs saved to ./data/state.json (GLOBAL shared)
// -----------------------------
const DATA_DIR = path.join(__dirname, "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");

const DEFAULT_STATE = {
  version: 1,
  mode: "vertical",
  lastChapterByManga: {},
  lastOpened: { manga: "", chapter: "", at: "" }
};

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

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

    // normalize
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
        : { manga: "", chapter: "", at: "" }
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

// Windows-friendly write (tmp + copy)
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

// Accept PATCH-like updates (merge, don't wipe)
app.post("/api/prefs", (req, res) => {
  const patch = req.body || {};
  const state = readState();

  if (patch.mode === "horizontal" || patch.mode === "vertical") {
    state.mode = patch.mode;
  }

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

app.listen(PORT, () => {
  console.log(`Manga reader running at http://localhost:${PORT}`);
  console.log("Prefs file:", STATE_PATH);
});