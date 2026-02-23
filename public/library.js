const grid = document.getElementById("libraryGrid");

function coverUrl(manga) {
  return `/cover?manga=${encodeURIComponent(manga)}`;
}

function readerUrl(manga) {
  // reader is / (index.html). We’ll pass manga via query param.
  return `/?manga=${encodeURIComponent(manga)}`;
}

function makeCard(manga) {
  const a = document.createElement("a");
  a.className = "mangaCard";
  a.href = readerUrl(manga);
  a.title = manga;

  const img = document.createElement("img");
  img.className = "mangaCover";
  img.loading = "lazy";
  img.src = coverUrl(manga);
  img.alt = `${manga} cover`;

  // if cover endpoint somehow fails, still show a fallback image
  img.onerror = () => { img.src = "/cover-placeholder.png"; };

  const name = document.createElement("div");
  name.className = "mangaName";
  name.textContent = manga;

  a.appendChild(img);
  a.appendChild(name);
  return a;
}

async function loadLibrary() {
  const mangas = await fetch("/api/manga").then(r => r.json());
  grid.innerHTML = "";
  for (const m of mangas) grid.appendChild(makeCard(m));
}

loadLibrary();