import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import YAML from 'yaml'
import path from 'node:path'

const read = file => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8')
const legacySource = await read('src/scripts/legacy-links.js')
const indexSource = await read('src/scripts/game-index.js')
const detailSource = await read('src/scripts/game-detail.js')
const gameFiles = async () => (await Array.fromAsync(fs.glob('data/**/*.yaml'))).filter(file => !['_group.yaml', '_groups.yaml'].includes(path.basename(file)))

function element() {
    const classes = new Set()
    const listeners = new Map()
    return {
        hidden: true,
        value: '',
        style: {},
        children: [],
        classList: {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name),
        },
        appendChild(child) { this.children.push(child) },
        replaceChildren(...children) { this.children = children },
        setAttribute(name, value) { this[name] = value },
        addEventListener(event, callback) { listeners.set(event, callback) },
        dispatchEvent(event) { listeners.get(event.type)?.(event) },
    }
}

function page(url, fetch, storage = new Map()) {
    const elements = new Map()
    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, element())
            return elements.get(id)
        },
        createElement: element,
        createTextNode: text => ({ textContent: text }),
    }
    const location = new URL(url)
    let redirect
    location.replace = target => { redirect = target }
    return {
        context: vm.createContext({
            window: { location }, document, fetch, URLSearchParams, URL,
            localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
            marked: { parse: text => `<p>${text}</p>` }, console: { error() {} },
        }),
        get: id => document.getElementById(id),
        redirect: () => redirect,
    }
}

test('legacy links redirect to the same game without adding a history entry', async () => {
    const ids = (await gameFiles()).map(file => path.basename(file, '.yaml'))
    for (const id of ids) {
        let redirect
        vm.runInNewContext(legacySource, {
            URL,
            window: {
                location: { hash: `#${id}`, href: `https://bg.hejki.org/#${id}`, replace: url => { redirect = url } },
                addEventListener() {},
            },
        })
        assert.equal(redirect, `https://bg.hejki.org/game.html?id=${id}`)
    }
    for (const [href, expected] of [
        ['https://bg.hejki.org/', undefined],
        ['https://bg.hejki.org/#', undefined],
        ['https://example.org/subdir/index.html#%64eskovkari', 'https://example.org/subdir/game.html?id=deskovkari'],
        ['https://bg.hejki.org/#bad%', 'https://bg.hejki.org/game.html?id=bad%25'],
    ]) {
        let redirect
        let onHashChange
        const location = new URL(href)
        location.replace = url => { redirect = url }
        vm.runInNewContext(legacySource, { URL, window: { location, addEventListener: (event, callback) => { onHashChange = callback } } })
        assert.equal(redirect, expected)
        location.hash = '#deskovkari'
        onHashChange()
        assert.equal(new URL(redirect).searchParams.get('id'), 'deskovkari')
    }
})

test('index renders links to the separate detail page and keeps tool links', async () => {
    const app = page('https://bg.hejki.org/', async () => ({ ok: true, json: async () => [
        { id: 'deskovkari', name: 'Deskovkaři', p: '2-4', t: '45', w: 2, tools: [{ link: '/botc-play.html', icon: 'bi bi-journal-bookmark' }] },
    ] }))
    await vm.runInContext(indexSource, app.context)
    const row = app.get('game-index').children[0]
    assert.equal(row.children[0].children[0].href, 'game.html?id=deskovkari')
    assert.equal(row.children[0].children[2].href, '/botc-play.html')
    assert.equal(row.children[2].textContent, '45')
    assert.equal(app.get('game-index-table').hidden, false)
    assert.equal(app.get('game-index-status').hidden, true)
})

test('index shows a flag after non-Czech game names only, before tool links', async () => {
    const app = page('https://bg.hejki.org/', async () => ({ ok: true, json: async () => [
        { id: 'czech', name: 'Česká hra', language: 'cs' },
        { id: 'english', name: 'English game', language: 'en', tools: [{ link: '/tool.html', icon: 'bi bi-dice' }] },
        { id: 'unknown', name: 'Unknown game' },
    ] }))
    await vm.runInContext(indexSource, app.context)
    const [czech, english, unknown] = app.get('game-index').children.map(row => row.children[0])
    assert.equal(czech.children.length, 1)
    assert.equal(unknown.children.length, 1)
    assert.equal(english.children[0].textContent, 'English game')
    assert.equal(english.children[2].textContent, '🇬🇧')
    assert.equal(english.children[2].role, 'img')
    assert.equal(english.children[2]['aria-label'], 'Hra není v češtině')
    assert.equal(english.children[4].href, '/tool.html')
})

test('search filters names without case or accents and handles empty results and clearing', async () => {
    let requests = 0
    const app = page('https://bg.hejki.org/', async () => {
        requests++
        return { ok: true, json: async () => [
            { id: 'deskovkari', name: 'Deskovkaři' },
            { id: 'krvava-hodina', name: 'Krvavá hodina odbila' },
            { id: 'frosthaven', name: 'Frosthaven' },
        ] }
    })
    await vm.runInContext(indexSource, app.context)
    const search = app.get('game-search')
    const rows = app.get('game-index').children
    assert.equal(search.disabled, false)
    for (const [query, expected] of [
        ['', [0, 1, 2]],
        ['  DESKOVKARI  ', [0]],
        ['deskovkáři', [0]],
        ['krvava hodina', [1]],
        ['HODINA   krvava', [1]],
        ['frost', [2]],
        ['nenalezeno', []],
        ['   ', [0, 1, 2]],
        ['', [0, 1, 2]],
    ]) {
        search.value = query
        search.dispatchEvent({ type: 'input' })
        assert.deepEqual(rows.flatMap((row, index) => row.hidden ? [] : [index]), expected, query)
        assert.equal(app.get('game-search-count').textContent, `Zobrazeno ${expected.length} z 3 her`)
        assert.equal(app.get('game-search-empty').hidden, expected.length !== 0)
        assert.equal(app.get('game-index-table').hidden, expected.length === 0)
    }
    assert.equal(requests, 1, 'Filtering must not fetch data again')
})

test('grid cards show lazy-loaded cover images, game links, flags, tools and metadata', async () => {
    const app = page('https://bg.hejki.org/', async () => ({ ok: true, json: async () => [
        { id: 'english-game', name: 'English game', language: 'en', p: '2-4', t: '45', w: 2.5, tools: [{ link: '/tool.html', icon: 'bi bi-dice' }] },
    ] }))
    await vm.runInContext(indexSource, app.context)
    const column = app.get('game-grid').children[0]
    assert.equal(column.className, 'col-6 md:col-4 lg:col-3 xl:col-2')
    const card = column.children[0]
    assert.equal(card.className, 'card h-100 overflow-hidden game-grid-card')
    const imageLink = card.children[0]
    assert.equal(imageLink.className, 'card-img-overlay p-0')
    assert.equal(imageLink.href, 'game.html?id=english-game')
    const image = imageLink.children[0]
    assert.equal(image.src, 'games/english-game/title.jpg')
    assert.equal(image.alt, 'English game')
    assert.equal(image.loading, 'lazy')
    assert.equal(image.className, 'd-block w-100 h-100 object-fit-cover')
    const css = await read('src/styles/app.css')
    assert.doesNotMatch(css, /\.game-grid-(?:card|art|cover)\s*\{/)
    assert.equal(card.children[1].className, 'ratio-4x3 flex-shrink-0 pe-none')
    assert.equal(card.children[2].className, 'card-body position-relative flex-shrink-0 mt-auto')
    const [title, metadata] = card.children[2].children
    assert.ok(title.className.includes('text-break'))
    assert.equal(title.children[0].textContent, 'English game')
    assert.equal(title.children[0].href, undefined)
    assert.equal(title.children[2].textContent, '🇬🇧')
    assert.equal(title.children.length, 3, 'Tool links must not remain beside the grid title')
    const tools = card.children[3]
    assert.equal(tools.className, 'game-grid-tools d-flex gap-2')
    assert.equal(tools.children[0].href, '/tool.html')
    assert.equal(tools.children[0].className, 'btn-solid theme-info')
    assert.equal(tools.children[0]['aria-label'], 'Spustit nástroj: English game')
    assert.equal(tools.children[0].children[0]['aria-hidden'], 'true')
    assert.match(css, /\.game-grid-tools\s*\{[^}]*position: absolute;[^}]*inset-block-start: \.5rem;[^}]*inset-inline-end: \.5rem;/)
    assert.deepEqual(metadata.children.map(item => item.children[2].textContent), [' 2-4', ' 45 min', ' 2.5'])
})

test('Blood on the Clocktower launches its tool from a separate grid overlay while keeping its list link', async () => {
    const game = YAML.parse(await read('data/krvava-hodina.yaml'))
    const app = page('https://bg.hejki.org/', async () => ({ ok: true, json: async () => [{ ...game, id: 'krvava-hodina' }] }))
    await vm.runInContext(indexSource, app.context)
    const card = app.get('game-grid').children[0].children[0]
    assert.equal(card.children[0].href, 'game.html?id=krvava-hodina')
    assert.equal(card.children[0].children.length, 1, 'Do not nest tool links in the image link')
    assert.equal(card.children[2].children[0].children.length, 1)
    assert.equal(card.children[3].children[0].href, '/botc-play.html')
    assert.equal(app.get('game-index').children[0].children[0].children[2].href, '/botc-play.html')
})

test('view icons switch list and grid, preserve filtering, and remember the choice on reload', async () => {
    const storage = new Map()
    let requests = 0
    const fetch = async () => {
        requests++
        return { ok: true, json: async () => [{ id: 'one', name: 'První hra' }, { id: 'two', name: 'Druhá hra' }] }
    }
    const app = page('https://bg.hejki.org/', fetch, storage)
    await vm.runInContext(indexSource, app.context)
    assert.equal(app.get('game-view-list')['aria-pressed'], 'true')
    assert.equal(app.get('game-index-table').hidden, false)
    assert.equal(app.get('game-index-grid').hidden, true)
    const search = app.get('game-search')
    search.value = 'DRUHA'
    search.dispatchEvent({ type: 'input' })
    app.get('game-view-grid').dispatchEvent({ type: 'click' })
    assert.equal(app.get('game-index-table').hidden, true)
    assert.equal(app.get('game-index-grid').hidden, false)
    assert.equal(app.get('game-view-grid')['aria-pressed'], 'true')
    assert.ok(app.get('game-view-grid').classList.contains('active'))
    assert.equal(app.get('game-view-list')['aria-pressed'], 'false')
    assert.deepEqual(app.get('game-grid').children.map(card => card.hidden), [true, false])
    assert.equal(app.get('game-search-count').textContent, 'Zobrazeno 1 z 2 her')
    assert.equal(storage.get('game-index-view'), 'grid')
    search.value = 'nenalezeno'
    search.dispatchEvent({ type: 'input' })
    assert.equal(app.get('game-index-table').hidden, true)
    assert.equal(app.get('game-index-grid').hidden, true)
    assert.equal(app.get('game-search-empty').hidden, false)
    search.value = ''
    search.dispatchEvent({ type: 'input' })
    assert.equal(app.get('game-index-grid').hidden, false)
    assert.equal(requests, 1)
    const reloaded = page('https://bg.hejki.org/', fetch, storage)
    await vm.runInContext(indexSource, reloaded.context)
    assert.equal(reloaded.get('game-index-grid').hidden, false)
    assert.equal(reloaded.get('game-view-grid')['aria-pressed'], 'true')
    reloaded.get('game-view-list').dispatchEvent({ type: 'click' })
    assert.equal(storage.get('game-index-view'), 'list')
    assert.equal(reloaded.get('game-index-grid').hidden, true)
    assert.equal(reloaded.get('game-index-table').hidden, false)
    const html = await read('src/index.html')
    const navbar = html.match(/<nav\b[\s\S]*?<\/nav>/)[0]
    assert.match(navbar, /navbar[^"\n]*bg-1 border-bottom justify-content-end/)
    assert.match(navbar, /class="me-auto d-none md:d-block"/)
    assert.match(navbar, /class="navbar-brand btn-text" data-bs-toggle="menu"/)
    for (const mode of ['list', 'grid']) assert.ok(navbar.includes(`id="game-view-${mode}"`))
})

test('view switching works when storage is blocked and ignores invalid saved modes', async () => {
    const fetch = async () => ({ ok: true, json: async () => [{ id: 'one', name: 'Hra' }] })
    for (const storage of [
        new Map([['game-index-view', 'invalid']]),
        { get() { throw new Error('Blocked') }, set() { throw new Error('Full') } },
    ]) {
        const app = page('https://bg.hejki.org/', fetch, storage)
        await vm.runInContext(indexSource, app.context)
        assert.equal(app.get('game-index-table').hidden, false)
        app.get('game-view-grid').dispatchEvent({ type: 'click' })
        assert.equal(app.get('game-index-grid').hidden, false)
        app.get('game-view-list').dispatchEvent({ type: 'click' })
        assert.equal(app.get('game-index-table').hidden, false)
    }
})

const groupedGames = [
    { id: 'solo', name: 'Samostatná hra', p: '2', t: '20', w: 1 },
    { id: 'unmatched_alenka', name: 'Alenka', group: 'unmatched', groupName: 'Unmatched', groupImage: 'groups/unmatched/_cover.jpg', p: '2-4' },
    { id: 'another', name: 'Další hra' },
    { id: 'unmatched_meduza', name: 'Medúza', group: 'unmatched', groupName: 'Unmatched', groupImage: 'groups/unmatched/_cover.jpg', p: '2-4' },
]

test('groups collapse in the list and have one grid card without aggregated game parameters', async () => {
    let requests = 0
    const app = page('https://bg.hejki.org/', async () => {
        requests++
        return { ok: true, json: async () => groupedGames }
    })
    await vm.runInContext(indexSource, app.context)
    const [solo, header, alice, medusa, other] = app.get('game-index').children
    const button = header.children[0].children[0]
    assert.equal(header.children.length, 1)
    assert.equal(header.children[0].colSpan, 4)
    assert.equal(button['aria-expanded'], 'false')
    assert.equal(header.className, 'game-group-header')
    assert.equal(button.className, 'game-group-toggle d-flex align-items-center gap-3')
    assert.equal(alice.className, 'game-group-member')
    assert.equal(medusa.className, 'game-group-member')
    assert.equal(solo.className, undefined)
    assert.equal(other.className, undefined)
    assert.equal(button.children[1].textContent, 'Unmatched (2)')
    assert.equal(alice.hidden, true)
    assert.equal(medusa.hidden, true)
    assert.equal(solo.hidden, false)
    assert.equal(other.hidden, false)
    button.dispatchEvent({ type: 'click' })
    assert.equal(alice.hidden, false)
    assert.equal(medusa.hidden, false)
    assert.equal(button['aria-expanded'], 'true')
    assert.equal(alice.children[0].children[0].href, 'game.html?id=unmatched_alenka')
    button.dispatchEvent({ type: 'click' })
    assert.equal(alice.hidden, true)
    app.get('game-view-grid').dispatchEvent({ type: 'click' })
    const cards = app.get('game-grid').children
    assert.equal(cards.filter(card => !card.hidden).length, 3)
    const groupCard = cards[1].children[0]
    assert.equal(groupCard.children[0].href, 'index.html?group=unmatched')
    assert.equal(groupCard.children[0].children[0].src, 'groups/unmatched/_cover.jpg')
    const caption = groupCard.children[2].children[1]
    assert.equal(caption.textContent, '2 hry ve skupině')
    assert.equal(caption.children.length, 0)
    const search = app.get('game-search')
    search.value = 'MEDUZA'
    search.dispatchEvent({ type: 'input' })
    assert.equal(header.hidden, false)
    assert.equal(button['aria-expanded'], 'true')
    assert.equal(button.disabled, true)
    assert.equal(alice.hidden, true)
    assert.equal(medusa.hidden, false)
    assert.deepEqual(cards.map(card => card.hidden), [true, true, true, false, true])
    assert.equal(app.get('game-search-count').textContent, 'Zobrazeno 1 z 4 her')
    search.value = 'unmatched'
    search.dispatchEvent({ type: 'input' })
    assert.equal(alice.hidden, false)
    assert.equal(medusa.hidden, false)
    assert.equal(app.get('game-search-count').textContent, 'Zobrazeno 2 z 4 her')
    search.value = 'nenalezeno'
    search.dispatchEvent({ type: 'input' })
    assert.equal(header.hidden, true)
    assert.equal(app.get('game-index-grid').hidden, true)
    search.value = ''
    search.dispatchEvent({ type: 'input' })
    assert.equal(button.disabled, false)
    assert.equal(button['aria-expanded'], 'false')
    assert.equal(alice.hidden, true)
    assert.equal(cards[1].hidden, false)
    assert.equal(requests, 1)
    const css = await read('src/styles/app.css')
    assert.match(css, /\.game-group-toggle\s*\{[^}]*color: var\(--bs-link-color\);[^}]*font: inherit;/)
    assert.match(css, /\.game-group-member > th\s*\{[^}]*padding-inline-start: 2\.5rem;/)
    assert.match(css, /\.game-group-member > th::before\s*\{[^}]*border-inline-start: 2px solid var\(--bs-border-color\);/)
})

test('group game counts use Czech plural forms', async () => {
    const app = page('https://bg.hejki.org/', async () => ({ ok: true, json: async () => [] }))
    await vm.runInContext(indexSource, app.context)
    for (const [count, expected] of [[0, '0 her'], [1, '1 hra'], [2, '2 hry'], [3, '3 hry'], [4, '4 hry'], [5, '5 her'], [11, '11 her'], [21, '21 her'], [22, '22 her']]) {
        assert.equal(app.context.formatGameCount(count), expected)
    }
})

test('group overview shows only its games with ordinary detail links in both views', async () => {
    const app = page('https://bg.hejki.org/index.html?group=unmatched', async () => ({ ok: true, json: async () => groupedGames }), new Map([['game-index-view', 'grid']]))
    await vm.runInContext(indexSource, app.context)
    assert.equal(app.get('game-group-header').hidden, false)
    assert.equal(app.get('game-group-title').textContent, 'Unmatched')
    assert.equal(app.context.document.title, 'Unmatched · Game Index')
    const rows = app.get('game-index').children
    assert.equal(rows.length, 2)
    assert.equal(rows[0].children[0].children[0].href, 'game.html?id=unmatched_alenka')
    assert.equal(app.get('game-grid').children.length, 2)
    assert.equal(app.get('game-search-count').textContent, 'Zobrazeno 2 z 2 her')
    app.get('game-view-list').dispatchEvent({ type: 'click' })
    assert.ok(rows.every(row => !row.hidden))
    const missing = page('https://bg.hejki.org/?group=missing', async () => ({ ok: true, json: async () => groupedGames }))
    await vm.runInContext(indexSource, missing.context)
    assert.equal(missing.get('game-index-status').textContent, 'Skupina nebyla nalezena.')
    assert.equal(missing.get('game-index').children.length, 0)
})

test('catalogue groups are directories with metadata and a dedicated JPEG, not fields on games', async () => {
    const files = await gameFiles()
    const unmatched = files.filter(file => file.startsWith('data/unmatched/'))
    assert.ok(unmatched.length > 1)
    const directories = await fs.readdir(new URL('../data/', import.meta.url), { withFileTypes: true })
    const groupNames = YAML.parse(await read('data/_groups.yaml'))
    for (const dir of directories.filter(entry => entry.isDirectory())) {
        assert.ok(groupNames[dir.name]?.trim(), dir.name)
        await fs.access(new URL(`../data/${dir.name}/_cover.jpg`, import.meta.url))
    }
    const ids = files.map(file => path.basename(file, '.yaml'))
    assert.equal(new Set(ids).size, ids.length)
    for (const file of files) {
        const game = YAML.parse(await read(file))
        assert.equal(game.group, undefined, file)
        await fs.access(new URL(`../${file.slice(0, -5)}.jpg`, import.meta.url))
    }
})

test('detail loads the requested game, its metadata and BGStats link', async () => {
    const game = YAML.parse(await read('data/deskovkari.yaml'))
    const app = page('https://bg.hejki.org/game.html?id=deskovkari', async url => {
        assert.equal(url, 'games/deskovkari/data.json')
        return { ok: true, json: async () => game }
    })
    await vm.runInContext(detailSource, app.context)
    assert.equal(app.get('game-title').textContent, game.name)
    assert.equal(app.get('players-value').textContent, game.players)
    assert.equal(app.get('playtime-value').textContent, game.playtime)
    assert.equal(app.get('hero').style.backgroundImage, "url('games/deskovkari/title.jpg')")
    assert.equal(app.get('start-play-a').href, `bgstats://app.bgstatsapp.com/addPlay.html?gameId=${game.bgg}`)
    assert.equal(app.context.document.title, `${game.name} · Game Index`)
    assert.equal(app.get('game-detail').hidden, false)
    assert.equal(app.get('game-status').hidden, true)
})

test('game links render BGG and ZH first, then typed links with icons and safe labels', async () => {
    const game = {
        name: 'Test', players: '1-4', playtime: '45', weight: 2, description: '',
        bgg: 424774, zh: 'dorfromantik-sakura-16621',
        links: [
            { type: 'video', title: 'Ukázková partie (EN)', url: 'https://www.youtube.com/watch?v=test' },
            { type: 'rules', title: 'Pravidla', url: 'https://example.org/rules.pdf' },
            { type: 'other', title: '<b>Vydavatel & zdroj</b>', url: 'https://example.org/game' },
        ],
    }
    const app = page('https://bg.hejki.org/game.html?id=test', async () => ({ ok: true, json: async () => game }))
    await vm.runInContext(detailSource, app.context)
    const list = app.get('game-links').children[0]
    assert.ok(list.className.includes('list-unstyled'))
    const anchors = list.children.map(item => item.children[0])
    assert.deepEqual(anchors.map(anchor => anchor.children[1].textContent), [
        'BGG', 'Zatrolené hry', 'Ukázková partie (EN)', 'Pravidla', '<b>Vydavatel & zdroj</b>',
    ])
    assert.equal(anchors[0].href, 'https://boardgamegeek.com/boardgame/424774')
    assert.equal(anchors[1].href, 'https://www.zatrolene-hry.cz/spolecenska-hra/dorfromantik-sakura-16621')
    assert.equal(anchors[0].children[0].src, 'https://cf.geekdo-static.com/icons/favicon2.ico')
    assert.equal(anchors[1].children[0].src, 'https://www.zatrolene-hry.cz/graphics/favicon.cz.svg')
    assert.equal(anchors[0].children[0].alt, '')
    assert.equal(anchors[2].children[0].className, 'bi bi-play-btn-fill')
    assert.equal(anchors[3].children[0].className, 'bi bi-journal-bookmark-fill')
    assert.equal(anchors[4].children[0].className, 'bi bi-link-45deg')
    assert.equal(anchors[2].children[0]['aria-hidden'], 'true')
    for (const anchor of anchors) {
        assert.equal(anchor.target, '_blank')
        assert.equal(anchor.rel, 'noopener noreferrer')
    }
    app.context.fillLinks(game)
    assert.equal(app.get('game-links').children.length, 1, 'Re-render replaces the previous list')
})

test('game links tolerate absent optional fields and skip unsafe or invalid URLs', async () => {
    const game = { name: 'Test', players: '2', playtime: '10', weight: 1, description: '', bgg: 1 }
    const app = page('https://bg.hejki.org/game.html?id=test', async () => ({ ok: true, json: async () => game }))
    await vm.runInContext(detailSource, app.context)
    assert.equal(app.get('game-links').children[0].children.length, 1)
    app.context.fillLinks({ links: [
        null,
        { type: 'other', title: 'Script', url: 'javascript:alert(1)' },
        { type: 'other', title: 'Data', url: 'data:text/html,hello' },
        { type: 'other', title: 'Relative', url: '/rules.pdf' },
        { type: 'other', title: 'Invalid', url: 'not a URL' },
        { type: 'other', title: '', url: 'https://example.org/' },
        { type: 'constructor', title: 'Unknown type', url: 'https://example.org/' },
    ] })
    const items = app.get('game-links').children[0].children
    assert.equal(items.length, 1)
    assert.equal(items[0].children[0].children[0].className, 'bi bi-link-45deg')
    app.context.fillLinks({})
    assert.equal(app.get('game-links').children[0].children.length, 0)
})

test('catalogue links follow the documented schema', async () => {
    for (const file of await gameFiles()) {
        const game = YAML.parse(await read(file))
        if (game.links === undefined) continue
        assert.ok(Array.isArray(game.links), file)
        for (const link of game.links) {
            assert.ok(['rules', 'video', 'other'].includes(link.type), file)
            assert.equal(typeof link.title, 'string', file)
            assert.ok(link.title.trim(), file)
            assert.equal(typeof link.url, 'string', file)
            assert.ok(['http:', 'https:'].includes(new URL(link.url).protocol), file)
        }
    }
})

test('Unmatched Adventures keeps character links within their description sections', async () => {
    const adventures = YAML.parse(await read('data/unmatched/unmatched_adventures.yaml'))
    for (const [name, slug] of [['Annie Christmas', 'annie-christmas'], ['Jill Trent', 'dr-jill-trent'], ['Nikola Tesla', 'nikola-tesla'], ['Zlatý netopýr', 'golden-bat']]) {
        const section = adventures.description.split(`## ${name}\n`)[1]?.split('\n## ')[0]
        assert.ok(section, name)
        assert.ok(section.includes(`https://www.the-unmatched.club/heroes/${slug}`), name)
        assert.ok(section.includes(`https://unmatched.cards/umdb/decks/${slug}`), name)
    }
})

test('missing ID returns to the index; invalid IDs and unavailable data show an error', async () => {
    const missing = page('https://bg.hejki.org/game.html', () => { throw new Error('Unexpected fetch') })
    await vm.runInContext(detailSource, missing.context)
    assert.equal(missing.redirect(), './')
    for (const id of ['../bad', 'missing']) {
        const app = page(`https://bg.hejki.org/game.html?id=${encodeURIComponent(id)}`, async () => ({ ok: false }))
        app.get('game-navbar').classList.add('navbar-overlay')
        await vm.runInContext(detailSource, app.context)
        assert.match(app.get('game-status').textContent, /nepodařilo načíst/)
        assert.equal(app.get('game-detail').hidden, true)
        assert.equal(app.get('game-navbar').classList.contains('navbar-overlay'), false)
    }
    const index = page('https://bg.hejki.org/', async () => ({ ok: false }))
    await vm.runInContext(indexSource, index.context)
    assert.match(index.get('game-index-status').textContent, /nepodařilo načíst/)
})

test('navbar tools menus include all games even in a group and deduplicate shared tools', async () => {
    const games = [
        { id: 'member', name: 'Člen skupiny', group: 'collection', groupName: 'Skupina' },
        { id: 'clocktower', name: 'Krvavá hodina odbila', tools: [{ link: '/botc-play.html', icon: 'bi bi-journal-bookmark' }] },
        { id: 'duplicate', name: 'Další hra', tools: [{ link: '/botc-play.html', icon: 'bi bi-journal-bookmark' }] },
        { id: 'other', name: 'Jiná hra', tools: [{ title: 'Další nástroj', link: '/other.html', icon: 'bi bi-dice' }] },
    ]
    const app = page('https://bg.hejki.org/?group=collection', async () => ({ ok: true, json: async () => games }))
    await vm.runInContext(indexSource, app.context)
    for (const prefix of ['index-tools', 'index-tools-mobile']) {
        const menu = app.get(`${prefix}-menu`)
        assert.equal(app.get(`${prefix}-toggle`).disabled, false)
        assert.deepEqual(menu.children.map(link => link.href), ['/botc-play.html', '/other.html'])
        assert.deepEqual(menu.children.map(link => link.children[1].textContent), [' Krvavá hodina odbila', ' Další nástroj'])
        assert.ok(menu.children.every(link => link.className === 'menu-item'))
    }
    app.get('game-search').value = 'nenalezeno'
    app.get('game-search').dispatchEvent({ type: 'input' })
    assert.equal(app.get('index-tools-menu').children.length, 2)
    const empty = page('https://bg.hejki.org/', async () => ({ ok: true, json: async () => [] }))
    await vm.runInContext(indexSource, empty.context)
    assert.equal(empty.get('index-tools-toggle').disabled, true)
    assert.equal(empty.get('index-tools-mobile-toggle').disabled, true)
    const html = await read('src/index.html')
    for (const prefix of ['index-tools', 'index-tools-mobile']) {
        assert.match(html, new RegExp(`id="${prefix}-toggle"[^>]*data-bs-toggle="menu"[^>]*aria-expanded="false"[^>]*aria-controls="${prefix}-menu"`))
        assert.match(html, new RegExp(`id="${prefix}-menu" class="menu" aria-labelledby="${prefix}-toggle"`))
    }
    assert.match(html, /Game Index <i class="bi bi-chevron-down"/)
    const settings = html.slice(html.indexOf('<div id="index-settings"'))
    assert.match(settings, /class="md:d-none"[\s\S]*id="index-tools-mobile-toggle"[\s\S]*Nástroje/)
})

test('navbar search has a search-icon input group without grid sizing and grouped view buttons', async () => {
    const html = await read('src/index.html')
    const navbar = html.match(/<nav\b[\s\S]*?<\/nav>/)[0]
    assert.match(navbar, /class="navbar index-navbar sticky-top/)
    const css = await read('src/styles/app.css')
    assert.match(css, /\.index-navbar\s*\{\s*z-index: 1030;\s*\}/)
    assert.match(navbar, /<div class="index-search flex-fill md:flex-grow-0">/)
    assert.match(navbar, /class="input-group-text"><i class="bi bi-search" aria-hidden="true"/)
    assert.match(navbar, /class="btn-group" role="group" aria-label="Zobrazení her"/)
    assert.match(navbar, /class="btn-text md:d-none" data-bs-toggle="collapse" data-bs-target="#index-settings" aria-expanded="false" aria-controls="index-settings"/)
    const settings = navbar.slice(navbar.indexOf('<div id="index-settings"'))
    assert.match(settings, /class="collapse index-settings"/)
    for (const id of ['game-view-list', 'game-view-grid', 'color-mode-toggle', 'color-mode-menu']) {
        assert.ok(settings.includes(`id="${id}"`))
        assert.equal((navbar.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1)
    }
    assert.match(navbar, /<label for="game-search"/)
    assert.match(navbar, /id="game-search" type="search"/)
    assert.equal((html.match(/id="game-search"/g) || []).length, 1)
    assert.doesNotMatch(html.match(/<main\b[\s\S]*?<\/main>/)[0], /id="game-search"/)
})

test('both pages have valid local assets and the appropriate navbar', async () => {
    const index = await read('src/index.html')
    const detail = await read('src/game.html')
    assert.ok(!index.includes('id="game-detail"'))
    assert.ok(!detail.includes('navbar-brand'))
    assert.match(detail, /href="\.\/" class="navbar-back/)
    for (const html of [index, detail]) {
        assert.match(html, /id="color-mode-toggle"/)
        for (const [, asset] of html.matchAll(/(?:src|href)="((?:scripts|styles)\/[^\"]+)"/g)) {
            await read(`src/${asset}`)
        }
    }
})
