# První průchod: Dorfromantik: Sakura

Datum ověření: 2026-10-15. Záznam: `data/dorfromantik-sakura.yaml`.

## Identita a hodnoty

- Samostatná kooperativní hra z roku 2024, autoři Michael Palm a Lukas Zach.
  Není to původní Dorfromantik, Duel ani promo Japolonia.
- BGG: https://boardgamegeek.com/boardgame/424774/dorfromantik-sakura
  ID `424774`, herní doba `30-90`, věk `10+`, complexity snapshot `1.91 / 5`.
  BGG MCP nebylo v této relaci k dispozici a přímé načtení BGG vrátilo HTTP 403.
  ID a hodnoty byly dostupné v indexovaných výsledcích vyhledávání BGG;
  nejde o živá data z API. Obtížnost se může časem měnit.
- Zatrolené hry: https://www.zatrolene-hry.cz/spolecenska-hra/dorfromantik-sakura-16621
  Ověřeno přímo: název, autoři, rok 2024, 1–6 hráčů, 10+, český vydavatel TLAMA
  games. ZH uvádějí 60 minut, což je užší údaj než rozsah BGG.
- Český vydavatel: https://www.tlamagames.com/deskove-hry/dorfromantik-sakura/
  Potvrzuje samostatnou hru, 1–6 hráčů, princip pokládání destiček a kampaň.
  Produktová stránka uvádí 8+, přiložené české PDF však 10+; použito **10+**
  podle titulní strany pravidel, v souladu se ZH a indexovaným BGG.
- `color: "#235C48"` je redakčně zvolená tmavá zelená inspirovaná obrázkem,
  nikoli importovaný herní parametr nebo automaticky naměřený dominantní odstín.

## Pravidla a videa

- České PDF: https://www.tlamagames.com/user/documents/upload/pravidla/Dorfromantik_Sakura_cz-web.pdf
  Odkaz z webu českého vydavatele, HTTP 200, `application/pdf`, signatura PDF.
  Dokument skutečně otevřen a přečten: str. 1 uvádí 1–6 hráčů od 10 let;
  str. 4–10 popisují přípravu, tahy, společné bodování a postup kampaní.
  PDF je pouze odkazované; do repozitáře se nekopíruje.
- CZ video: https://www.youtube.com/watch?v=4SCM8lDwsdw
  TLAMA games, „Dorfromantik: Sakura – Představení/Preview“.
  ID ověřeno ve vloženém videu na
  https://www.zatrolene-hry.cz/video/dorfromantik-sakura-predstaveni-1701
  a přes YouTube oEmbed. Popis vysvětluje rozdíly proti původní hře.
  **Není označené jako kompletní návod.**
- EN video: https://www.youtube.com/watch?v=x4z2LozJ0sc
  Game4LifeBG, „Dorfromantik: Sakura, Basic rules playthrough #1“.
  Titul a kanál ověřeny přes YouTube oEmbed, dostupný popis uvádí základní
  pravidla a první partii. Zařazeno jako „Základní pravidla a ukázková partie
  (EN)“, ne jako český návod. Celé video nebylo zhlédnuto.
- Kompletní český videonávod nebyl při tomto průchodu spolehlivě nalezen.

## Obrázek a text

- Zdroj: https://cdn.myshoptet.com/usr/www.tlamagames.com/user/shop/big/99337-9_boxtop.jpg
  Obrázek obalu odkazovaný ze stránky českého vydavatele. HTTP 200,
  `image/jpeg`, skutečný JPEG 1024×768. Oříznuty jen bílé boční okraje
  na 768×768; ponechána ilustrace, titul i značky/kredity vydavatele a autorů.
- Výsledek: `data/dorfromantik-sakura.jpg`. Práva k ilustraci a obalu náleží
  příslušným držitelům; stažení nepředstavuje tvrzení o volné licenci.
- Popis v YAML je nové krátké české shrnutí ověřeného principu hry a cíle,
  nikoli kopie produktového popisu nebo pravidel.

### Optimalizace obrázku

Po ořezu byl JPEG optimalizován aplikací ImageOptim 1.9.3, synchronním spuštěním
`/Applications/ImageOptim.app/Contents/MacOS/ImageOptim` pouze nad tímto souborem.
Uživatel schválil své současné nastavení včetně ztrátové komprese; aplikace
ohlásila optimalizaci přes JpegOptim na 80 %.

- Před: **161 794 B**; po: **112 500 B**; úspora **49 294 B (30,5 %)**.
- JPEG zůstal dekódovatelný, rozměry **768×768** se nezměnily.
- Kontrola JPEG segmentů před optimalizací našla JFIF, EXIF a Photoshop metadata.
  Po optimalizaci zůstala jen JFIF hlavička, bez EXIF/XMP/IPTC a komentářů.
- Ostatní obrázky katalogu se neoptimalizovaly a nastavení aplikace se neměnilo.

## Poučení pro skill

1. Skill nepřipojí MCP automaticky; musí umět přiznat náhradní postup.
2. I stránka vydavatele může mít rozpor mezi marketingem a přiloženými pravidly.
3. Video od vydavatele nemusí být návod; popisek odkazu musí odpovídat obsahu.
4. Výstup je hotový až s platným obrázkem a úspěšným buildem.
5. Zachovat aktuální schéma projektu. Při prvním průchodu byly odkazy v Markdownu;
   následně byly na žádost uživatele migrovány do podporovaného seznamu `links`
   (`type`, `title`, `url`) a frontend je vykresluje pod BGG a Zatrolenými hrami.
