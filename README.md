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

### Odkazy ke hře

`bgg` a volitelné `zh` zůstávají identifikátory hlavních katalogových stránek.
Detail z nich vždy vytvoří nejprve odkaz na BGG a poté na Zatrolené hry,
obojí s původní faviconou. Další odkazy ukládej do `links`, nikoli do popisu:

```yaml
links:
  - type: rules
    title: Česká pravidla (PDF)
    url: https://example.org/pravidla.pdf
  - type: video
    title: Videonávod (CZ)
    url: https://www.youtube.com/watch?v=VIDEO_ID
  - type: other
    title: Stránka vydavatele
    url: https://example.org/hra
```

Každý odkaz má `type`, `title` a absolutní HTTP(S) `url`. Typy `rules`, `video`
a `other` dostanou ikony `journal-bookmark-fill`, `play-btn-fill` a `link-45deg`.
Odkazy se vykreslují bez odrážek a v pořadí z YAML, až za BGG a Zatrolenými hrami.
Tyto dva hlavní odkazy proto v `links` neopakuj. Text `description` obsahuje jen
popis hry; v odkazech pro jednotlivé postavy nebo edice upřesni jejich jména.

## Přidávání her s asistentem

Projektový skill `.agents/skills/add-board-game/SKILL.md` popisuje přidání hry
z názvu nebo BGG odkazu: dohledání dat, českých pravidel a videí, vytvoření YAML
a JPEG a ověření buildu. Například: „Přidej hru Dorfromantik: Sakura“.
Preferuje [BGG MCP](https://github.com/kkjdaniel/bgg-mcp), pokud je v klientovi
připojené; jinak použije webové zdroje a uvede omezení. Skill samotný MCP
neinstaluje a pro publikovaný web ani build není MCP potřeba.
První ověřený průchod je zdokumentovaný v `references/dorfromantik-sakura.md`
uvnitř skillu.

Skill před buildem optimalizuje nový obrázek přes lokální ImageOptim, pokud
je nainstalovaný. Používá současné nastavení aplikace (včetně schválené ztrátové
komprese), ověří odstranění metadat a vypíše úsporu velikosti. Ostatní obrázky
nepřepisuje. Ručně lze spustit synchronně například:

```sh
/Applications/ImageOptim.app/Contents/MacOS/ImageOptim data/dorfromantik-sakura.jpg
```

ImageOptim není závislost běžného buildu ani CI.

### BGG MCP bez Dockeru

`opencode.json` je připravené pro lokální binárku `tools/bgg-mcp` v režimu `stdio`.
Server je zatím vypnutý (`disabled: true`), než bude schválený BGG API klíč.
Binárka není v Gitu; vlož verzi pro svůj systém a případně nastav spustitelnost
pomocí `chmod +x tools/bgg-mcp`.

API klíč získáš na https://boardgamegeek.com/applications. Neukládej ho do
repozitáře ani do `opencode.json`: konfigurace čte proměnnou `BGG_API_KEY`.
V zsh ji můžeš načíst bez zobrazení klíče a bez uložení do historie:

```sh
read -s "BGG_API_KEY?BGG API klíč: "
export BGG_API_KEY
```

Po získání klíče odstraň `disabled: true` nebo jej změň na `false`.
OpenCode musí proměnnou zdědit při spuštění. Pokud už běží jeho služba,
restartuj ji z terminálu s nastaveným klíčem pomocí `opencode service restart`.
Stav spojení ověříš příkazem `opencode mcp list` nebo přes `/mcps` v OpenCode.
Samotné `connected` ještě neověřuje přístup k BGG API; ověř ho také vyhledáním
hry pomocí asistenta. HTTP 401 znamená problém s autentizací.

## Bootstrap

Katalog používá Bootstrap **6.0.0-alpha.1** přes CDN (CSS a ESM bundle
s ověřenými SRI hashi). Jde o předběžnou verzi, nikoli stabilní vydání.
Vyžaduje moderní prohlížeč s podporou `oklch()` a `color-mix()`.
Zapisovač `botc-play.html` používá stejné Bootstrap komponenty a barevný režim.
