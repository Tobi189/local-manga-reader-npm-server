const grid = document.getElementById("libraryGrid");

function coverUrl(manga) {
  return `/cover?manga=${encodeURIComponent(manga)}&t=${Date.now()}`;
}

function readerUrl(manga) {
  return `/manga.html?manga=${encodeURIComponent(manga)}`;
}

function uploadCover(manga, file, imgEl) {
  const reader = new FileReader();
  reader.onload = async () => {
    await fetch("/api/cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manga,
        filename: file.name,
        data: reader.result
      })
    });

    imgEl.src = coverUrl(manga); // refresh with cache bust
  };
  reader.readAsDataURL(file);
}

function makeCard(manga) {
  const card = document.createElement("div");
  card.className = "mangaCard";

  const link = document.createElement("a");
  link.href = readerUrl(manga);
  link.className = "cardLink";

  const img = document.createElement("img");
  img.className = "mangaCover";
  img.src = coverUrl(manga);
  img.alt = manga;
  img.loading = "lazy";

  img.onerror = () => {
    img.src = "/cover-placeholder.png";
  };

  const name = document.createElement("div");
  name.className = "mangaName";
  name.textContent = manga;

  link.appendChild(img);
  link.appendChild(name);
  card.appendChild(link);

  const prefs = JSON.parse(localStorage.getItem("mangaReaderPrefs:v1") || "{}");
  const last = prefs.lastChapterByManga?.[manga];

  if (last) {
    const cont = document.createElement("a");
    cont.href = `/?manga=${encodeURIComponent(manga)}&chapter=${encodeURIComponent(last)}`;
    cont.className = "continueOverlay";
    cont.textContent = "Continue Reading";
    card.appendChild(cont);
  }
  // Hidden file input
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.className = "hiddenInput";
  input.addEventListener("change", e => {
    if (e.target.files[0]) {
      uploadCover(manga, e.target.files[0], img);
    }
  });

  // Change cover button
  const editBtn = document.createElement("button");
  editBtn.className = "editCoverBtn";
  editBtn.textContent = "Change Cover";
  editBtn.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    input.click();
  };

  // Drag & drop
  card.addEventListener("dragover", e => {
    e.preventDefault();
    card.classList.add("dragging");
  });

  card.addEventListener("dragleave", () => {
    card.classList.remove("dragging");
  });

  card.addEventListener("drop", e => {
    e.preventDefault();
    card.classList.remove("dragging");
    const file = e.dataTransfer.files[0];
    if (file) uploadCover(manga, file, img);
  });

  card.appendChild(editBtn);
  card.appendChild(input);

  return card;
}

async function loadLibrary() {
  const mangas = await fetch("/api/manga").then(r => r.json());
  grid.innerHTML = "";
  mangas.forEach(m => grid.appendChild(makeCard(m)));
}

loadLibrary();