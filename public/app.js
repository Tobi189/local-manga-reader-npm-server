const el = (id) => document.getElementById(id);

const mangaSel = el("manga");
const chapterSel = el("chapter");
const modeSel = el("mode");

const prevChapterBtn = el("prevChapter");
const nextChapterBtn = el("nextChapter");

const pagesDiv = el("pages");
const pageInfo = el("pageInfo");

const downloadSpreadBtn = el("downloadSpread");
const navLeft = el("navLeft");
const navRight = el("navRight");
const btnLeft = el("btnLeft");   // forward (RTL)
const btnRight = el("btnRight"); // back (RTL)

const pageIndicator = el("pageIndicator");
const backBtn = el("backToManga");
const chapterToast = el("chapterToast");

const PLACEHOLDER_URL = "/placeholder.jpg";

let prefs = null;        // global shared prefs loaded from server
let chapters = [];
let pages = [];
let spreadIndex = 0;
let toastTimer = null;

function waitImageLoaded(img) {
  return new Promise((resolve, reject) => {
    if (!img) return reject(new Error("No image element"));
    if (img.complete && img.naturalWidth > 0) return resolve();
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => reject(new Error("Image failed to load")), { once: true });
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(s) {
  return String(s).replace(/[\\/:*?"<>|]+/g, "_").trim();
}

async function downloadCurrentSpread() {
  if (modeSel.value !== "horizontal") return;

  const frame = pagesDiv.querySelector(".spreadFrame");
  if (!frame) return;

  const imgs = frame.querySelectorAll("img");
  if (imgs.length !== 2) return;

  const leftImgEl = imgs[0];
  const rightImgEl = imgs[1];

  // Ensure they are loaded (or placeholder)
  await Promise.allSettled([waitImageLoaded(leftImgEl), waitImageLoaded(rightImgEl)]);

  // Use natural sizes. If placeholder is used, it still has a natural size.
  const lw = leftImgEl.naturalWidth || 1;
  const lh = leftImgEl.naturalHeight || 1;
  const rw = rightImgEl.naturalWidth || 1;
  const rh = rightImgEl.naturalHeight || 1;

  // Combine side-by-side (left then right, matching what you see)
  const outW = lw + rw;
  const outH = Math.max(lh, rh);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");

  // White background (so transparent PNGs look nice)
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, outW, outH);

  // Center vertically if heights differ
  const ly = Math.floor((outH - lh) / 2);
  const ry = Math.floor((outH - rh) / 2);

  ctx.drawImage(leftImgEl, 0, ly, lw, lh);
  ctx.drawImage(rightImgEl, lw, ry, rw, rh);

  const manga = sanitizeFilename(mangaSel.value);
  const chapter = sanitizeFilename(chapterSel.value);
  const spreadNum = spreadIndex + 1;

  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `${manga}__${chapter}__spread-${spreadNum}.png`);
  }, "image/png");
}

async function apiJson(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.json();
}

async function loadPrefs() {
  return await apiJson("/api/prefs");
}

async function savePrefs(next) {
  prefs = next;
  await apiJson("/api/prefs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next)
  });
}

function imgUrl(manga, chapter, file) {
  return `/img?manga=${encodeURIComponent(manga)}&chapter=${encodeURIComponent(chapter)}&file=${encodeURIComponent(file)}`;
}

function setNavVisible(on) {
  navLeft.classList.toggle("hidden", !on);
  navRight.classList.toggle("hidden", !on);
}

function showToast(text) {
  chapterToast.textContent = text;
  chapterToast.classList.remove("hidden");
  chapterToast.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    chapterToast.classList.remove("show");
    setTimeout(() => chapterToast.classList.add("hidden"), 250);
  }, 1600);
}

function updateBackLink() {
  const manga = mangaSel.value;
  backBtn.href = manga ? `/manga.html?manga=${encodeURIComponent(manga)}` : "/library.html";
}

function totalSpreads() {
  if (pages.length === 0) return 0;
  if (pages.length === 1) return 1;
  return 1 + Math.ceil((pages.length - 1) / 2);
}

function spreadSources(si) {
  const manga = mangaSel.value;
  const chapter = chapterSel.value;

  if (pages.length === 0) return [PLACEHOLDER_URL, PLACEHOLDER_URL];
  if (si === 0) return [imgUrl(manga, chapter, pages[0]), PLACEHOLDER_URL];

  const start = 1 + (si - 1) * 2;
  const rightIdx = start;
  const leftIdx = start + 1;

  if (rightIdx < pages.length && leftIdx >= pages.length) {
    return [PLACEHOLDER_URL, imgUrl(manga, chapter, pages[rightIdx])];
  }

  const left = leftIdx < pages.length ? imgUrl(manga, chapter, pages[leftIdx]) : PLACEHOLDER_URL;
  const right = rightIdx < pages.length ? imgUrl(manga, chapter, pages[rightIdx]) : PLACEHOLDER_URL;
  return [left, right];
}

function spreadPageNumbers(si) {
  if (pages.length === 0) return [];
  if (si === 0) return [1];

  const start = 1 + (si - 1) * 2;
  const rightIdx = start;
  const leftIdx = start + 1;

  if (rightIdx >= pages.length) return [];
  if (leftIdx >= pages.length) return [rightIdx + 1];
  return [rightIdx + 1, leftIdx + 1];
}

function updateIndicators() {
  if (modeSel.value !== "horizontal" || pages.length === 0) {
    pageInfo.textContent = "";
    pageIndicator.classList.add("hidden");
    pageIndicator.textContent = "";
    return;
  }

  if (downloadSpreadBtn) {
  downloadSpreadBtn.classList.toggle("hidden", modeSel.value !== "horizontal" || pages.length === 0);
}

  const t = totalSpreads();
  pageInfo.textContent = `Spread ${spreadIndex + 1}/${t} (RTL)`;

  const nums = spreadPageNumbers(spreadIndex);
  pageIndicator.classList.remove("hidden");
  pageIndicator.textContent =
    nums.length === 1
      ? `Page ${nums[0]} / ${pages.length}`
      : `Pages ${nums[0]}–${nums[1]} / ${pages.length}`;
}

function renderVertical() {
  pagesDiv.className = "vertical";
  pagesDiv.innerHTML = "";
  setNavVisible(false);

  const manga = mangaSel.value;
  const chapter = chapterSel.value;

  for (const file of pages) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = imgUrl(manga, chapter, file);
    pagesDiv.appendChild(img);
  }

  updateIndicators();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderHorizontal() {
  pagesDiv.className = "horizontal";
  pagesDiv.innerHTML = "";
  setNavVisible(true);

  const frame = document.createElement("div");
  frame.className = "spreadFrame";

  const leftSlot = document.createElement("div");
  leftSlot.className = "pageSlot leftSlot";

  const rightSlot = document.createElement("div");
  rightSlot.className = "pageSlot rightSlot";

  const [leftSrc, rightSrc] = spreadSources(spreadIndex);

  const leftImg = document.createElement("img");
  leftImg.loading = "lazy";
  leftImg.src = leftSrc;

  const rightImg = document.createElement("img");
  rightImg.loading = "lazy";
  rightImg.src = rightSrc;

  leftSlot.appendChild(leftImg);
  rightSlot.appendChild(rightImg);

  frame.appendChild(leftSlot);
  frame.appendChild(rightSlot);
  pagesDiv.appendChild(frame);

  updateIndicators();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function render() {
  const t = totalSpreads();
  if (spreadIndex < 0) spreadIndex = 0;
  if (t > 0 && spreadIndex > t - 1) spreadIndex = t - 1;

  if (modeSel.value === "vertical") renderVertical();
  else renderHorizontal();
}

async function loadMangaList() {
  const all = await apiJson("/api/manga");
  mangaSel.innerHTML = all.map((x) => `<option>${x}</option>`).join("");

  const qs = new URLSearchParams(location.search);
  const mangaFromUrl = qs.get("manga");

  if (mangaFromUrl && all.includes(mangaFromUrl)) mangaSel.value = mangaFromUrl;
  else if (prefs?.manga && all.includes(prefs.manga)) mangaSel.value = prefs.manga;
  else if (all.length) mangaSel.value = all[0];

  updateBackLink();
  await loadChapters();
}

async function loadChapters() {
  const manga = mangaSel.value;
  chapters = await apiJson(`/api/chapters?manga=${encodeURIComponent(manga)}`);
  chapterSel.innerHTML = chapters.map((x) => `<option>${x}</option>`).join("");

  const qs = new URLSearchParams(location.search);
  const chapterFromUrl = qs.get("chapter");

  const remembered =
    chapterFromUrl ||
    prefs?.lastChapterByManga?.[manga] ||
    prefs?.chapter;

  if (remembered && chapters.includes(remembered)) chapterSel.value = remembered;
  else if (chapters.length) chapterSel.value = chapters[0];

  await loadPages();
}

async function loadPages() {
  const manga = mangaSel.value;
  const chapter = chapterSel.value;

  // ✅ update global shared state in JSON
  const lastChapterByManga = { ...(prefs?.lastChapterByManga || {}) };
  lastChapterByManga[manga] = chapter;

  await savePrefs({
  mode: modeSel.value === "horizontal" ? "horizontal" : "vertical",
  manga,
  chapter,
  lastChapterByManga,
  lastOpened: { manga, chapter, at: new Date().toISOString() }
});

  pages = await apiJson(`/api/pages?manga=${encodeURIComponent(manga)}&chapter=${encodeURIComponent(chapter)}`);

  spreadIndex = 0;
  showToast(`Switched to ${chapter}`);
  render();
}

async function goNextSpreadOrChapter() {
  if (modeSel.value !== "horizontal") return;

  const t = totalSpreads();
  if (t === 0) return;

  if (spreadIndex < t - 1) {
    spreadIndex++;
    render();
    return;
  }

  const idx = chapters.indexOf(chapterSel.value);
  if (idx >= 0 && idx < chapters.length - 1) {
    chapterSel.value = chapters[idx + 1];
    await loadPages();
  }
}

async function goPrevSpreadOrChapter() {
  if (modeSel.value !== "horizontal") return;
  if (totalSpreads() === 0) return;

  if (spreadIndex > 0) {
    spreadIndex--;
    render();
    return;
  }

  const idx = chapters.indexOf(chapterSel.value);
  if (idx > 0) {
    chapterSel.value = chapters[idx - 1];
    await loadPages();
    spreadIndex = Math.max(0, totalSpreads() - 1);
    render();
  }
}

if (downloadSpreadBtn) {
  downloadSpreadBtn.addEventListener("click", downloadCurrentSpread);
}

mangaSel.addEventListener("change", async () => {
  updateBackLink();
  await loadChapters();
});

chapterSel.addEventListener("change", async () => {
  await loadPages();
});

modeSel.addEventListener("change", async () => {
  await savePrefs({ ...prefs, mode: modeSel.value === "horizontal" ? "horizontal" : "vertical" });
  spreadIndex = 0;
  render();
});

prevChapterBtn.addEventListener("click", async () => {
  const idx = chapters.indexOf(chapterSel.value);
  if (idx > 0) {
    chapterSel.value = chapters[idx - 1];
    await loadPages();
  }
});

nextChapterBtn.addEventListener("click", async () => {
  const idx = chapters.indexOf(chapterSel.value);
  if (idx >= 0 && idx < chapters.length - 1) {
    chapterSel.value = chapters[idx + 1];
    await loadPages();
  }
});

btnLeft.addEventListener("click", goNextSpreadOrChapter);
btnRight.addEventListener("click", goPrevSpreadOrChapter);

window.addEventListener("keydown", (e) => {
  if (e.shiftKey && e.key === "ArrowLeft") prevChapterBtn.click();
  if (e.shiftKey && e.key === "ArrowRight") nextChapterBtn.click();

  if (modeSel.value !== "horizontal") return;

  if (e.key === "ArrowLeft") { goNextSpreadOrChapter(); e.preventDefault(); }
  if (e.key === "ArrowRight") { goPrevSpreadOrChapter(); e.preventDefault(); }
});

(async function init() {
  prefs = await loadPrefs();
  modeSel.value = prefs.mode === "horizontal" ? "horizontal" : "vertical";
  await loadMangaList();
})();