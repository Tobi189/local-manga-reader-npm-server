const mangaSel = document.getElementById("manga");
const chapterSel = document.getElementById("chapter");
const modeSel = document.getElementById("mode");

const prevChapterBtn = document.getElementById("prevChapter");
const nextChapterBtn = document.getElementById("nextChapter");

const pagesDiv = document.getElementById("pages");
const pageInfo = document.getElementById("pageInfo");

const navLeft = document.getElementById("navLeft");
const navRight = document.getElementById("navRight");
const btnLeft = document.getElementById("btnLeft");   // forward
const btnRight = document.getElementById("btnRight"); // back

const pageIndicator = document.getElementById("pageIndicator");

let chapters = [];
let pages = [];        // filenames
let spreadIndex = 0;   // 0..totalSpreads-1

const PLACEHOLDER_URL = "/placeholder.jpg";

function blurActiveIfFormControl() {
  const el = document.activeElement;
  if (!el) return;
  const tag = el.tagName?.toLowerCase();
  if (tag === "select" || tag === "input" || tag === "textarea" || tag === "button") {
    el.blur();
  }
}

function imgUrl(manga, chapter, file) {
  return `/img?manga=${encodeURIComponent(manga)}&chapter=${encodeURIComponent(chapter)}&file=${encodeURIComponent(file)}`;
}

function buildImg(src) {
  const img = document.createElement("img");
  img.loading = "lazy";
  img.src = src;
  return img;
}

function totalSpreads() {
  // Spread 0: placeholder + page0 (single real page)
  // Remaining pages from index 1 onward in pairs (right then left)
  if (pages.length === 0) return 0;
  if (pages.length === 1) return 1;
  return 1 + Math.ceil((pages.length - 1) / 2);
}

/**
 * Returns [leftSrc, rightSrc] for a spread index, JP style:
 * spread 0: left=placeholder, right=page0
 * spread 1: right=page1, left=page2 (if exists else placeholder)
 * spread 2: right=page3, left=page4 ...
 */
function spreadSources(si) {
  const manga = mangaSel.value;
  const chapter = chapterSel.value;

  if (pages.length === 0) return [PLACEHOLDER_URL, PLACEHOLDER_URL];

  // Spread 0: show first real page on the LEFT, placeholder on the RIGHT
  if (si === 0) {
    const left = imgUrl(manga, chapter, pages[0]);
    return [left, PLACEHOLDER_URL];
  }

  const start = 1 + (si - 1) * 2;
  const rightIdx = start;      // earlier page (RTL: goes on the RIGHT when we have two)
  const leftIdx = start + 1;   // later page (goes on the LEFT)

  // If only one page is left (your “even page count => last single page” case),
  // show that page on LEFT and placeholder on RIGHT.
  if (rightIdx < pages.length && leftIdx >= pages.length) {
  const right = imgUrl(manga, chapter, pages[rightIdx]);
  return [PLACEHOLDER_URL, right];
}


  // Normal two-page spread (RTL reading):
  // Visual layout is [left, right], but reading order is right then left.
  const right = rightIdx < pages.length ? imgUrl(manga, chapter, pages[rightIdx]) : PLACEHOLDER_URL;
  const left  = leftIdx  < pages.length ? imgUrl(manga, chapter, pages[leftIdx])  : PLACEHOLDER_URL;

  return [left, right];
}

function setNavVisible(visible) {
  navLeft.classList.toggle("hidden", !visible);
  navRight.classList.toggle("hidden", !visible);
}

function updateInfo() {
  if (modeSel.value !== "horizontal") {
    pageInfo.textContent = "";
    return;
  }
  const t = totalSpreads();
  if (t === 0) { pageInfo.textContent = ""; return; }

  // show “spread x/y”
  pageInfo.textContent = `Spread ${spreadIndex + 1}/${t} (RTL)`;
}

function renderVertical() {
  pagesDiv.className = "vertical";
  pagesDiv.innerHTML = "";
  setNavVisible(false);
  pageInfo.textContent = "";

  const manga = mangaSel.value;
  const chapter = chapterSel.value;

  for (const file of pages) {
    pagesDiv.appendChild(buildImg(imgUrl(manga, chapter, file)));
  }
  window.scrollTo({ top: 0, behavior: "instant" });
  updateBottomIndicator();

}

function spreadPageNumbers(si) {
  // Returns 1-based real page numbers in reading order (RTL: right page first)
  // spread 0: [1]
  // spread 1: [2,3]
  // spread 2: [4,5]
  // last single: [N]
  if (pages.length === 0) return [];

  if (si === 0) return [1];

  const start = 1 + (si - 1) * 2;     // 0-based index of the "right" page
  const rightIdx = start;
  const leftIdx = start + 1;

  if (rightIdx >= pages.length) return [];

  const rightPage = rightIdx + 1;     // to 1-based
  const leftPage = leftIdx + 1;

  // If only one page remains (your last single spread case)
  if (leftIdx >= pages.length) return [rightPage];

  return [rightPage, leftPage];
}

function updateBottomIndicator() {
  if (modeSel.value !== "horizontal" || pages.length === 0) {
    pageIndicator.classList.add("hidden");
    pageIndicator.textContent = "";
    return;
  }

  pageIndicator.classList.remove("hidden");

  const total = pages.length;
  const nums = spreadPageNumbers(spreadIndex);

  if (nums.length === 1) {
    pageIndicator.textContent = `Page ${nums[0]} / ${total}`;
  } else {
    pageIndicator.textContent = `Pages ${nums[0]}–${nums[1]} / ${total}`;
  }
}


function renderHorizontal() {
  pagesDiv.className = "horizontal";
  pagesDiv.innerHTML = "";
  setNavVisible(true);

  const frame = document.createElement("div");
  frame.className = "spreadFrame";

  const leftSlot = document.createElement("div");
  leftSlot.className = "pageSlot";

  const rightSlot = document.createElement("div");
  rightSlot.className = "pageSlot";

  const [leftSrc, rightSrc] = spreadSources(spreadIndex);

  leftSlot.appendChild(buildImg(leftSrc));
  rightSlot.appendChild(buildImg(rightSrc));

  frame.appendChild(leftSlot);
  frame.appendChild(rightSlot);
  pagesDiv.appendChild(frame);

  updateInfo();

  updateBottomIndicator();

  window.scrollTo({ top: 0, behavior: "instant" });
}

function render() {
  const mode = modeSel.value;
  const t = totalSpreads();
  if (spreadIndex < 0) spreadIndex = 0;
  if (t > 0 && spreadIndex > t - 1) spreadIndex = t - 1;

  if (mode === "vertical") renderVertical();
  else renderHorizontal();
}

function forwardSpread() {
  if (modeSel.value !== "horizontal") return;
  const t = totalSpreads();
  if (spreadIndex < t - 1) {
    spreadIndex++;
    renderHorizontal();
  }
}

function backSpread() {
  if (modeSel.value !== "horizontal") return;
  if (spreadIndex > 0) {
    spreadIndex--;
    renderHorizontal();
  }
}

// --- Data loading ---
async function loadManga() {
  const m = await fetch("/api/manga").then(r => r.json());
  mangaSel.innerHTML = m.map(x => `<option>${x}</option>`).join("");
  await loadChapters();
}

async function loadChapters() {
  const manga = mangaSel.value;
  chapters = await fetch(`/api/chapters?manga=${encodeURIComponent(manga)}`).then(r => r.json());
  chapterSel.innerHTML = chapters.map(x => `<option>${x}</option>`).join("");
  await loadPages();
}

async function loadPages() {
  const manga = mangaSel.value;
  const chapter = chapterSel.value;
  pages = await fetch(`/api/pages?manga=${encodeURIComponent(manga)}&chapter=${encodeURIComponent(chapter)}`).then(r => r.json());
  spreadIndex = 0;
  render();
}

// --- Events ---
mangaSel.addEventListener("change", async () => {
  await loadChapters();
  blurActiveIfFormControl();
});

chapterSel.addEventListener("change", async () => {
  await loadPages();
  blurActiveIfFormControl();
});

modeSel.addEventListener("change", () => {
  spreadIndex = 0;
  render();
  blurActiveIfFormControl();
});


// Chapter nav
prevChapterBtn.addEventListener("click", () => {
  const idx = chapters.indexOf(chapterSel.value);
  if (idx > 0) {
    chapterSel.value = chapters[idx - 1];
    loadPages();
  }
});

nextChapterBtn.addEventListener("click", () => {
  const idx = chapters.indexOf(chapterSel.value);
  if (idx >= 0 && idx < chapters.length - 1) {
    chapterSel.value = chapters[idx + 1];
    loadPages();
  }
});

// Hover nav (RTL friendly)
btnLeft.addEventListener("click", forwardSpread); // go forward (next)
btnRight.addEventListener("click", backSpread);   // go back (prev)

// Keyboard:
// - Left = forward (RTL)
// - Right = back
// - Shift+Left/Right = chapter
window.addEventListener("keydown", (e) => {
  if (e.shiftKey && e.key === "ArrowLeft") prevChapterBtn.click();
  if (e.shiftKey && e.key === "ArrowRight") nextChapterBtn.click();

  if (!e.shiftKey && modeSel.value === "horizontal") {
    if (e.key === "ArrowLeft") forwardSpread();
    if (e.key === "ArrowRight") backSpread();
  }
});

loadManga();
