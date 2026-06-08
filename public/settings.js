const el = (id) => document.getElementById(id);

const setLibrarySort = el("setLibrarySort");
const setDownloadFormat = el("setDownloadFormat");
const setJpgQuality = el("setJpgQuality");
const jpgQualityLabel = el("jpgQualityLabel");
const setShowDownloadSides = el("setShowDownloadSides");
const saveBtn = el("saveSettings");
const saveMsg = el("saveMsg");

async function apiJson(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.json();
}

function updateQualityLabel() {
  jpgQualityLabel.textContent = `Quality: ${Number(setJpgQuality.value).toFixed(2)}`;
}

async function loadSettings() {
  const prefs = await apiJson("/api/prefs");
  const s = prefs.settings || {};

  setLibrarySort.value = s.librarySort === "lastOpened" ? "lastOpened" : "name";
  setDownloadFormat.value = s.downloadFormat === "jpg" ? "jpg" : "png";
  setJpgQuality.value = (typeof s.jpgQuality === "number") ? String(s.jpgQuality) : "0.9";
  setShowDownloadSides.checked = !!s.showDownloadSides;

  updateQualityLabel();
}

async function saveSettings() {
  const patch = {
    settings: {
      librarySort: setLibrarySort.value === "lastOpened" ? "lastOpened" : "name",
      downloadFormat: setDownloadFormat.value === "jpg" ? "jpg" : "png",
      jpgQuality: Number(setJpgQuality.value),
      showDownloadSides: !!setShowDownloadSides.checked
    }
  };

  await apiJson("/api/prefs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
}

setJpgQuality.addEventListener("input", updateQualityLabel);

saveBtn.addEventListener("click", async () => {
  saveMsg.textContent = "";
  try {
    await saveSettings();
    saveMsg.textContent = "Saved!";
  } catch (e) {
    saveMsg.textContent = "Failed to save.";
  }
});

loadSettings();