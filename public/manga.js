const params = new URLSearchParams(location.search);
const manga = params.get("manga");

const coverImg = document.getElementById("mangaCover");
const titleEl = document.getElementById("mangaTitle");
const chapterList = document.getElementById("chapterList");
const continueWrap = document.getElementById("continueWrap");

if (!manga) location.href = "/library.html";

titleEl.textContent = manga;
coverImg.src = `/cover?manga=${encodeURIComponent(manga)}&t=${Date.now()}`;

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem("mangaReaderPrefs:v1") || "{}"); }
  catch { return {}; }
}

function readerUrl(chapter) {
   return `/index.html?manga=${encodeURIComponent(manga)}&chapter=${encodeURIComponent(chapter)}`;
}

async function loadChapters() {
  const chapters = await fetch(`/api/chapters?manga=${encodeURIComponent(manga)}`)
    .then(r => r.json());

  const reversed = [...chapters].reverse(); // latest first

  chapterList.innerHTML = "";

  for (const ch of reversed) {
    const a = document.createElement("a");
    a.href = readerUrl(ch);
    a.className = "chapterItem";
    a.textContent = ch;
    chapterList.appendChild(a);
  }

  const prefs = loadPrefs();
  const last = prefs.lastChapterByManga?.[manga];

  if (last && chapters.includes(last)) {
    const btn = document.createElement("a");
    btn.href = readerUrl(last);
    btn.className = "continueBtn";
    btn.textContent = `Continue Reading (${last})`;
    continueWrap.appendChild(btn);
  }
}

loadChapters();