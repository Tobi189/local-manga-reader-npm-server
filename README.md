# Local Manga Reader

A minimal local manga reader with:

- Vertical scroll mode  
- Horizontal (RTL spread) mode  
- Responsive library grid  
- Drag & drop cover uploads  
- Multiple cover format support  
- Local progress memory (per manga)

---

## Features

### Reader
- Vertical scrolling mode
- Horizontal RTL spread mode
- Keyboard navigation (Arrow keys)
- Per-manga last chapter memory
- Mode persistence (vertical / horizontal)

### Library
- Responsive cover grid (number of columns adapts to available width — screen size and browser zoom both affect layout)
- Click cover to open manga
- Drag & drop image onto a cover to change it
- Hover → **Change Cover** button
- Instant refresh after upload (no reload required)

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
│  │  ├─ cover.jpg                 # optional
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
   ├─ library.html                 # cover grid
   ├─ app.js
   ├─ library.js
   ├─ style.css
   └─ cover-placeholder.png        # fallback cover
```

---

## Covers

Each manga folder can contain an optional cover file:

```
cover.png
cover.jpg
cover.jpeg
cover.webp
cover.gif
```

You can:

- Drag & drop an image onto a cover
- Or click **Change Cover**

The image will be saved automatically as:

```
library/<Manga>/cover.<ext>
```

If no cover exists, `public/cover-placeholder.png` is used.

---

## How to Run

Install dependencies (once):

```bash
npm install
```

Start the server:

```bash
node server.js
```

Open:

```
http://localhost:5173
```

---

## Routes

- `/` → Reader
- `/library.html` → Library grid
- `/cover?manga=Name` → Serve cover image
- `/api/*` → Backend API endpoints