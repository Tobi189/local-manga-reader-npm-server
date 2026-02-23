# Local Manga Reader

A minimal local manga reader with:

- Vertical scroll mode
- Horizontal (RTL spread) mode
- Responsive library grid with covers
- Support for multiple cover formats

---

## File Structure

```text
manga-reader/
├─ server.js
├─ package.json
├─ package-lock.json
├─ placeholder.jpg                 # used in horizontal (spread) view
├─ library/                        # your local manga (ignored by git)
│  ├─ Berserk/
│  │  ├─ cover.jpg                 # optional (png/jpg/jpeg/webp/gif supported)
│  │  └─ 001/
│  │     ├─ page_1.webp
│  │     ├─ page_2.webp
│  │     └─ ...
│  └─ One Piece/
│     ├─ cover.png
│     ├─ ch_001/
│     │  ├─ image1.jpg
│     │  └─ ...
│     └─ ch_002/
│        ├─ 001.png
│        └─ ...
└─ public/
   ├─ index.html                   # reader
   ├─ library.html                 # cover grid page
   ├─ app.js
   ├─ library.js
   ├─ style.css
   └─ cover-placeholder.png        # fallback cover image
```

---

## Covers

Each manga folder can optionally contain:

```
cover.png
cover.jpg
cover.jpeg
cover.webp
cover.gif
```

If no cover is found, `public/cover-placeholder.png` is used.

---

## How to Run

1. Install dependencies (once):

```bash
npm install
```

2. Start the server:

```bash
node server.js
```

Open in your browser:

```
http://localhost:5173
```

---

## Pages

- `/` → Reader
- `/library.html` → Responsive cover grid