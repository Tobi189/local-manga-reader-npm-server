const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const multer = require("multer");
const unzipper = require("unzipper");
const { createExtractorFromData } = require("node-unrar-js");

const app = express();
const PORT = 5173;

/*
  node server.js
  -> laptop only

  node server.js --share
  -> laptop + devices on the same Wi-Fi
*/
const SHARE_MODE = process.argv.includes("--share");
const HOST = SHARE_MODE ? "0.0.0.0" : "127.0.0.1";

/*
  Optional password.

  CMD:
  set MANGA_PASSWORD=yourPassword

  PowerShell:
  $env:MANGA_PASSWORD="yourPassword"
*/
const ACCESS_PASSWORD = process.env.MANGA_PASSWORD || "";

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: false }));

const LIBRARY_ROOT = path.join(__dirname, "library");

const IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp"
]);

const COVER_EXTS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif"
];

/* -----------------------------
   Helpers
------------------------------ */

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

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

function safeJoin(root, ...parts) {
  const resolved = path.resolve(root, ...parts);
  const rootResolved = path.resolve(root);
  const relative = path.relative(rootResolved, resolved);

  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Invalid path");
  }

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

  while (fs.existsSync(path.join(parent, name))) {
    name = `${baseName}-${i++}`;
  }

  return name;
}

function fixMultipartFilename(name) {
  try {
    const value = String(name ?? "");
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return String(name ?? "");
  }
}

function extractFirstNumber(value) {
  const match = String(value).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function sortPages(files) {
  return files.sort((a, b) => {
    const an = extractFirstNumber(a);
    const bn = extractFirstNumber(b);

    if (an !== null && bn !== null && an !== bn) {
      return an - bn;
    }

    if (an !== null && bn === null) {
      return -1;
    }

    if (an === null && bn !== null) {
      return 1;
    }

    return a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });
}

/* -----------------------------
   LAN detection
------------------------------ */

function normalizeIp(ip = "") {
  if (ip.startsWith("::ffff:")) {
    return ip.slice(7);
  }

  if (ip === "::1") {
    return "127.0.0.1";
  }

  return ip;
}

function isPrivateIpv4(ip) {
  const parts = ip.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      (part) =>
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255
    )
  ) {
    return false;
  }

  const [a, b] = parts;

  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isAllowedNetwork(req) {
  const remoteAddress =
    req.socket?.remoteAddress ||
    req.ip ||
    "";

  return isPrivateIpv4(normalizeIp(remoteAddress));
}

function getLanIps() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const network of interfaces[name] || []) {
      if (
        network.family === "IPv4" &&
        !network.internal &&
        isPrivateIpv4(network.address)
      ) {
        addresses.push(network.address);
      }
    }
  }

  return [...new Set(addresses)];
}

/* -----------------------------
   Optional password authentication
------------------------------ */

function parseCookies(header = "") {
  const cookies = {};

  for (const part of header.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");

    if (!key) {
      continue;
    }

    try {
      cookies[key] = decodeURIComponent(
        valueParts.join("=") || ""
      );
    } catch {
      cookies[key] = "";
    }
  }

  return cookies;
}

function isAuthed(req) {
  if (!ACCESS_PASSWORD) {
    return true;
  }

  const cookies = parseCookies(
    req.headers.cookie || ""
  );

  return cookies.mr_auth === ACCESS_PASSWORD;
}

app.use((req, res, next) => {
  /*
    In --share mode, reject requests that are not from
    localhost or a private local-network address.
  */
  if (SHARE_MODE && !isAllowedNetwork(req)) {
    return res
      .status(403)
      .send("Local network access only.");
  }

  if (
    req.path === "/login" ||
    req.path === "/logout"
  ) {
    return next();
  }

  /*
    No MANGA_PASSWORD:
    no login required.

    MANGA_PASSWORD set:
    password required.
  */
  if (
    ACCESS_PASSWORD &&
    !isAuthed(req)
  ) {
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({
        error: "auth_required"
      });
    }

    return res.redirect("/login");
  }

  next();
});

/* -----------------------------
   Login
------------------------------ */

app.get("/login", (req, res) => {
  if (!ACCESS_PASSWORD) {
    return res.redirect("/");
  }

  res.type("html").send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  />
  <title>Login</title>

  <style>
    body {
      font-family: system-ui, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      background: #fafafa;
    }

    .card {
      max-width: 420px;
      margin: 0 auto;
      padding: 18px;
      background: white;
      border: 1px solid #eeeeee;
      border-radius: 14px;
    }

    input {
      box-sizing: border-box;
      width: 100%;
      padding: 12px;
      border: 1px solid #e9e9e9;
      border-radius: 10px;
      font-size: 16px;
    }

    button {
      margin-top: 12px;
      padding: 10px 14px;
      border: 1px solid #eeeeee;
      border-radius: 10px;
      background: white;
      font-size: 16px;
      cursor: pointer;
    }

    .muted {
      margin-top: 8px;
      color: #666666;
      font-size: 14px;
    }
  </style>
</head>

<body>
  <div class="card">
    <div
      style="
        margin-bottom: 10px;
        font-size: 18px;
        font-weight: 700;
      "
    >
      Local Manga Reader
    </div>

    <form method="POST" action="/login">
      <input
        type="password"
        name="pw"
        placeholder="Password"
        autocomplete="current-password"
        autofocus
      />

      <button type="submit">
        Enter
      </button>
    </form>

    <div class="muted">
      Enter the password configured on the laptop.
    </div>
  </div>
</body>
</html>
  `);
});

app.post("/login", (req, res) => {
  if (!ACCESS_PASSWORD) {
    return res.redirect("/");
  }

  const suppliedPassword = String(
    req.body?.pw || ""
  );

  if (suppliedPassword !== ACCESS_PASSWORD) {
    return res
      .status(401)
      .send("Wrong password.");
  }

  res.setHeader(
    "Set-Cookie",
    `mr_auth=${encodeURIComponent(
      ACCESS_PASSWORD
    )}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`
  );

  res.redirect("/");
});

app.get("/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    "mr_auth=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"
  );

  res.redirect(
    ACCESS_PASSWORD
      ? "/login"
      : "/"
  );
});

/* -----------------------------
   Static frontend
------------------------------ */

app.use(
  express.static(
    path.join(__dirname, "public"),
    {
      index: "library.html"
    }
  )
);

/* -----------------------------
   Server information
------------------------------ */

app.get("/api/server-info", (req, res) => {
  const urls = SHARE_MODE
    ? getLanIps().map(
        (ip) => `http://${ip}:${PORT}`
      )
    : [`http://localhost:${PORT}`];

  res.json({
    port: PORT,
    sharing: SHARE_MODE,
    passwordRequired: Boolean(ACCESS_PASSWORD),
    urls
  });
});

/* -----------------------------
   Preferences
------------------------------ */

const DATA_DIR = path.join(
  __dirname,
  "data"
);

const STATE_PATH = path.join(
  DATA_DIR,
  "state.json"
);

const DEFAULT_STATE = {
  version: 1,
  mode: "vertical",
  lastChapterByManga: {},
  lastOpened: {
    manga: "",
    chapter: "",
    at: ""
  },
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
      fs.writeFileSync(
        STATE_PATH,
        JSON.stringify(
          DEFAULT_STATE,
          null,
          2
        ),
        "utf8"
      );

      return {
        ...DEFAULT_STATE
      };
    }

    const raw = fs.readFileSync(
      STATE_PATH,
      "utf8"
    );

    if (!raw.trim()) {
      return {
        ...DEFAULT_STATE
      };
    }

    const obj = JSON.parse(raw);

    return {
      version: 1,

      mode:
        obj.mode === "horizontal"
          ? "horizontal"
          : "vertical",

      lastChapterByManga:
        obj.lastChapterByManga &&
        typeof obj.lastChapterByManga === "object"
          ? obj.lastChapterByManga
          : {},

      lastOpened:
        obj.lastOpened &&
        typeof obj.lastOpened === "object"
          ? {
              manga:
                typeof obj.lastOpened.manga === "string"
                  ? obj.lastOpened.manga
                  : "",

              chapter:
                typeof obj.lastOpened.chapter === "string"
                  ? obj.lastOpened.chapter
                  : "",

              at:
                typeof obj.lastOpened.at === "string"
                  ? obj.lastOpened.at
                  : ""
            }
          : {
              manga: "",
              chapter: "",
              at: ""
            },

      settings:
        obj.settings &&
        typeof obj.settings === "object"
          ? {
              librarySort:
                obj.settings.librarySort === "lastOpened"
                  ? "lastOpened"
                  : "name",

              showDownloadSides:
                Boolean(
                  obj.settings.showDownloadSides
                ),

              downloadFormat:
                obj.settings.downloadFormat === "jpg"
                  ? "jpg"
                  : "png",

              jpgQuality:
                typeof obj.settings.jpgQuality === "number" &&
                obj.settings.jpgQuality >= 0.1 &&
                obj.settings.jpgQuality <= 1
                  ? obj.settings.jpgQuality
                  : 0.9
            }
          : {
              ...DEFAULT_STATE.settings
            }
    };
  } catch {
    return {
      ...DEFAULT_STATE
    };
  }
}

function writeState(state) {
  ensureDir(DATA_DIR);

  const temporaryPath =
    STATE_PATH + ".tmp";

  fs.writeFileSync(
    temporaryPath,
    JSON.stringify(
      state,
      null,
      2
    ),
    "utf8"
  );

  fs.copyFileSync(
    temporaryPath,
    STATE_PATH
  );

  try {
    fs.unlinkSync(temporaryPath);
  } catch {}
}

app.get("/api/prefs", (req, res) => {
  res.json(readState());
});

app.post("/api/prefs", (req, res) => {
  const patch = req.body || {};
  const state = readState();

  if (
    patch.mode === "horizontal" ||
    patch.mode === "vertical"
  ) {
    state.mode = patch.mode;
  }

  if (
    patch.lastChapterByManga &&
    typeof patch.lastChapterByManga === "object"
  ) {
    state.lastChapterByManga =
      patch.lastChapterByManga;
  }

  if (
    patch.lastOpened &&
    typeof patch.lastOpened === "object"
  ) {
    state.lastOpened = {
      manga:
        typeof patch.lastOpened.manga === "string"
          ? patch.lastOpened.manga
          : state.lastOpened.manga,

      chapter:
        typeof patch.lastOpened.chapter === "string"
          ? patch.lastOpened.chapter
          : state.lastOpened.chapter,

      at:
        typeof patch.lastOpened.at === "string"
          ? patch.lastOpened.at
          : state.lastOpened.at
    };
  }

  if (
    patch.settings &&
    typeof patch.settings === "object"
  ) {
    state.settings =
      state.settings &&
      typeof state.settings === "object"
        ? state.settings
        : {
            ...DEFAULT_STATE.settings
          };

    if (
      patch.settings.librarySort === "name" ||
      patch.settings.librarySort === "lastOpened"
    ) {
      state.settings.librarySort =
        patch.settings.librarySort;
    }

    if (
      typeof patch.settings.showDownloadSides ===
      "boolean"
    ) {
      state.settings.showDownloadSides =
        patch.settings.showDownloadSides;
    }

    if (
      patch.settings.downloadFormat === "png" ||
      patch.settings.downloadFormat === "jpg"
    ) {
      state.settings.downloadFormat =
        patch.settings.downloadFormat;
    }

    if (
      typeof patch.settings.jpgQuality === "number"
    ) {
      const quality =
        patch.settings.jpgQuality;

      if (
        quality >= 0.1 &&
        quality <= 1
      ) {
        state.settings.jpgQuality =
          quality;
      }
    }
  }

  writeState(state);

  res.json({
    ok: true
  });
});

/* -----------------------------
   Library APIs
------------------------------ */

app.get("/api/manga", (req, res) => {
  if (!isDir(LIBRARY_ROOT)) {
    return res.json([]);
  }

  const manga = fs
    .readdirSync(LIBRARY_ROOT)
    .filter((name) =>
      isDir(
        path.join(
          LIBRARY_ROOT,
          name
        )
      )
    )
    .sort((a, b) =>
      a.localeCompare(
        b,
        undefined,
        {
          numeric: true,
          sensitivity: "base"
        }
      )
    );

  res.json(manga);
});

app.get("/api/chapters", (req, res) => {
  const { manga } = req.query;

  if (!manga) {
    return res.status(400).json({
      error: "manga is required"
    });
  }

  let mangaPath;

  try {
    mangaPath = safeJoin(
      LIBRARY_ROOT,
      manga
    );
  } catch {
    return res.status(400).json({
      error: "bad manga path"
    });
  }

  if (!isDir(mangaPath)) {
    return res.status(404).json({
      error: "not found"
    });
  }

  const chapters = fs
    .readdirSync(mangaPath)
    .filter((name) =>
      isDir(
        path.join(
          mangaPath,
          name
        )
      )
    )
    .sort((a, b) =>
      a.localeCompare(
        b,
        undefined,
        {
          numeric: true,
          sensitivity: "base"
        }
      )
    );

  res.json(chapters);
});

app.get("/api/pages", (req, res) => {
  const {
    manga,
    chapter
  } = req.query;

  if (!manga || !chapter) {
    return res.status(400).json({
      error: "manga and chapter are required"
    });
  }

  let chapterPath;

  try {
    chapterPath = safeJoin(
      LIBRARY_ROOT,
      manga,
      chapter
    );
  } catch {
    return res.status(400).json({
      error: "bad path"
    });
  }

  if (!isDir(chapterPath)) {
    return res.status(404).json({
      error: "not found"
    });
  }

  const pages = fs
    .readdirSync(chapterPath)
    .filter((name) => {
      const pagePath = path.join(
        chapterPath,
        name
      );

      return (
        isFile(pagePath) &&
        IMAGE_EXTS.has(
          path.extname(name).toLowerCase()
        )
      );
    });

  res.json(
    sortPages(pages)
  );
});

app.get("/img", (req, res) => {
  const {
    manga,
    chapter,
    file
  } = req.query;

  if (!manga || !chapter || !file) {
    return res
      .status(400)
      .send("missing params");
  }

  let filePath;

  try {
    filePath = safeJoin(
      LIBRARY_ROOT,
      manga,
      chapter,
      file
    );
  } catch {
    return res
      .status(400)
      .send("bad path");
  }

  if (!isFile(filePath)) {
    return res
      .status(404)
      .send("not found");
  }

  res.type(filePath);

  fs.createReadStream(filePath).pipe(res);
});

app.get("/placeholder.jpg", (req, res) => {
  const placeholderPath = path.join(
    __dirname,
    "placeholder.jpg"
  );

  if (!isFile(placeholderPath)) {
    return res
      .status(404)
      .send(
        "placeholder.jpg not found next to server.js"
      );
  }

  res.type(placeholderPath);

  fs.createReadStream(
    placeholderPath
  ).pipe(res);
});

app.get("/cover", (req, res) => {
  const { manga } = req.query;

  if (!manga) {
    return res
      .status(400)
      .send("missing manga");
  }

  let folder;

  try {
    folder = safeJoin(
      LIBRARY_ROOT,
      manga
    );
  } catch {
    return res
      .status(400)
      .send("bad path");
  }

  let coverPath = null;

  for (const extension of COVER_EXTS) {
    const candidate = path.join(
      folder,
      "cover" + extension
    );

    if (isFile(candidate)) {
      coverPath = candidate;
      break;
    }
  }

  const fallback = path.join(
    __dirname,
    "public",
    "cover-placeholder.png"
  );

  const fileToSend =
    coverPath ?? fallback;

  if (!isFile(fileToSend)) {
    return res
      .status(404)
      .send("no cover + no fallback");
  }

  res.type(fileToSend);

  fs.createReadStream(
    fileToSend
  ).pipe(res);
});

app.post("/api/cover", (req, res) => {
  const {
    manga,
    filename,
    data
  } = req.body || {};

  if (
    !manga ||
    !filename ||
    !data
  ) {
    return res.status(400).json({
      error: "missing fields"
    });
  }

  let folder;

  try {
    folder = safeJoin(
      LIBRARY_ROOT,
      manga
    );
  } catch {
    return res.status(400).json({
      error: "bad path"
    });
  }

  if (!isDir(folder)) {
    return res.status(404).json({
      error: "manga not found"
    });
  }

  const extension = path
    .extname(filename)
    .toLowerCase();

  if (!IMAGE_EXTS.has(extension)) {
    return res.status(400).json({
      error: "unsupported file type"
    });
  }

  const base64 = String(data).replace(
    /^data:.*;base64,/,
    ""
  );

  const buffer = Buffer.from(
    base64,
    "base64"
  );

  try {
    fs.writeFileSync(
      path.join(
        folder,
        "cover" + extension
      ),
      buffer
    );

    res.json({
      ok: true
    });
  } catch {
    res.status(500).json({
      error: "failed to save file"
    });
  }
});

/* -----------------------------
   Upload setup
------------------------------ */

const UPLOAD_DIR = path.join(
  __dirname,
  "data",
  "_uploads"
);

ensureDir(UPLOAD_DIR);

const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: 1024 * 1024 * 1024
  }
});

/* -----------------------------
   Add Manga
------------------------------ */

app.post(
  "/api/manga/create",
  upload.single("cover"),
  (req, res) => {
    try {
      ensureDir(LIBRARY_ROOT);

      const rawName =
        fixMultipartFilename(
          req.body?.name
        );

      const name =
        sanitizeName(rawName);

      if (!name) {
        return res.status(400).json({
          error: "name is required"
        });
      }

      const folderName =
        uniqueFolder(
          LIBRARY_ROOT,
          name
        );

      const mangaPath = path.join(
        LIBRARY_ROOT,
        folderName
      );

      fs.mkdirSync(
        mangaPath,
        {
          recursive: true
        }
      );

      if (req.file) {
        const originalName =
          fixMultipartFilename(
            req.file.originalname
          );

        const extension = path
          .extname(originalName)
          .toLowerCase();

        if (
          IMAGE_EXTS.has(extension)
        ) {
          fs.copyFileSync(
            req.file.path,
            path.join(
              mangaPath,
              "cover" + extension
            )
          );
        }

        try {
          fs.unlinkSync(
            req.file.path
          );
        } catch {}
      }

      res.json({
        ok: true,
        manga: folderName
      });
    } catch {
      res.status(500).json({
        error: "failed to create manga"
      });
    }
  }
);

/* -----------------------------
   Archive extraction
------------------------------ */

function extractZip(
  zipPath,
  destinationDirectory
) {
  return new Promise(
    (resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(
          unzipper.Extract({
            path: destinationDirectory
          })
        )
        .on("close", resolve)
        .on("error", reject);
    }
  );
}

function extractRar(
  rarPath,
  destinationDirectory
) {
  const buffer =
    fs.readFileSync(rarPath);

  const extractor =
    createExtractorFromData({
      data: new Uint8Array(buffer)
    });

  const list =
    extractor.getFileList();

  if (
    list[0]?.state !== "SUCCESS"
  ) {
    throw new Error(
      "RAR list failed"
    );
  }

  const files =
    list[1].fileHeaders
      .filter(
        (header) =>
          !header.flags.directory
      )
      .map(
        (header) =>
          header.name
      );

  const extracted =
    extractor.extract({
      files
    });

  if (
    extracted[0]?.state !==
    "SUCCESS"
  ) {
    throw new Error(
      "RAR extract failed"
    );
  }

  for (
    const extractedFile of
    extracted[1].files
  ) {
    const relativePath =
      extractedFile.fileHeader.name.replace(
        /\\/g,
        "/"
      );

    const outputPath =
      safeJoin(
        destinationDirectory,
        relativePath
      );

    ensureDir(
      path.dirname(outputPath)
    );

    fs.writeFileSync(
      outputPath,
      Buffer.from(
        extractedFile.extraction
      )
    );
  }
}

/* -----------------------------
   Upload chapters
------------------------------ */

app.post(
  "/api/chapters/upload",
  upload.array("archives", 50),
  async (req, res) => {
    try {
      const manga =
        sanitizeName(
          req.query.manga
        );

      if (!manga) {
        return res.status(400).json({
          error: "manga is required"
        });
      }

      const mangaPath =
        safeJoin(
          LIBRARY_ROOT,
          manga
        );

      if (!isDir(mangaPath)) {
        return res.status(404).json({
          error: "manga not found"
        });
      }

      const files =
        req.files || [];

      if (
        files.length === 0
      ) {
        return res.status(400).json({
          error: "no files uploaded"
        });
      }

      const created = [];

      for (
        const uploadedFile of files
      ) {
        const originalName =
          fixMultipartFilename(
            uploadedFile.originalname
          );

        const extension = path
          .extname(originalName)
          .toLowerCase();

        if (
          extension !== ".zip" &&
          extension !== ".rar" &&
          extension !== ".cbz"
        ) {
          try {
            fs.unlinkSync(
              uploadedFile.path
            );
          } catch {}

          continue;
        }

        const baseName =
          sanitizeName(
            path.basename(
              originalName,
              extension
            )
          );

        const chapterFolder =
          uniqueFolder(
            mangaPath,
            baseName || "chapter"
          );

        const destination =
          safeJoin(
            mangaPath,
            chapterFolder
          );

        fs.mkdirSync(
          destination,
          {
            recursive: true
          }
        );

        if (
          extension === ".zip" ||
          extension === ".cbz"
        ) {
          await extractZip(
            uploadedFile.path,
            destination
          );
        } else {
          extractRar(
            uploadedFile.path,
            destination
          );
        }

        created.push(
          chapterFolder
        );

        try {
          fs.unlinkSync(
            uploadedFile.path
          );
        } catch {}
      }

      res.json({
        ok: true,
        created
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "failed to upload/extract"
      });
    }
  }
);

/* -----------------------------
   Start server
------------------------------ */

app.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `Manga reader running at http://localhost:${PORT}`
    );

    if (SHARE_MODE) {
      const urls =
        getLanIps().map(
          (ip) => `http://${ip}:${PORT}`
        );

      console.log("Wi-Fi sharing: ON");

      console.log(
        "LAN URLs:",
        urls.length
          ? urls.join(" , ")
          : "No local-network address detected"
      );
    } else {
      console.log("Wi-Fi sharing: OFF");
      console.log("Laptop-only mode");
    }

    console.log(
      "Password required:",
      ACCESS_PASSWORD
        ? "YES"
        : "NO"
    );
  }
);