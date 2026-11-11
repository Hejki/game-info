# game-info

Statický katalog deskových her. Sestavení: `npm install` a `npm run build`;
obsah adresáře `dist/` se publikuje na GitHub Pages.

## Lokální vývoj

```sh
npm install
npm run dev
```

Otevři adresu vypsanou v terminálu (standardně http://localhost:5173).
Server poslouchá na `0.0.0.0`, takže je dostupný také z lokální sítě.
Na jiném zařízení ve stejné síti otevři adresu `Network` z terminálu,
například `http://192.168.1.10:5173`. Pokud připojení blokuje firewall macOS,
povol příchozí spojení pro Node.js. Vývojový server používej jen v důvěryhodné síti.
Sdílení souborů do BGStats v mobilním prohlížeči nadále vyžaduje HTTPS.
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

### Filtrování her

Tlačítko s ikonou filtru v horní liště otevře modální okno nastavení;
počet aktivních filtrů se zobrazuje přímo na tlačítku. Změny se použijí ihned.
Hledání lze kombinovat s konkrétním počtem hráčů, maximální délkou partie
a jazykem. Počet hráčů musí spadat do uvedeného rozsahu; u délky se porovnává
horní hranice (hra na 30–60 minut odpovídá až filtru „Do 60 minut“).
Hry bez příslušného parametru aktivnímu číselnému filtru neodpovídají.
Chybějící jazyk se stejně jako u vlaječek považuje za češtinu.
Při filtrování se zobrazují jednotlivé odpovídající hry i uvnitř skupin,
v seznamu i v gridu. „Zrušit filtry“ vymaže také text hledání.

### Skupiny her

Skupina je podadresář v `data/`. Obsahuje vlastní obrázek `_cover.jpg`
a jednotlivé YAML/JPG dvojice her. Názvy skupin jsou v `data/_groups.yaml`:

```text
data/
  _groups.yaml
  deskovkari.yaml
  deskovkari.jpg
  unmatched/
    _cover.jpg
    unmatched_alenka.yaml
    unmatched_alenka.jpg
```

Soubor `data/_groups.yaml` je mapa ID skupin na jejich zobrazované názvy:

```yaml
cerne-historky: Historky
micro-macro: MikroMakro
unmatched: Unmatched
```

ID skupiny se odvozuje z názvu adresáře. U jednotlivých her se pole `group`
nevyplňuje. Skupiny jsou jednoúrovňové; názvy souborů her musí být jedinečné
napříč celým katalogem, protože nadále tvoří jejich veřejná ID.
V seznamu se skupina rozbaluje, v gridu má jednu kartu vedoucí na
`index.html?group=unmatched`. Při hledání se zobrazují jednotlivé odpovídající
hry; hledat lze i název skupiny. Počítadlo zahrnuje jednotlivé hry, nikoli karty
skupin. Parametry hráčů, času a obtížnosti zůstávají pouze u jednotlivých her.
Jejich ID a odkazy na detaily se při přesunu do skupiny nemění. Hry přímo
v `data/` se zobrazují samostatně. Build odmítne chybějící definici či obrázek
skupiny a duplicitní ID her. `_groups.yaml` není položka katalogu.

### Odkazy ke hře

`bgg` a volitelné `zh` zůstávají identifikátory hlavních katalogových stránek.
Detail z nich vždy vytvoří nejprve odkaz na BGG a poté na Zatrolené hry,
obojí s původní faviconou. Obecné odkazy ke hře ukládej do `links`:

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
Tyto dva hlavní odkazy proto v `links` neopakuj. Kontextové odkazy ke konkrétním
postavám mohou zůstat přímo v jejich sekcích v `description`, jako u Unmatched
Dobrodružství. Pokud je uvádíš v `links`, upřesni v titulcích jména postav či edic.

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
