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
            window: { location }, document, fetch, URLSearchParams,
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
