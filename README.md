# game-info

Statický katalog deskových her. Sestavení: `npm install` a `npm run build`;
obsah adresáře `dist/` se publikuje na GitHub Pages.

## Lokální vývoj

```sh
npm install
npm run dev
```

Otevři adresu vypsanou v terminálu (standardně http://127.0.0.1:5173).
Vývojový server Vite vystavuje sestavený adresář `dist/`. Sleduje změny
v `src/`, `data/` a `tools/build.js`, automaticky spouští build a po úspěšném
dokončení obnoví prohlížeč. Sleduje i přidání a smazání souborů.
Při chybě další změna build spustí znovu. Server ukončíš pomocí Ctrl+C.

## Stránky a odkazy

`index.html` zobrazuje seznam her, `game.html?id=deskovkari` detail hry.
Sdílené styly jsou v `src/styles/app.css`, barevný režim obsluhuje
`src/scripts/color-mode.js`. Každá stránka má vlastní skript pro načítání dat.
Staré odkazy jako `https://bg.hejki.org/#deskovkari` (i `index.html#deskovkari`)
se automaticky přesměrují na nový detail bez přidání kroku do historie.

Testy navigace, kompatibility odkazů a vývojového serveru: `npm test`.

## Bootstrap

Katalog používá Bootstrap **6.0.0-alpha.1** přes CDN (CSS a ESM bundle
s ověřenými SRI hashi). Jde o předběžnou verzi, nikoli stabilní vydání.
Vyžaduje moderní prohlížeč s podporou `oklch()` a `color-mix()`.
Zapisovač `botc-play.html` používá stejné Bootstrap komponenty a barevný režim.
