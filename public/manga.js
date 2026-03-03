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

(async function init() {
  titleEl.textContent = manga;
  coverImg.src = `/cover?manga=${encodeURIComponent(manga)}&t=${Date.now()}`;

  const chapters = await apiJson(`/api/chapters?manga=${encodeURIComponent(manga)}`);
  const prefs = await apiJson("/api/prefs");
  const last = prefs.lastChapterByManga?.[manga];

  // Continue button
  continueWrap.innerHTML = "";
  if (last && chapters.includes(last)) {
    const btn = document.createElement("a");
    btn.href = readerUrl(last);
    btn.className = "continueBtn";
    btn.textContent = `Continue Reading (${last})`;
    continueWrap.appendChild(btn);
  }

  // Chapter list (newest first)
  chapterList.innerHTML = "";
  [...chapters].reverse().forEach((ch) => {
    const a = document.createElement("a");
    a.href = readerUrl(ch);
    a.className = "chapterItem";
    a.textContent = ch;
    chapterList.appendChild(a);
  });
})();