````md
## File structure

```text
manga-reader/
├─ server.js
├─ package.json
├─ package-lock.json
├─ .gitignore
├─ .gitattributes
├─ README.md
├─ placeholder.jpg           # used in horizontal (spread) view
├─ library/                  # your local manga (ignored by git)
│  ├─ One Piece/             # honestly fuck One Piece i ain't readin' it ChatGPT fucking generated this shit
│  │  ├─ ch_001/
│  │  │  ├─ image1.jpg
│  │  │  ├─ image2.jpg
│  │  │  └─ ...
│  │  └─ ch_002/
│  │     ├─ 001.png
│  │     ├─ 002.png
│  │     └─ ...
│  └─ Berserk/
│     └─ 001/
│        ├─ page_1.webp
│        ├─ page_2.webp
│        └─ ...
└─ public/
   ├─ index.html
   ├─ app.js
   └─ style.css
````

## How to run

1. Install dependencies (once)

   ```bash
   npm install
   ```

2. Start the server

   ```bash
   node server.js
   ```

Open:

```text
http://localhost:5173
```

You should see something like: `Manga reader running at http://localhost:5173`

```
::contentReference[oaicite:0]{index=0}
```
