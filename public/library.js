const grid = document.getElementById("libraryGrid");
const continueTop = document.getElementById("continueTop");

let lastChapterByManga = {};

async function apiJson(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.json();
}

function coverUrl(manga) {
  return `/cover?manga=${encodeURIComponent(manga)}&t=${Date.now()}`;
}

function uploadCover(manga, file, imgEl) {
  const reader = new FileReader();
  reader.onload = async () => {
    await apiJson("/api/cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manga, filename: file.name, data: reader.result })
    });
    imgEl.src = coverUrl(manga);
  };
  reader.readAsDataURL(file);
}

function makeCard(manga) {
  const card = document.createElement("div");
  card.className = "mangaCard";

  const link = document.createElement("a");
  link.href = `/manga.html?manga=${encodeURIComponent(manga)}`;
  link.className = "cardLink";

  const img = document.createElement("img");
  img.className = "mangaCover";
  img.src = coverUrl(manga);
  img.alt = manga;
  img.loading = "lazy";
  img.onerror = () => (img.src = "/cover-placeholder.png");

  const name = document.createElement("div");
  name.className = "mangaName";
  name.textContent = manga;

  link.appendChild(img);
  link.appendChild(name);
  card.appendChild(link);

  const last = lastChapterByManga?.[manga];
  if (last) {
    const cont = document.createElement("a");
    cont.href = `/index.html?manga=${encodeURIComponent(manga)}&chapter=${encodeURIComponent(last)}`;
    cont.className = "continueOverlay";
    cont.textContent = "Continue Reading";
    card.appendChild(cont);
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.className = "hiddenInput";
  input.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) uploadCover(manga, f, img);
  });

  const editBtn = document.createElement("button");
  editBtn.className = "editCoverBtn";
  editBtn.textContent = "Change Cover";
  editBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.click();
  });

  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    card.classList.add("dragging");
  });
  card.addEventListener("dragleave", () => card.classList.remove("dragging"));
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    card.classList.remove("dragging");
    const f = e.dataTransfer.files?.[0];
    if (f) uploadCover(manga, f, img);
  });

  card.appendChild(editBtn);
  card.appendChild(input);

  return card;
}

/* -----------------------------
   Add Manga dialog logic
------------------------------ */
const addMangaBtn = document.getElementById("addMangaBtn");
const addMangaDialog = document.getElementById("addMangaDialog");

const addMangaName = document.getElementById("addMangaName");
const addMangaCover = document.getElementById("addMangaCover");
const addMangaCoverLabel = document.getElementById("addMangaCoverLabel");

const addMangaDrop = document.getElementById("addMangaDrop");
const addMangaChoose = document.getElementById("addMangaChoose");
const addMangaMsg = document.getElementById("addMangaMsg");

const addMangaCancel = document.getElementById("addMangaCancel");
const addMangaCreate = document.getElementById("addMangaCreate");

let coverFile = null;

function setCoverFile(file) {
  coverFile = file || null;
  addMangaCoverLabel.textContent = coverFile ? coverFile.name : "No file selected";
}

function resetAddManga() {
  addMangaMsg.textContent = "";
  addMangaName.value = "";
  setCoverFile(null);
  if (addMangaCover) addMangaCover.value = "";
}

if (addMangaBtn && addMangaDialog) {
  addMangaBtn.addEventListener("click", () => {
    resetAddManga();
    addMangaDialog.showModal();
  });
}

if (addMangaChoose && addMangaCover) {
  addMangaChoose.addEventListener("click", () => addMangaCover.click());
  addMangaCover.addEventListener("change", () => {
    const f = addMangaCover.files?.[0];
    if (f) setCoverFile(f);
  });
}

if (addMangaDrop) {
  addMangaDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    addMangaDrop.classList.add("dragover");
  });
  addMangaDrop.addEventListener("dragleave", () => addMangaDrop.classList.remove("dragover"));
  addMangaDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    addMangaDrop.classList.remove("dragover");
    const f = e.dataTransfer.files?.[0];
    if (f) setCoverFile(f);
  });
}

if (addMangaCancel && addMangaDialog) {
  addMangaCancel.addEventListener("click", () => addMangaDialog.close());
}

if (addMangaCreate && addMangaDialog) {
  addMangaCreate.addEventListener("click", async () => {
    const name = addMangaName.value.trim();
    if (!name) {
      addMangaMsg.textContent = "Name is required.";
      return;
    }

    addMangaMsg.textContent = "Creating…";

    const fd = new FormData();
    fd.append("name", name);
    if (coverFile) fd.append("cover", coverFile);

    const r = await fetch("/api/manga/create", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      addMangaMsg.textContent = j.error || "Failed.";
      return;
    }

    addMangaDialog.close();
    location.reload();
  });
}

/* -----------------------------
   Init library
------------------------------ */
(async function init() {
  const prefs = await apiJson("/api/prefs");
  lastChapterByManga = prefs.lastChapterByManga || {};

  if (continueTop) {
    const lo = prefs.lastOpened;
    if (lo && lo.manga && lo.chapter) {
      continueTop.classList.remove("hidden");
      continueTop.href = `/index.html?manga=${encodeURIComponent(lo.manga)}&chapter=${encodeURIComponent(lo.chapter)}`;
      continueTop.textContent = `Continue Reading: ${lo.manga} — ${lo.chapter}`;
    } else {
      continueTop.classList.add("hidden");
    }
  }

  const mangas = await apiJson("/api/manga");
  grid.innerHTML = "";
  mangas.forEach((m) => grid.appendChild(makeCard(m)));
})();