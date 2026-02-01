const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5173;

// Change this if you want a different folder
const LIBRARY_ROOT = path.join(__dirname, "library");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// Prevent path traversal (..)
function safeJoin(root, ...parts) {
  const resolved = path.resolve(root, ...parts);
  const rootResolved = path.resolve(root);
  if (!resolved.startsWith(rootResolved)) {
    throw new Error("Invalid path");
  }
  return resolved;
}

function extractFirstNumber(s) {
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Sort pages by: first number in filename, then natural-ish fallback
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

// --- Serve frontend ---
app.use(express.static(path.join(__dirname, "public")));

// --- API: list manga (folders under library) ---
app.get("/api/manga", (req, res) => {
  if (!isDir(LIBRARY_ROOT)) {
    return res.json([]);
  }

  const manga = fs
    .readdirSync(LIBRARY_ROOT)
    .filter((name) => isDir(path.join(LIBRARY_ROOT, name)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  res.json(manga);
});

// --- API: list chapters (folders under library/<manga>) ---
app.get("/api/chapters", (req, res) => {
  const { manga } = req.query;
  if (!manga) return res.status(400).json({ error: "manga is required" });

  let mangaPath;
  try {
    mangaPath = safeJoin(LIBRARY_ROOT, manga);
  } catch {
    return res.status(400).json({ error: "bad manga path" });
  }

  if (!isDir(mangaPath)) return res.status(404).json({ error: "not found" });

  const chapters = fs
    .readdirSync(mangaPath)
    .filter((name) => isDir(path.join(mangaPath, name)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  res.json(chapters);
});

// --- API: list pages (image files under library/<manga>/<chapter>) ---
app.get("/api/pages", (req, res) => {
  const { manga, chapter } = req.query;
  if (!manga || !chapter) return res.status(400).json({ error: "manga and chapter are required" });

  let chapterPath;
  try {
    chapterPath = safeJoin(LIBRARY_ROOT, manga, chapter);
  } catch {
    return res.status(400).json({ error: "bad path" });
  }

  if (!isDir(chapterPath)) return res.status(404).json({ error: "not found" });

  const pages = fs
    .readdirSync(chapterPath)
    .filter((name) => {
      const p = path.join(chapterPath, name);
      const ext = path.extname(name).toLowerCase();
      return isFile(p) && IMAGE_EXTS.has(ext);
    });

  res.json(sortPages(pages));
});

// --- Serve an image file ---
app.get("/img", (req, res) => {
  const { manga, chapter, file } = req.query;
  if (!manga || !chapter || !file) return res.status(400).send("missing params");

  let filePath;
  try {
    filePath = safeJoin(LIBRARY_ROOT, manga, chapter, file);
  } catch {
    return res.status(400).send("bad path");
  }

  if (!isFile(filePath)) return res.status(404).send("not found");

  res.type(filePath); // sets Content-Type by extension
  fs.createReadStream(filePath).pipe(res);
});

app.listen(PORT, () => {
  console.log("Manga reader running at http://localhost:" + PORT);
});
