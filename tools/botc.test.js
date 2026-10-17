import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const html = await fs.readFile(new URL('../src/botc-play.html', import.meta.url), 'utf8')
const source = await fs.readFile(new URL('../src/scripts/botc-play.js', import.meta.url), 'utf8')
const playExample = JSON.parse(await fs.readFile(new URL('./play-example.bgsplay', import.meta.url), 'utf8'))

test('BotC loads recorder logic from an external classic script before DOMContentLoaded', () => {
    assert.match(html, /<script src="scripts\/botc-play\.js"><\/script>/)
    for (const [, content] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
        assert.equal(content.trim(), '')
    }
})

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
    const scripts = []
    const downloads = []
    const blobs = []
    const shares = []
    const navigator = { canShare: () => true, share: async data => { shares.push(data) } }
    const window = { location: { href: '' }, open() {} }
    const get = id => {
        if (!elements.has(id)) elements.set(id, element())
        return elements.get(id)
    }
    for (const team of ['good', 'evil']) get(`btn-${team}`).className = `btn-outline theme-${team === 'good' ? 'info' : 'danger'}`
    get('players-list').appendChild = row => { rows.push(row); elements.set(row.id, row) }
    get('script-buttons').appendChild = button => { scripts.push(button) }
    get('play-location').options = []
    get('play-location').replaceChildren = () => { get('play-location').options = [] }
    get('play-location').appendChild = option => { get('play-location').options.push(option) }
    get('play-game-copy').options = []
    get('play-game-copy').replaceChildren = () => { get('play-game-copy').options = [] }
    get('play-game-copy').appendChild = option => { get('play-game-copy').options.push(option) }
    let initialize
    const context = vm.createContext({
        document: {
            addEventListener: (event, callback) => { initialize = callback },
            getElementById: get,
            querySelectorAll: selector => selector === '.player-row' ? rows : scripts,
            createElement(tag) {
                if (tag === 'button' || tag === 'option') return Object.assign(element(), { dataset: {} })
                if (tag === 'a') {
                    const anchor = element()
                    anchor.click = () => downloads.push(anchor)
                    return anchor
                }
                const row = element()
                row.name = { value: '', focused: false, focus() { this.focused = true } }
                row.role = { value: '' }
                row.roleCell = element()
                row.number = element()
                row.buttons = ['good', 'evil'].map(team => Object.assign(element('team-btn btn-subtle'), { dataset: { team } }))
                row.querySelector = selector => {
                    if (selector === '.player-name-input') return row.name
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
        Blob,
        File,
        navigator,
        URL: { createObjectURL: blob => { blobs.push(blob); return `blob:test-${blobs.length}` } },
        window,
        setTimeout() {},
    })
    vm.runInContext(source, context)
    return { context, get, rows, scripts, initialize, downloads, blobs, window, navigator, shares }
}

test('all named players from the BGStats example are known with their original UUIDs', () => {
    const app = recorder()
    app.initialize()
    const known = vm.runInContext('KNOWN_PLAYERS', app.context)
    assert.equal(new Set(known.map(player => player.uuid)).size, known.length)
    for (const player of playExample.players) {
        if (player.isAnonymous) {
            assert.ok(!known.some(candidate => candidate.uuid === player.uuid))
            continue
        }
        const actual = app.context.resolvePlayerName(player.name)
        assert.equal(actual.name, player.name)
        assert.equal(actual.uuid, player.uuid)
        assert.equal(actual.isAnon, false)
        assert.ok(app.get('known-players').innerHTML.includes(`<option value="${player.name}"></option>`))
    }
})

test('recorder reproduces the game, participants, roles, teams and winners from the BGStats example', () => {
    const app = recorder()
    app.initialize()
    const example = playExample.plays[0]
    const game = playExample.games.find(game => game.id === example.gameRefId)
    const participants = example.playerScores.map(score => {
        const player = playExample.players.find(player => player.id === score.playerRefId)
        assert.ok(player, `Player reference ${score.playerRefId} exists`)
        return { score, player, name: score.anonymousName || player.name }
    })
    const storyteller = participants.find(({ score }) => score.role === 'Vypravěč')
    const players = participants.filter(participant => participant !== storyteller)
    assert.ok(storyteller)
    app.get('storyteller-name').value = storyteller.name
    const script = app.scripts.find(button => button.textContent === example.board)
    assert.ok(script)
    script.onclick()
    while (app.rows.length < players.length) app.context.addPlayer()
    players.forEach(({ score, name }, index) => {
        const row = app.rows[index]
        row.name.value = name
        row.role.value = score.teamRole || ''
        const team = score.team === '1' ? 'good' : 'evil'
        app.context.setPlayerTeam(Number(row.id.slice(7)), team, row.buttons[team === 'good' ? 0 : 1])
    })
    const winningTeams = new Set(players.filter(({ score }) => score.winner).map(({ score }) => score.team))
    assert.equal(winningTeams.size, 1)
    app.context.setWinner([...winningTeams][0] === '1' ? 'good' : 'evil')
    app.get('play-date').value = example.playDate.slice(0, 10)
    app.get('play-start').value = example.playDate.slice(11, 16)
    const [hours, minutes] = app.get('play-start').value.split(':').map(Number)
    const end = (hours * 60 + minutes + example.durationMin) % 1440
    app.get('play-end').value = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
    app.context.calcDuration()
    app.context.generate()
    const exported = JSON.parse(vm.runInContext('JSON.stringify(generatedData)', app.context))
    const actualPlay = exported.plays[0]
    assert.equal(exported.games.find(game => game.id === actualPlay.gameRefId).bggId, game.bggId)
    assert.equal(actualPlay.playDate.slice(0, 16), example.playDate.slice(0, 16))
    assert.equal(actualPlay.durationMin, example.durationMin)
    assert.equal(actualPlay.usesTeams, example.usesTeams)
    assert.equal(exported._createPlay.board, example.board)
    assert.equal(actualPlay.board, example.board)
    assert.ok(!actualPlay.comments?.includes('Skript:'))
    const expected = [storyteller, ...players]
    assert.equal(actualPlay.playerScores.length, expected.length)
    actualPlay.playerScores.forEach((score, index) => {
        const participant = expected[index]
        const player = exported.players.find(player => player.id === score.playerRefId)
        assert.ok(player)
        assert.equal(player.name, participant.name)
        assert.equal(player.isAnonymous, participant.player.isAnonymous)
        assert.equal(score.anonymousName, player.isAnonymous ? participant.name : undefined)
        if (!player.isAnonymous) assert.equal(player.uuid, participant.player.uuid)
        for (const field of ['role', 'team', 'winner', 'startPlayer']) {
            assert.equal(score[field], participant.score[field], `${participant.name}: ${field}`)
        }
        assert.equal(score.teamRole, participant.score.teamRole)
        assert.equal(JSON.parse(score.metaData || '{}').isNpc || 0, JSON.parse(participant.score.metaData || '{}').isNpc || 0)
    })
})

test('BGStats file import restores the example and preserves its participants on re-export', () => {
    const app = recorder()
    app.initialize()
    app.context.importBgsplay(playExample)
    assert.equal(app.rows.length, 19)
    assert.equal(app.get('storyteller-name').value, 'Amos')
    assert.equal(app.get('play-date').value, '2026-10-17')
    assert.equal(app.get('play-start').value, '13:21')
    assert.equal(app.get('play-end').value, '15:32')
    assert.equal(app.get('duration-display').textContent, '2 h 11 min')
    const actual = JSON.parse(JSON.stringify(app.context.generate()))
    assert.equal(actual.plays[0].board, playExample.plays[0].board)
    assert.equal(actual.plays[0].durationMin, 131)
    const normalize = data => data.plays[0].playerScores.map(score => {
        const player = data.players.find(player => player.id === score.playerRefId)
        return {
            name: score.anonymousName || player.name,
            uuid: player.isAnonymous ? null : player.uuid,
            isAnonymous: player.isAnonymous,
            role: score.role,
            teamRole: score.teamRole || '',
            team: score.team,
            winner: score.winner,
        }
    }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    assert.deepEqual(normalize(actual), normalize(playExample))
    assert.match(html, /id="import-play"[^>]*onchange="importBgsplayFile\(this\)"/)
})

test('import preserves unknown UUIDs, anonymous names matching known players and custom scripts', () => {
    const app = recorder()
    app.initialize()
    const data = structuredClone(playExample)
    data.plays[0].board = 'Můj vlastní skript'
    const amos = data.players.find(player => player.name === 'Amos')
    amos.uuid = 'external-amos-uuid'
    const anonymousScore = data.plays[0].playerScores.find(score => score.anonymousName === 'Emička')
    anonymousScore.anonymousName = 'Hejki'
    anonymousScore.teamRole = 'Vlastní role'
    app.context.importBgsplay(data)
    const exported = app.context.generate()
    assert.equal(exported.plays[0].board, 'Můj vlastní skript')
    assert.equal(exported.players[0].uuid, 'external-amos-uuid')
    const index = exported.plays[0].playerScores.findIndex(score => score.teamRole === 'Vlastní role')
    assert.equal(exported.players[index].name, 'Hejki')
    assert.equal(exported.players[index].isAnonymous, true)
    app.get('storyteller-name').value = 'Honza'
    assert.equal(app.context.getPlayerData()[0].uuid, '3599F903-5175-4B6D-AA52-F1DCACA8486D')
    app.scripts[0].onclick()
    assert.equal(app.context.generate().plays[0].board, 'Potíže přicházejí')
})

test('invalid imports leave the current form intact and file errors are displayed', async () => {
    const app = recorder()
    app.initialize()
    app.rows[0].name.value = 'Hejki'
    const original = JSON.stringify(app.context.getPlayerData())
    const invalid = [null, {}, { ...playExample, plays: [] }, { ...playExample, plays: [playExample.plays[0], playExample.plays[0]] }]
    for (const change of [
        data => { data.games[0].bggId = 1 },
        data => { data.plays[0].playerScores[0].playerRefId = -1 },
        data => { data.plays[0].playDate = 'invalid' },
        data => { data.plays[0].durationMin = -10 },
        data => { data.plays[0].playerScores = [] },
    ]) {
        const data = structuredClone(playExample)
        change(data)
        invalid.push(data)
    }
    for (const data of invalid) {
        assert.throws(() => app.context.importBgsplay(data))
        assert.equal(JSON.stringify(app.context.getPlayerData()), original)
    }
    const fileInput = { files: [{ text: async () => 'not JSON' }], value: 'bad.bgsplay' }
    await app.context.importBgsplayFile(fileInput)
    assert.match(app.get('import-status').textContent, /Import se nezdařil/)
    assert.equal(app.get('import-status').hidden, false)
    assert.equal(fileInput.value, '')
    fileInput.files = [{ text: async () => JSON.stringify(playExample) }]
    await app.context.importBgsplayFile(fileInput)
    assert.match(app.get('import-status').textContent, /Partie načtena \(19 hráčů\)/)
})

test('import is opened by an accessible icon in the metadata header and uses a Bootstrap dialog', () => {
    const metadata = html.match(/<section[^>]*aria-labelledby="metadata-title"[\s\S]*?<\/section>/)[0]
    const header = metadata.match(/<div class="card-header[\s\S]*?<\/div>/)[0]
    assert.match(header, /card-header d-flex flex-row flex-nowrap align-items-center/)
    assert.match(header, /class="btn-text ms-auto" data-bs-toggle="dialog" data-bs-target="#import-dialog"/)
    assert.match(header, /aria-label="Načíst partii z BGStats"/)
    assert.match(header, /bi bi-upload/)
    assert.doesNotMatch(metadata, /type="file"/)
    const dialog = html.match(/<dialog id="import-dialog"[\s\S]*?<\/dialog>/)[0]
    assert.match(dialog, /class="dialog" aria-labelledby="import-dialog-title" aria-describedby="import-dialog-description"/)
    assert.match(dialog, /id="import-play"/)
    assert.match(dialog, /id="import-status"/)
    assert.match(dialog, /data-bs-dismiss="dialog" aria-label="Zavřít"/)
    assert.equal((html.match(/id="import-play"/g) || []).length, 1)
})

test('game title is centered in the navbar', () => {
    const navbar = html.match(/<nav\b[\s\S]*?<\/nav>/)[0]
    assert.match(navbar, /<h1 class="col-6 text-center fs-lg mb-0">Krvavá hodina odbyla<\/h1>/)
    assert.equal((navbar.match(/class="col-3\b/g) || []).length, 2)
    assert.equal((html.match(/<h1\b/g) || []).length, 1)
})

test('BotC uses Bootstrap components without custom CSS or inline styles', () => {
    assert.match(html, /bootstrap@6\.0\.0-alpha\.1/)
    assert.match(html, /type="module" src="[^"]+bootstrap\.bundle\.min\.js"/)
    assert.match(html, /scripts\/color-mode\.js/)
    assert.doesNotMatch(html, /<style|style=|fonts\.googleapis|btn-gold|btn-blood|active-good|active-evil/)
    assert.doesNotMatch(html, /id="output-section"|id="json-preview"|onclick="generate\(\)"/)
    assert.doesNotMatch(html, /id="play-comment"/)
    assert.doesNotMatch(source, /getElementById\('play-comment'\)/)
})

test('script buttons, role options and export names come from SCRIPTS', () => {
    const app = recorder()
    vm.runInContext(`SCRIPTS.push({ id: 'test-script', name: 'Testovací skript', roles: { townsfolk: ['Testovací role'] } })`, app.context)
    app.initialize()
    assert.doesNotMatch(html, /data-script=/)
    const metadata = html.match(/<section[^>]*aria-labelledby="metadata-title"[\s\S]*?<\/section>/)[0]
    assert.match(metadata, /id="script-buttons"/)
    assert.doesNotMatch(html, /id="script-title"/)
    const definitions = vm.runInContext('SCRIPTS', app.context)
    assert.equal(app.scripts.length, definitions.length)
    app.context.setWinner('good')
    definitions.forEach((script, index) => {
        const button = app.scripts[index]
        assert.equal(button.dataset.script, script.id)
        assert.equal(button.textContent, script.name)
        button.onclick()
        assert.equal(button.attributes['aria-pressed'], 'true')
        if (script.id === 'custom') {
            assert.match(app.rows[0].roleCell.innerHTML, /type="text"/)
        } else {
            for (const roles of Object.values(script.roles)) {
                for (const role of roles) assert.ok(app.rows[0].roleCell.innerHTML.includes(`<option value="${role}">${role}</option>`))
            }
        }
        app.context.generate()
        const exported = vm.runInContext('generatedData', app.context)
        assert.equal(exported._createPlay.board, script.name)
        assert.equal(exported.plays[0].board, script.name)
        assert.ok(!exported.plays[0].comments?.includes('Skript:'))
    })
})

test('player rows and role fields keep Bootstrap styling through script and team changes', () => {
    const app = recorder()
    app.initialize()
    assert.equal(app.rows.length, 8)
    const row = app.rows[0]
    assert.match(row.className, /row g-3/)
    assert.match(row.innerHTML, /<input class="player-name-input form-control" type="text" list="known-players"/)
    assert.match(row.innerHTML, /player-role-cell col-12 md:col"/)
    assert.match(row.innerHTML, /col-auto d-flex flex-nowrap flex-shrink-0 gap-1 ms-auto/)
    assert.match(row.innerHTML, /aria-label="Role hráče" disabled/)
    app.context.selectScript(app.scripts[0])
    assert.match(row.roleCell.innerHTML, /select class="form-control"/)
    assert.match(row.roleCell.innerHTML, /Empat/)
    app.context.selectScript(app.scripts[3])
    assert.match(row.roleCell.innerHTML, /input class="form-control"/)
    assert.equal(app.scripts[3].attributes['aria-pressed'], 'true')
    assert.equal(app.scripts[0].attributes['aria-pressed'], 'false')
    app.context.setPlayerTeam(1, 'good', row.buttons[0])
    assert.ok(row.classList.contains('bg-info'))
    app.context.setPlayerTeam(1, 'evil', row.buttons[1])
    assert.ok(row.classList.contains('bg-danger'))
    assert.ok(!row.classList.contains('bg-info'))
    assert.equal(row.buttons[1].attributes['aria-pressed'], 'true')
    assert.equal(row.buttons[0].attributes['aria-pressed'], 'false')
    app.context.removePlayer(1)
    assert.equal(app.rows.length, 7)
    assert.equal(app.rows[0].number.textContent, 1)
})

test('role selection always updates teams except for travellers', () => {
    const app = recorder()
    app.initialize()
    const definitions = vm.runInContext('SCRIPTS', app.context)
    for (const script of definitions.filter(script => script.id !== 'custom')) {
        app.context.selectScript(app.scripts.find(button => button.dataset.script === script.id))
        assert.match(app.rows[0].roleCell.innerHTML, /onchange="autoSelectPlayerTeam\(1,this.value\)"/)
        for (const [type, roles] of Object.entries(script.roles)) {
            app.context.addPlayer()
            const row = app.rows.at(-1)
            const id = Number(row.id.slice(7))
            assert.match(row.innerHTML, new RegExp(`onchange="autoSelectPlayerTeam\\(${id},this.value\\)"`))
            app.context.autoSelectPlayerTeam(id, '')
            app.context.autoSelectPlayerTeam(id, 'Neznámá role')
            assert.ok(!row.classList.contains('is-good') && !row.classList.contains('is-evil'))
            app.context.autoSelectPlayerTeam(id, roles[0])
            const team = { townsfolk: 'good', outsider: 'good', minion: 'evil', demon: 'evil' }[type]
            if (!team) {
                assert.ok(!row.classList.contains('is-good') && !row.classList.contains('is-evil'))
                continue
            }
            assert.ok(row.classList.contains(`is-${team}`))
            assert.equal(row.buttons[team === 'good' ? 0 : 1].attributes['aria-pressed'], 'true')
            const opposite = team === 'good' ? 'evil' : 'good'
            app.context.autoSelectPlayerTeam(id, script.roles[team === 'good' ? 'demon' : 'townsfolk'][0])
            assert.ok(row.classList.contains(`is-${opposite}`))
            app.context.setPlayerTeam(id, opposite, row.buttons[opposite === 'good' ? 0 : 1])
            app.context.autoSelectPlayerTeam(id, roles[0])
            assert.ok(row.classList.contains(`is-${team}`))
            assert.ok(!row.classList.contains(`is-${opposite}`))
            app.context.autoSelectPlayerTeam(id, script.roles.traveller[0])
            assert.ok(row.classList.contains(`is-${team}`))
        }
    }
    assert.equal(app.rows.filter(row => row.classList.contains('is-good') || row.classList.contains('is-evil')).length, 12)
})

test('townsfolk and demons use bg-30; other roles use bg-10 regardless of team', () => {
    const app = recorder()
    app.initialize()
    const row = app.rows[0]
    assert.ok(row.classList.contains('bg-10'))
    const definitions = vm.runInContext('SCRIPTS', app.context)
    for (const script of definitions.filter(script => script.id !== 'custom')) {
        app.context.selectScript(app.scripts.find(button => button.dataset.script === script.id))
        for (const [type, names] of Object.entries(script.roles)) {
            const emphasized = type === 'townsfolk' || type === 'demon'
            app.context.autoSelectPlayerTeam(1, names[0])
            assert.equal(row.classList.contains('bg-30'), emphasized)
            assert.equal(row.classList.contains('bg-10'), !emphasized)
            app.context.setPlayerTeam(1, 'evil', row.buttons[1])
            assert.equal(row.classList.contains('bg-30'), emphasized)
            assert.equal(row.classList.contains('bg-10'), !emphasized)
        }
        app.context.autoSelectPlayerTeam(1, script.roles.townsfolk[0])
        app.context.autoSelectPlayerTeam(1, '')
        assert.ok(row.classList.contains('bg-10'))
        assert.ok(!row.classList.contains('bg-30'))
    }
    app.context.autoSelectPlayerTeam(1, definitions[2].roles.demon[0])
    app.context.selectScript(app.scripts[3])
    assert.ok(row.classList.contains('bg-10'))
    assert.ok(!row.classList.contains('bg-30'))
})

test('summary counts selected role types, not teams, and includes travellers only in total', () => {
    const app = recorder()
    app.initialize()
    assert.equal(app.get('summary-bar').textContent, '8: 0/0/0/0')
    app.context.selectScript(app.scripts[0])
    const roles = vm.runInContext('SCRIPTS[0].roles', app.context)
    Object.values(roles).forEach((names, index) => {
        app.rows[index].role.value = names[0]
        app.context.autoSelectPlayerTeam(index + 1, names[0])
    })
    assert.equal(app.get('summary-bar').textContent, '8: 1/1/1/1')
    app.context.setPlayerTeam(1, 'evil', app.rows[0].buttons[1])
    assert.equal(app.get('summary-bar').textContent, '8: 1/1/1/1')
    app.rows[0].role.value = ''
    app.context.autoSelectPlayerTeam(1, '')
    assert.equal(app.get('summary-bar').textContent, '8: 0/1/1/1')
    app.rows[1].role.value = roles.traveller[0]
    app.context.autoSelectPlayerTeam(2, roles.traveller[0])
    assert.equal(app.get('summary-bar').textContent, '8: 0/0/1/1')
    app.context.removePlayer(4)
    assert.equal(app.get('summary-bar').textContent, '7: 0/0/1/0')
    app.context.selectScript(app.scripts[3])
    assert.equal(app.get('summary-bar').textContent, '7: 0/0/0/0')
})

test('player name suggestions allow known, custom and anonymous players without stale UUIDs', () => {
    const app = recorder()
    app.initialize()
    assert.match(html, /<datalist id="known-players"><\/datalist>/)
    const suggestions = app.get('known-players').innerHTML
    assert.ok(!suggestions.includes('Anonym'))
    for (const player of vm.runInContext('KNOWN_PLAYERS', app.context)) {
        assert.ok(suggestions.includes(`<option value="${player.name}"></option>`))
    }
    app.rows[0].name.value = '  hEjKi  '
    app.rows[1].name.value = '  Nový hráč  '
    app.rows[2].name.value = '   '
    app.rows[3].name.value = 'anonym'
    let data = app.context.getPlayerData()
    assert.equal(data[1].name, 'Hejki')
    assert.equal(data[1].uuid, '88649452-76BB-4912-8271-25C1CF6C8B21')
    assert.equal(data[1].isAnon, false)
    assert.equal(data[2].name, 'Nový hráč')
    assert.equal(data[2].uuid, null)
    assert.equal(data[2].isAnon, true)
    assert.equal(data[3].name, '')
    assert.equal(data[4].name, 'anonym')
    for (const player of data.slice(3, 5)) {
        assert.equal(player.isAnon, true)
        assert.equal(player.uuid, null)
    }
    app.rows[0].name.value = 'Někdo jiný'
    data = app.context.getPlayerData()
    assert.equal(data[1].name, 'Někdo jiný')
    assert.equal(data[1].uuid, null)
    assert.equal(data[1].isAnon, true)
    app.rows[0].name.value = 'Amos'
    app.context.setWinner('good')
    app.context.generate()
    const exported = vm.runInContext('generatedData', app.context)
    assert.equal(exported.players[1].name, 'Amos')
    assert.equal(exported.players[1].uuid, '03A51045-50EC-4B7F-9C16-E4D11C81138B')
    assert.equal(exported._createPlay.players[1].sourcePlayerId, exported.players[1].uuid)
    assert.equal(exported.players[2].name, 'Nový hráč')
    assert.equal(exported.players[2].isAnonymous, true)
    assert.equal(exported.plays[0].playerScores[2].anonymousName, 'Nový hráč')
    assert.equal(exported.plays[0].playerScores[1].anonymousName, undefined)
    assert.equal(exported._createPlay.players[2].name, 'Nový hráč')
    assert.equal(exported._createPlay.players[2].sourcePlayerId, undefined)
})

test('storyteller uses shared suggestions and exports known, unknown and empty names', () => {
    const app = recorder()
    app.initialize()
    assert.match(html, /id="storyteller-name" list="known-players"/)
    assert.doesNotMatch(html, /id="storyteller-title"/)
    assert.match(html, /id="players-list"[^>]*>\s*<div id="storyteller-row"/)
    assert.match(html, /<label for="storyteller-name" class="player-num [^"]*">Vypravěč<\/label>/)
    assert.doesNotMatch(html.match(/<div id="storyteller-row"[^>]*>/)[0], /player-row/)
    for (const [value, name, uuid, isAnonymous] of [
        ['  hEjKi  ', 'Hejki', '88649452-76BB-4912-8271-25C1CF6C8B21', false],
        ['  Nový vypravěč  ', 'Nový vypravěč', null, true],
        ['', '', null, true],
    ]) {
        app.get('storyteller-name').value = value
        const storyteller = app.context.getPlayerData()[0]
        assert.equal(storyteller.name, name)
        assert.equal(storyteller.uuid, uuid)
        assert.equal(storyteller.isAnon, isAnonymous)
        app.context.setWinner('good')
        app.context.generate()
        const exported = vm.runInContext('generatedData', app.context)
        assert.equal(exported.players[0].name, name)
        assert.equal(exported.players[0].isAnonymous, isAnonymous)
        assert.equal(exported.plays[0].playerScores[0].anonymousName, isAnonymous ? name : undefined)
        if (uuid) assert.equal(exported.players[0].uuid, uuid)
        assert.equal(exported._createPlay.players[0].sourcePlayerId, uuid || undefined)
        assert.equal(exported.players[0].name, name)
        assert.equal(exported.plays[0].playerScores[0].role, 'Vypravěč')
        assert.equal(exported.plays[0].playerScores[0].metaData, '{"isNpc":1}')
    }
})

test('winner controls follow the players, align right and have accessible icon-only buttons', () => {
    assert.ok(html.indexOf('id="winner-label"') > html.indexOf('id="players-list"'))
    assert.doesNotMatch(html, /id="winner-title"|Kdo zvítězil/)
    assert.match(html, /class="[^"]*ms-auto" role="group" aria-labelledby="winner-label"/)
    assert.match(html, /<span id="winner-label">Vítězný tým<\/span>/)
    for (const [team, label, icon] of [['good', 'Dobří', '👍'], ['evil', 'Zlí', '👎']]) {
        assert.match(html, new RegExp(`id="btn-${team}" aria-label="${label}"[^>]*>${icon}</button>`))
    }
})

test('download and open actions generate fresh exports directly without a preview', async () => {
    const app = recorder()
    app.initialize()
    assert.throws(() => app.context.downloadBgsplay(), /Vyber vítězný tým/)
    await assert.rejects(app.context.openInApp(), /Vyber vítězný tým/)
    assert.equal(app.downloads.length, 0)
    assert.equal(app.window.location.href, '')
    app.context.setWinner('good')
    app.get('play-date').value = '2026-10-17'
    app.rows[0].name.value = 'Hejki'
    app.context.downloadBgsplay()
    assert.equal(app.downloads[0].download, 'botc-2026-10-17.bgsplay')
    const downloaded = JSON.parse(await app.blobs[0].text())
    assert.equal(downloaded.players[1].name, 'Hejki')
    assert.equal(downloaded._createPlay, undefined)
    app.rows[0].name.value = 'Amos'
    await app.context.openInApp()
    assert.equal(app.window.location.href, '')
    const opened = JSON.parse(await app.shares[0].files[0].text())
    assert.equal(opened.players[1].name, 'Amos')
    app.rows[0].name.value = 'Nové jméno'
    app.context.downloadBgsplay()
    const updated = JSON.parse(await app.blobs[1].text())
    assert.equal(updated.plays[0].playerScores[1].anonymousName, 'Nové jméno')
    for (const row of [...app.rows]) app.context.removePlayer(Number(row.id.slice(7)))
    assert.throws(() => app.context.downloadBgsplay(), /Přidej alespoň jednoho hráče/)
    await assert.rejects(app.context.openInApp(), /Přidej alespoň jednoho hráče/)
    assert.equal(app.downloads.length, 2)
})

test('file sharing sends exactly the download format and falls back safely', async () => {
    const app = recorder()
    app.initialize()
    app.context.setWinner('good')
    const data = app.context.generate()
    app.context.generate = () => data
    app.context.downloadBgsplay()
    await app.context.openInApp()
    const file = app.shares[0].files[0]
    assert.equal(file.name, app.downloads[0].download)
    assert.equal(file.type, app.blobs[0].type)
    assert.equal(await file.text(), await app.blobs[0].text())
    assert.equal(JSON.parse(await file.text())._createPlay, undefined)
    app.navigator.canShare = () => false
    await app.context.openInApp()
    assert.equal(app.downloads.length, 2)
    assert.equal(await app.blobs[1].text(), await file.text())
    assert.equal(app.get('export-status').hidden, false)
    app.navigator.canShare = () => true
    app.navigator.share = async () => { throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }) }
    await app.context.openInApp()
    assert.equal(app.downloads.length, 2)
    app.navigator.share = async () => { throw new Error('Sharing failed') }
    await app.context.openInApp()
    assert.equal(app.downloads.length, 3)
    app.navigator.share = undefined
    await app.context.openInApp()
    assert.equal(app.downloads.length, 4)
})

test('export timestamps the game and the play with the current local export time', () => {
    const app = recorder()
    app.initialize()
    vm.runInContext(`{
        const RealDate = Date;
        globalThis.Date = class extends RealDate {
            constructor(...args) { super(...(args.length ? args : [2026, 9, 17, 13, 18, 8])); }
        };
    }`, app.context)
    app.context.setWinner('good')
    const exported = app.context.generate()
    for (const record of [...exported.games, ...exported.plays]) {
        assert.equal(record.modificationDate, '2026-10-17 13:18:08')
    }
    assert.notEqual(exported.plays[0].playDate, exported.plays[0].modificationDate)
})

test('optional location is exported only when selected and restored on import', () => {
    const app = recorder()
    app.initialize()
    app.context.setWinner('good')
    const select = html.match(/<select id="play-location"[\s\S]*?<\/select>/)[0]
    assert.doesNotMatch(select, /<option/)
    assert.equal(app.get('play-location').options[0].value, '')
    const locations = vm.runInContext('LOCATIONS', app.context)
    assert.deepEqual(Array.from(locations, location => location.name), ['Akce', 'Akce - Amos', 'TeepCo', 'TeepCo Hory'])
    for (const { name, uuid } of locations) {
        assert.ok(app.get('play-location').options.some(option => option.value === name && option.dataset.uuid === uuid))
        app.get('play-location').value = name
        const data = app.context.generate()
        assert.equal(data.locations.length, 1)
        assert.equal(data.locations[0].name, name)
        assert.equal(data.locations[0].uuid, uuid)
        assert.equal(app.context.generate().locations[0].uuid, uuid)
        assert.equal(data.plays[0].locationRefId, data.locations[0].id)
        assert.equal(data._createPlay.location, name)
    }
    app.get('play-location').value = ''
    let data = app.context.generate()
    assert.equal(data.locations.length, 0)
    assert.equal(data.plays[0].locationRefId, null)
    assert.equal(JSON.parse(JSON.stringify(data._createPlay)).location, undefined)
    const example = structuredClone(playExample)
    example.locations = [{ id: 42, name: 'TeepCo', uuid: 'original-bgstats-location-uuid' }]
    example.plays[0].locationRefId = 42
    app.context.importBgsplay(example)
    assert.equal(app.get('play-location').value, 'TeepCo')
    assert.equal(app.context.generate().locations[0].name, 'TeepCo')
    assert.equal(app.context.generate().locations[0].uuid, 'original-bgstats-location-uuid')
    example.locations[0].name = 'Importovaná lokace'
    app.context.importBgsplay(example)
    assert.equal(app.get('play-location').value, 'Importovaná lokace')
    assert.equal(app.get('play-location').options.at(-1).value, 'Importovaná lokace')
    app.context.importBgsplay(playExample)
    data = app.context.generate()
    assert.equal(data.locations.length, 0)
    assert.equal(app.get('play-location').value, '')
})

test('game copy options come from GAME_COPY and export BGStats metadata', () => {
    const app = recorder()
    vm.runInContext("GAME_COPY.push({ name: 'Další kopie', playUsedGameCopy: 3 })", app.context)
    app.initialize()
    app.context.setWinner('good')
    assert.match(html, /<select id="play-game-copy" class="form-control"><\/select>/)
    assert.equal(app.get('play-game-copy').value, '0')
    const copies = vm.runInContext('GAME_COPY', app.context)
    assert.equal(app.get('play-game-copy').options.length, copies.length)
    for (const [index, copy] of copies.entries()) {
        const option = app.get('play-game-copy').options[index]
        assert.equal(option.value, String(copy.playUsedGameCopy))
        assert.equal(option.textContent, copy.name)
        app.get('play-game-copy').value = option.value
        const metadata = JSON.parse(app.context.generate().plays[0].metaData)
        assert.equal(metadata.playUsedGameCopy, copy.playUsedGameCopy)
        assert.equal(metadata.playerRefId, copy.playUsedGameCopy === 0 ? undefined : 1)
    }
    app.get('play-game-copy').value = '0'
    assert.equal(JSON.parse(app.context.generate().plays[0].metaData).playGameBggVersion, undefined)
    app.context.importBgsplay(playExample)
    assert.equal(app.get('play-game-copy').value, '2')
    assert.equal(JSON.parse(app.context.generate().plays[0].metaData).playUsedGameCopy, 2)
    const withoutCopy = structuredClone(playExample)
    delete withoutCopy.plays[0].metaData
    app.context.importBgsplay(withoutCopy)
    assert.equal(app.get('play-game-copy').value, '0')
})

test('changing start time sets the end 45 minutes later, including across midnight', () => {
    const app = recorder()
    app.initialize()
    assert.match(html, /id="play-start" oninput="setDefaultEndTime\(\)"/)
    for (const [start, end] of [['10:00', '10:45'], ['23:40', '00:25'], ['00:00', '00:45']]) {
        app.get('play-start').value = start
        app.context.setDefaultEndTime()
        assert.equal(app.get('play-end').value, end)
        assert.equal(app.get('duration-display').textContent, '45 min')
    }
    app.get('play-end').value = '01:30'
    app.context.calcDuration()
    assert.equal(app.get('duration-display').textContent, '1 h 30 min')
    app.get('play-start').value = ''
    app.context.setDefaultEndTime()
    assert.equal(app.get('duration-display').textContent, '—')
})

test('adding a player with the button focuses the new name but initialization and import do not', () => {
    const app = recorder()
    app.initialize()
    assert.ok(app.rows.every(row => !row.name.focused))
    assert.match(html, /onclick="addPlayer\(true\)"/)
    app.context.addPlayer(true)
    assert.equal(app.rows.at(-1).name.focused, true)
    assert.ok(app.rows.slice(0, -1).every(row => !row.name.focused))
    app.context.importBgsplay(playExample)
    assert.ok(app.rows.every(row => !row.name.focused))
})

test('winner styling and BGStats export remain functional', () => {
    const app = recorder()
    app.initialize()
    app.get('storyteller-name').value = 'Hejki'
    app.context.selectScript(app.scripts[0])
    app.context.setPlayerTeam(1, 'good', app.rows[0].buttons[0])
    app.context.setPlayerTeam(2, 'evil', app.rows[1].buttons[1])
    app.get('play-start').value = '23:30'
    app.get('play-end').value = '00:45'
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
        assert.equal(exported.locations.length, 0)
        assert.equal(exported.plays[0].locationRefId, null)
        assert.equal(exported._createPlay.location, undefined)
        assert.equal(exported.plays[0].playerScores[0].winner, false)
        assert.equal(exported.plays[0].playerScores[1].winner, team === 'good')
        assert.equal(exported.plays[0].playerScores[2].winner, team === 'evil')
        assert.equal(exported._createPlay.players[1].winner, team === 'good')
        assert.equal(exported._createPlay.players[2].winner, team === 'evil')
    }
})
