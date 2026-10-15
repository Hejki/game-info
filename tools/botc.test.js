import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const html = await fs.readFile(new URL('../src/botc-play.html', import.meta.url), 'utf8')
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1]

function element(className = '') {
    const el = { className, value: '', hidden: true, attributes: {}, innerHTML: '' }
    el.classList = {
        contains: name => el.className.split(/\s+/).includes(name),
        add(...names) { el.className = [...new Set([...el.className.split(/\s+/), ...names])].join(' ') },
        remove(...names) { el.className = el.className.split(/\s+/).filter(name => !names.includes(name)).join(' ') },
        toggle(name, active) { active ? this.add(name) : this.remove(name) },
    }
    el.setAttribute = (name, value) => { el.attributes[name] = value }
    el.scrollIntoView = () => {}
    return el
}

function recorder() {
    const elements = new Map()
    const rows = []
    const storytellers = ['Hejki', 'Amos', ''].map(name => Object.assign(element('st-pill btn-outline theme-primary'), { dataset: { name, uuid: name ? `${name}-uuid` : '' } }))
    const scripts = ['trouble-brewing', 'custom'].map(script => Object.assign(element('script-pill btn-outline theme-primary'), { dataset: { script } }))
    const get = id => {
        if (!elements.has(id)) elements.set(id, element())
        return elements.get(id)
    }
    for (const team of ['good', 'evil']) get(`btn-${team}`).className = `btn-outline theme-${team === 'good' ? 'info' : 'danger'} flex-fill py-5`
    get('players-list').appendChild = row => { rows.push(row); elements.set(row.id, row) }
    let initialize
    const context = vm.createContext({
        document: {
            addEventListener: (event, callback) => { initialize = callback },
            getElementById: get,
            querySelectorAll: selector => selector === '.player-row' ? rows : selector === '.st-pill' ? storytellers : scripts,
            createElement() {
                const row = element()
                row.name = { options: [{ text: 'Test hráč' }], selectedIndex: 0, value: 'player-uuid' }
                row.role = { value: 'Empat' }
                row.roleCell = element()
                row.number = element()
                row.buttons = [element('team-btn btn-outline theme-info'), element('team-btn btn-outline theme-danger')]
                row.querySelector = selector => {
                    if (selector === '.player-name-sel') return row.name
                    if (selector === '.player-role-cell') return row.roleCell
                    if (selector === '.player-num') return row.number
                    return row.role
                }
                row.querySelectorAll = () => row.buttons
                row.remove = () => rows.splice(rows.indexOf(row), 1)
                return row
            },
        },
        alert: message => { throw new Error(message) },
    })
    vm.runInContext(source, context)
    return { context, get, rows, storytellers, scripts, initialize }
}

test('BotC uses Bootstrap components without custom CSS or inline styles', () => {
    assert.match(html, /bootstrap@6\.0\.0-alpha\.1/)
    assert.match(html, /type="module" src="[^"]+bootstrap\.bundle\.min\.js"/)
    assert.match(html, /scripts\/color-mode\.js/)
    assert.doesNotMatch(html, /<style|style=|fonts\.googleapis|btn-gold|btn-blood|active-good|active-evil/)
    assert.match(html, /id="output-section"[^>]*hidden/)
})

test('player rows and role fields keep Bootstrap styling through script and team changes', () => {
    const app = recorder()
    app.initialize()
    assert.equal(app.rows.length, 5)
    const row = app.rows[0]
    assert.match(row.className, /row g-3/)
    assert.match(row.innerHTML, /player-name-sel form-control/)
    assert.match(row.innerHTML, /md:col-3/)
    assert.match(row.innerHTML, /aria-label="Role hráče" disabled/)
    app.context.selectScript(app.scripts[0])
    assert.match(row.roleCell.innerHTML, /select class="form-control"/)
    assert.match(row.roleCell.innerHTML, /Empat/)
    app.context.selectScript(app.scripts[1])
    assert.match(row.roleCell.innerHTML, /input class="form-control"/)
    assert.equal(app.scripts[1].attributes['aria-pressed'], 'true')
    assert.equal(app.scripts[0].attributes['aria-pressed'], 'false')
    app.context.setPlayerTeam(1, 'good', row.buttons[0])
    assert.ok(row.classList.contains('border-info'))
    app.context.setPlayerTeam(1, 'evil', row.buttons[1])
    assert.ok(row.classList.contains('border-danger'))
    assert.ok(!row.classList.contains('border-info'))
    assert.equal(row.buttons[1].attributes['aria-pressed'], 'true')
    assert.equal(row.buttons[0].attributes['aria-pressed'], 'false')
    app.context.removePlayer(1)
    assert.equal(app.rows.length, 4)
    assert.equal(app.rows[0].number.textContent, 1)
})

test('storyteller visibility, winner styling and BGStats export remain functional', () => {
    const app = recorder()
    app.initialize()
    app.context.selectST(app.storytellers[2])
    assert.equal(app.get('st-other-wrap').hidden, false)
    app.context.selectST(app.storytellers[0])
    assert.equal(app.get('st-other-wrap').hidden, true)
    assert.equal(app.storytellers[0].attributes['aria-pressed'], 'true')
    app.context.selectScript(app.scripts[0])
    app.context.setPlayerTeam(1, 'good', app.rows[0].buttons[0])
    app.context.setPlayerTeam(2, 'evil', app.rows[1].buttons[1])
    app.get('play-start').value = '23:30'
    app.get('play-end').value = '00:45'
    app.get('play-location').value = 'Doma'
    app.get('play-comment').value = 'Test'
    app.context.calcDuration()
    assert.equal(app.get('duration-display').textContent, '1 h 15 min')
    for (const team of ['good', 'evil']) {
        app.context.setWinner(team)
        assert.ok(app.get(`btn-${team}`).classList.contains('btn-outline'))
        assert.ok(app.get(`btn-${team}`).classList.contains('active'))
        assert.equal(app.get(`btn-${team}`).attributes['aria-pressed'], 'true')
        app.context.generate()
        const exported = vm.runInContext('generatedData', app.context)
        assert.equal(exported.plays[0].durationMin, 75)
        assert.equal(exported.plays[0].playerScores[0].winner, false)
        assert.equal(exported.plays[0].playerScores[1].winner, team === 'good')
        assert.equal(exported.plays[0].playerScores[2].winner, team === 'evil')
        assert.equal(exported._createPlay.players[1].winner, team === 'good')
        assert.equal(exported._createPlay.players[2].winner, team === 'evil')
        assert.equal(app.get('output-section').hidden, false)
    }
})
