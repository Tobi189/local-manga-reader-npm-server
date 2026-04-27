const params = new URLSearchParams(location.search);
const manga = params.get("manga");

const coverImg = document.getElementById("mangaCover");
const titleEl = document.getElementById("mangaTitle");
const chapterList = document.getElementById("chapterList");
const continueWrap = document.getElementById("continueWrap");

if (!manga) location.href = "/library.html";

async function apiJson(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.json();
}

function readerUrl(chapter) {
  return `/index.html?manga=${encodeURIComponent(manga)}&chapter=${encodeURIComponent(chapter)}`;
}

/* -----------------------------
   Add Chapter(s) dialog
------------------------------ */
const addChaptersBtn = document.getElementById("addChaptersBtn");
const addChaptersDialog = document.getElementById("addChaptersDialog");

const chaptersDrop = document.getElementById("chaptersDrop");
const chapterArchives = document.getElementById("chapterArchives");
const chooseArchivesBtn = document.getElementById("chooseArchivesBtn");
const archivesLabel = document.getElementById("archivesLabel");

const archiveNames = document.getElementById("archiveNames");
const archiveList = document.getElementById("archiveList");

const addChaptersMsg = document.getElementById("addChaptersMsg");
const addChaptersCancel = document.getElementById("addChaptersCancel");
const uploadChaptersSave = document.getElementById("uploadChaptersSave");

let selectedArchives = [];

function renderArchiveNames() {
  if (!selectedArchives.length) {
    archivesLabel.textContent = "No files selected";
    archiveNames.classList.add("hidden");
    archiveList.innerHTML = "";
    return;
  }

  archivesLabel.textContent = `${selectedArchives.length} file(s) selected`;
  archiveNames.classList.remove("hidden");

  archiveList.innerHTML = "";
  for (const f of selectedArchives) {
    const li = document.createElement("li");
    li.textContent = f.name;
    archiveList.appendChild(li);
  }
}

function setArchivesFromFileList(fileList) {
  selectedArchives = fileList ? Array.from(fileList) : [];
  renderArchiveNames();
}

function resetAddChapters() {
  addChaptersMsg.textContent = "";
  selectedArchives = [];
  if (chapterArchives) chapterArchives.value = "";
  renderArchiveNames();
}

if (addChaptersBtn && addChaptersDialog) {
  addChaptersBtn.addEventListener("click", () => {
    resetAddChapters();
    addChaptersDialog.showModal();
  });
}

if (chooseArchivesBtn && chapterArchives) {
  chooseArchivesBtn.addEventListener("click", () => chapterArchives.click());
  chapterArchives.addEventListener("change", () => setArchivesFromFileList(chapterArchives.files));
}

if (chaptersDrop) {
  chaptersDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    chaptersDrop.classList.add("dragover");
  });
  chaptersDrop.addEventListener("dragleave", () => chaptersDrop.classList.remove("dragover"));
  chaptersDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    chaptersDrop.classList.remove("dragover");
    setArchivesFromFileList(e.dataTransfer.files);
  });
}

if (addChaptersCancel && addChaptersDialog) {
  addChaptersCancel.addEventListener("click", () => addChaptersDialog.close());
}

if (uploadChaptersSave) {
  uploadChaptersSave.addEventListener("click", async () => {
    if (!selectedArchives.length) {
      addChaptersMsg.textContent = "Choose at least one archive.";
      return;
    }

    addChaptersMsg.textContent = "Uploading & extracting…";

    const fd = new FormData();
    for (const f of selectedArchives) fd.append("archives", f);

    const r = await fetch(`/api/chapters/upload?manga=${encodeURIComponent(manga)}`, {
      method: "POST",
      body: fd
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      addChaptersMsg.textContent = j.error || "Failed.";
      return;
    }

    addChaptersDialog.close();
    location.reload();
  });
}

/* -----------------------------
   Page init
------------------------------ */
(async function init() {
  titleEl.textContent = manga;
  coverImg.src = `/cover?manga=${encodeURIComponent(manga)}&t=${Date.now()}`;

  const chapters = await apiJson(`/api/chapters?manga=${encodeURIComponent(manga)}`);
  const prefs = await apiJson("/api/prefs");
  const last = prefs.lastChapterByManga?.[manga];

  continueWrap.innerHTML = "";
  if (last && chapters.includes(last)) {
    const btn = document.createElement("a");
    btn.href = readerUrl(last);
    btn.className = "continueBtn";
    btn.textContent = `Continue Reading (${last})`;
    continueWrap.appendChild(btn);
  }

  chapterList.innerHTML = "";
  [...chapters].reverse().forEach((ch) => {
    const a = document.createElement("a");
    a.href = readerUrl(ch);
    a.className = "chapterItem";
    a.textContent = ch;
    chapterList.appendChild(a);
  });
})();