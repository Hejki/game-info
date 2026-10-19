import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import YAML from 'yaml'

const read = file => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8')
const legacySource = await read('src/scripts/legacy-links.js')
const indexSource = await read('src/scripts/game-index.js')
const detailSource = await read('src/scripts/game-detail.js')

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

function page(url, fetch) {
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
            marked: { parse: text => `<p>${text}</p>` }, console: { error() {} },
        }),
        get: id => document.getElementById(id),
        redirect: () => redirect,
    }
}

test('legacy links redirect to the same game without adding a history entry', async () => {
    const files = await fs.readdir(new URL('../data/', import.meta.url))
    const ids = files.filter(file => file.endsWith('.yaml')).map(file => file.slice(0, -5))
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

test('catalogue links follow the documented schema and are separate from descriptions', async () => {
    const files = await fs.readdir(new URL('../data/', import.meta.url))
    for (const file of files.filter(file => file.endsWith('.yaml'))) {
        const game = YAML.parse(await read(`data/${file}`))
        assert.doesNotMatch(game.description, /^\s*[-*] \[.+\]\(https?:\/\/.+\)\s*$/m, file)
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
    const adventures = YAML.parse(await read('data/unmatched_adventures.yaml'))
    for (const name of ['Annie Christmas', 'Jill Trent', 'Nikola Tesla', 'Zlatý netopýr']) {
        assert.equal(adventures.links.filter(link => link.title.endsWith(`– ${name}`)).length, 2)
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
