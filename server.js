const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5173;

// Change this to wherever your manga lives:
const LIBRARY_ROOT = path.join(__dirname, "library");

// --- helpers ---
function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);

function extractFirstNumber(s) {
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Sort by: first number (if present), else natural-ish fallback
function sortPages(files) {
  return files.sort((a, b) => {
    const an = extractFirstNumber(a);
    const bn = extractFirstNumber(b);
    if (an !== null && bn !== null && an !== bn) return an - bn;
    if (an !== null && bn === null) return -1;
    if (an === null && bn !== null) return 1;
    // fallback: locale compare with numeric sorting
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
}

// Prevent path traversal
function safeJoin(root, ...parts) {
  const resolved = path.resolve(root, ...parts);
  if (!resolved.startsWith(path.resolve(root))) {
    throw new Error("Invalid path");
  }
  return resolved;
}

// --- API ---
app.get("/api/manga", (req, res) => {
  const manga = fs.readdirSync(LIBRARY_ROOT)
    .filter(name => isDir(path.join(LIBRARY_ROOT, name)))
    .sort((a,b)=>a.localeCompare(b, undefined, {numeric:true, sensitivity:"base"}));

  res.json(manga);
});

app.get("/api/chapters", (req, res) => {
  const { manga } = req.query;
  if (!manga) return res.status(400).json({ error: "manga is required" });

  let mangaPath;
  try { mangaPath = safeJoin(LIBRARY_ROOT, manga); }
  catch { return res.status(400).json({ error: "bad manga path" }); }

  if (!isDir(mangaPath)) return res.status(404).json({ error: "not found" });

  const chapters = fs.readdirSync(mangaPath)
    .filter(name => isDir(path.join(mangaPath, name)))
    .sort((a,b)=>a.localeCompare(b, undefined, {numeric:true, sensitivity:"base"}));

  res.json(chapters);
});

app.get("/api/pages", (req, res) => {
  const { manga, chapter } = req.query;
  if (!manga || !chapter) return res.status(400).json({ error: "manga and chapter are required" });

  let chapterPath;
  try { chapterPath = safeJoin(LIBRARY_ROOT, manga, chapter); }
  catch { return res.status(400).json({ error: "bad path" }); }

  if (!isDir(chapterPath)) return res.status(404).json({ error: "not found" });

  const pages = fs.readdirSync(chapterPath)
    .filter(name => {
      const p = path.join(chapterPath, name);
      const ext = path.extname(name).toLowerCase();
      return isFile(p) && IMAGE_EXTS.has(ext);
    });

  res.json(sortPages(pages));
});

app.get("/img", (req, res) => {
  const { manga, chapter, file } = req.query;
  if (!manga || !chapter || !file) return res.status(400).send("missing params");

  let filePath;
  try { filePath = safeJoin(LIBRARY_ROOT, manga, chapter, file); }
  catch { return res.status(400).send("bad path"); }

  if (!isFile(filePath)) return res.status(404).send("not found");

res.type(filePath); // Express sets Content-Type from extension
  fs.createReadStream(filePath).pipe(res);
});

// --- UI (single html file) ---
app.get("/", (req, res) => {
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Local Manga Reader</title>
  <style>
    body { font-family: system-ui, Arial; margin: 16px; }
    .row { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
    select, button { padding: 8px; font-size: 14px; }
    #pages img { width: min(100%, 900px); display:block; margin: 12px auto; }
    .topbar { position: sticky; top: 0; background: white; padding: 10px 0; border-bottom: 1px solid #eee; }
    .muted { color:#666; font-size: 13px; }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="row">
      <div>
        <div class="muted">Manga</div>
        <select id="manga"></select>
      </div>
      <div>
        <div class="muted">Chapter</div>
        <select id="chapter"></select>
      </div>
      <button id="prev">Prev</button>
      <button id="next">Next</button>
    </div>
  </div>

  <div id="pages"></div>

<script>
const mangaSel = document.getElementById("manga");
const chapterSel = document.getElementById("chapter");
const pagesDiv = document.getElementById("pages");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");

let chapters = [];

async function loadManga() {
  const m = await fetch("/api/manga").then(r=>r.json());
  mangaSel.innerHTML = m.map(x => \`<option>\${x}</option>\`).join("");
  await loadChapters();
}

async function loadChapters() {
  const manga = mangaSel.value;
  chapters = await fetch(\`/api/chapters?manga=\${encodeURIComponent(manga)}\`).then(r=>r.json());
  chapterSel.innerHTML = chapters.map(x => \`<option>\${x}</option>\`).join("");
  await loadPages();
}

async function loadPages() {
  const manga = mangaSel.value;
  const chapter = chapterSel.value;
  const pages = await fetch(\`/api/pages?manga=\${encodeURIComponent(manga)}&chapter=\${encodeURIComponent(chapter)}\`).then(r=>r.json());

  pagesDiv.innerHTML = "";
  for (const file of pages) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = \`/img?manga=\${encodeURIComponent(manga)}&chapter=\${encodeURIComponent(chapter)}&file=\${encodeURIComponent(file)}\`;
    pagesDiv.appendChild(img);
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

mangaSel.addEventListener("change", loadChapters);
chapterSel.addEventListener("change", loadPages);

prevBtn.addEventListener("click", () => {
  const idx = chapters.indexOf(chapterSel.value);
  if (idx > 0) {
    chapterSel.value = chapters[idx - 1];
    loadPages();
  }
});
nextBtn.addEventListener("click", () => {
  const idx = chapters.indexOf(chapterSel.value);
  if (idx >= 0 && idx < chapters.length - 1) {
    chapterSel.value = chapters[idx + 1];
    loadPages();
  }
});

// Keyboard: left/right for chapter
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") prevBtn.click();
  if (e.key === "ArrowRight") nextBtn.click();
});

loadManga();
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
console.log("Manga reader running at http://localhost:" + PORT);
});
