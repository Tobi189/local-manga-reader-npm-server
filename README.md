file structure:

manga-reader/
├─ server.js
├─ package.json
├─ package-lock.json
├─ .gitignore
├─ .gitattributes
├─ README.md
└─ library/                 # your local manga (ignored by git)
   ├─ One Piece/
   │  ├─ ch_001/
   │  │  ├─ image1.jpg
   │  │  ├─ image2.jpg
   │  │  └─ ...
   │  └─ ch_002/
   │     ├─ 001.png
   │     ├─ 002.png
   │     └─ ...
   └─ Berserk/
      └─ 001/
         ├─ page_1.webp
         ├─ page_2.webp
         └─ ...
How to run:
1) install dependencies (once)
   npm install
2) start the server
   node server.js
   
   You should see sth like: Manga reader running at http://localhost:5173





