import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const html = await fs.readFile(new URL('../src/botc-play.html', import.meta.url), 'utf8')
const source = await fs.readFile(new URL('../src/scripts/botc-play.js', import.meta.url), 'utf8')
const roleSource = await fs.readFile(new URL('../src/scripts/botc-roles.js', import.meta.url), 'utf8')
const playExample = JSON.parse(await fs.readFile(new URL('./play-example.bgsplay', import.meta.url), 'utf8'))
const customScriptExample = await fs.readFile(new URL('./botc-custom-script.json', import.meta.url), 'utf8')

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
    el.click = () => { el.clicked = true }
    return el
}

function recorder(storage = new Map()) {
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
    get('players-list').insertBefore = (row, reference) => {
        rows.splice(rows.indexOf(row), 1)
        rows.splice(rows.indexOf(reference), 0, row)
    }
    get('script-buttons').appendChild = button => { scripts.push(button) }
    get('play-location').options = []
    get('play-location').replaceChildren = () => { get('play-location').options = [] }
    get('play-location').appendChild = option => { get('play-location').options.push(option) }
    get('play-game-copy').options = []
    get('play-game-copy').replaceChildren = () => { get('play-game-copy').options = [] }
    get('play-game-copy').appendChild = option => { get('play-game-copy').options.push(option) }
    let initialize
    const listeners = new Map()
    const context = vm.createContext({
        document: {
            addEventListener: (event, callback) => {
                if (event === 'DOMContentLoaded') initialize = callback
                else listeners.set(event, callback)
            },
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
                row.moveUp = element()
                row.moveDown = element()
                row.buttons = ['good', 'evil'].map(team => Object.assign(element('team-btn btn-subtle'), { dataset: { team } }))
                row.querySelector = selector => {
                    if (selector === '.player-name-input') return row.name
                    if (selector === '.player-role-cell') return row.roleCell
                    if (selector === '.player-num') return row.number
                    if (selector === '.move-player-up') return row.moveUp
                    if (selector === '.move-player-down') return row.moveDown
                    return row.role
                }
                row.querySelectorAll = () => row.buttons
                row.remove = () => rows.splice(rows.indexOf(row), 1)
                return row
            },
        },
        alert: message => { throw new Error(message) },
        confirm: () => true,
        Blob,
        File,
        navigator,
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        URL: { createObjectURL: blob => { blobs.push(blob); return `blob:test-${blobs.length}` } },
        window,
        setTimeout() {},
    })
    vm.runInContext(`${roleSource}\n${source}`, context)
    const edit = () => listeners.get('input')({ target: { matches: () => true } })
    return { context, get, rows, scripts, initialize, downloads, blobs, window, navigator, shares, storage, edit }
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
    assert.equal(exported.plays[0].board, 'Custom: Můj vlastní skript')
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
    assert.match(header, /class="btn-text" data-bs-toggle="dialog" data-bs-target="#import-dialog"/)
    assert.match(header, /class="btn-text btn-sm theme-danger ms-auto" onclick="clearRecorder\(\)"/)
    assert.ok(header.indexOf('onclick="clearRecorder()"') < header.indexOf('data-bs-target="#import-dialog"'))
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

test('unfinished draft survives reload with raw inputs, roles, manual teams and metadata', () => {
    const storage = new Map()
    const app = recorder(storage)
    app.initialize()
    app.scripts[0].onclick()
    app.get('play-date').value = '2026-10-17'
    app.get('play-start').value = '23:40'
    app.get('play-end').value = '01:10'
    app.context.calcDuration()
    app.get('storyteller-name').value = '  Amos  '
    app.rows[0].name.value = '  Hejki '
    app.rows[0].role.value = 'Empat'
    app.context.setPlayerTeam(1, 'evil', app.rows[0].buttons[1])
    app.rows[1].name.value = 'Nový hráč'
    app.get('play-location').value = 'TeepCo'
    app.get('play-game-copy').value = '2'
    app.context.addPlayer(true)
    app.edit()
    const restored = recorder(storage)
    restored.initialize()
    assert.equal(restored.rows.length, 9)
    assert.equal(restored.rows[0].name.value, '  Hejki ')
    assert.equal(restored.rows[0].role.value, 'Empat')
    assert.ok(restored.rows[0].classList.contains('is-evil'))
    assert.ok(restored.rows[0].classList.contains('bg-30'))
    assert.equal(restored.rows[1].name.value, 'Nový hráč')
    assert.equal(restored.get('storyteller-name').value, '  Amos  ')
    assert.equal(restored.get('play-date').value, '2026-10-17')
    assert.equal(restored.get('play-start').value, '23:40')
    assert.equal(restored.get('play-end').value, '01:10')
    assert.equal(restored.get('duration-display').textContent, '1 h 30 min')
    assert.equal(restored.get('play-location').value, 'TeepCo')
    assert.equal(restored.get('play-game-copy').value, '2')
    assert.equal(vm.runInContext('winnerTeam', restored.context), null)
    assert.equal(vm.runInContext('currentScript', restored.context), 'trouble-brewing')
    assert.ok(restored.rows.every(row => !row.name.focused))
    restored.context.removePlayer(1)
    restored.context.setWinner('good')
    const again = recorder(storage)
    again.initialize()
    assert.equal(again.rows.length, 8)
    assert.equal(vm.runInContext('winnerTeam', again.context), 'good')
})

test('imported identities, custom scripts and location UUIDs survive reload', () => {
    const storage = new Map()
    const app = recorder(storage)
    app.initialize()
    const example = structuredClone(playExample)
    example.plays[0].board = 'Importovaný skript'
    example.players.find(player => player.name === 'Amos').uuid = 'imported-amos-uuid'
    example.locations = [{ id: 99, name: 'Importované místo', uuid: 'imported-location-uuid' }]
    example.plays[0].locationRefId = 99
    app.context.importBgsplay(example)
    const reloaded = recorder(storage)
    reloaded.initialize()
    const data = reloaded.context.generate()
    assert.equal(data.players[0].uuid, 'imported-amos-uuid')
    assert.equal(data.plays[0].board, 'Custom: Importovaný skript')
    assert.equal(data.locations[0].uuid, 'imported-location-uuid')
    assert.equal(data.locations[0].name, 'Importované místo')
    assert.equal(reloaded.rows.length, 19)
})

test('empty drafts restore and inaccessible or corrupt storage does not break initialization', () => {
    const storage = new Map()
    const app = recorder(storage)
    app.initialize()
    for (const row of [...app.rows]) app.context.removePlayer(Number(row.id.slice(7)))
    const empty = recorder(storage)
    empty.initialize()
    assert.equal(empty.rows.length, 0)
    assert.equal(vm.runInContext('currentScript', empty.context), null)
    for (const value of ['not json', '{}', '{"version":999}', '{"version":1,"players":[null]}']) {
        storage.set('botc-play-draft-v1', value)
        const fresh = recorder(storage)
        fresh.initialize()
        assert.equal(fresh.rows.length, 8)
    }
    const blocked = recorder({ get() { throw new Error('Blocked') }, set() { throw new Error('Full') } })
    assert.doesNotThrow(() => blocked.initialize())
    assert.doesNotThrow(() => blocked.edit())
    assert.doesNotThrow(() => blocked.context.addPlayer())
})

test('clear button resets the form and stored draft only after confirmation', () => {
    const app = recorder()
    app.initialize()
    app.context.importBgsplay(playExample)
    app.get('play-location').value = 'TeepCo'
    app.edit()
    const saved = app.storage.get('botc-play-draft-v1')
    app.context.confirm = () => false
    app.context.clearRecorder()
    assert.equal(app.rows.length, 19)
    assert.equal(app.storage.get('botc-play-draft-v1'), saved)
    app.context.confirm = () => true
    app.context.clearRecorder()
    assert.equal(app.rows.length, 8)
    assert.ok(app.rows.every(row => row.name.value === '' && row.role.value === ''))
    assert.equal(app.get('storyteller-name').value, '')
    assert.equal(app.get('play-start').value, '')
    assert.equal(app.get('play-end').value, '')
    assert.equal(app.get('duration-display').textContent, '—')
    assert.equal(app.get('play-location').value, '')
    assert.equal(app.get('play-game-copy').value, '0')
    assert.equal(vm.runInContext('currentScript', app.context), null)
    assert.equal(vm.runInContext('winnerTeam', app.context), null)
    assert.equal(vm.runInContext('generatedData', app.context), null)
    assert.equal(app.get('summary-bar').textContent, '8: 0/0/0/0')
    const reloaded = recorder(app.storage)
    reloaded.initialize()
    assert.equal(reloaded.rows.length, 8)
    assert.equal(reloaded.get('storyteller-name').value, '')
    assert.equal(vm.runInContext('currentScript', reloaded.context), null)
    assert.ok(html.indexOf('onclick="clearRecorder()"') < html.indexOf('onclick="downloadBgsplay()"'))
    assert.match(html, /onclick="clearRecorder\(\)" aria-label="Vyčistit formulář"/)
})

test('Custom opens a dialog and imports translated Script Tool roles and script name', () => {
    const app = recorder()
    app.initialize()
    app.scripts[0].onclick()
    app.scripts[3].onclick()
    assert.equal(vm.runInContext('currentScript', app.context), 'trouble-brewing')
    assert.equal(app.scripts[3].attributes['data-bs-target'], '#custom-script-dialog')
    assert.match(html, /href="https:\/\/script.bloodontheclocktower.com"[^>]*rel="noopener noreferrer"/)
    assert.match(html, /<textarea id="custom-script-json"/)
    assert.ok(html.indexOf('scripts/botc-roles.js') < html.indexOf('scripts/botc-play.js'))
    app.get('custom-script-json').value = customScriptExample
    app.context.importCustomScriptFromDialog()
    assert.equal(app.get('custom-script-status').hidden, true)
    assert.equal(app.get('custom-script-close').clicked, true)
    assert.equal(app.scripts[3].textContent, 'Custom: Na počátku cesty')
    assert.equal(app.scripts[3].attributes['aria-pressed'], 'true')
    const script = app.context.getScript('custom')
    assert.equal(script.name, 'Na počátku cesty')
    assert.deepEqual(Array.from(script.roles.townsfolk), ['Šlechtic', 'Babička', 'Knihovník', 'Empat', 'Vesnický pobuda', 'Vědma', 'Městský vyvolávač', 'Hrobník', 'Mnich', 'Hazardní hráč', 'Učenec', 'Umělec', 'Zabiják', 'Strážkyně krkavců'])
    assert.deepEqual(Array.from(script.roles.outsider), ['Opilec', 'Zlatíčko', 'Morový doktor', 'Nešika'])
    assert.deepEqual(Array.from(script.roles.minion), ['Mezefeles', 'Kmotr', 'Vdova', 'Šarlatová žena'])
    assert.deepEqual(Array.from(script.roles.demon), ['Pukka', 'No Dashii', 'Kazali', 'Vigormortis'])
    assert.deepEqual(Array.from(script.roles.traveller), ['Byrokrat', 'Gangster', 'Vudun'])
    assert.match(app.rows[0].roleCell.innerHTML, /<select/)
    for (const roles of Object.values(script.roles)) {
        for (const role of roles) assert.ok(app.rows[0].roleCell.innerHTML.includes(`<option value="${role}">${role}</option>`))
    }
    const selections = ['Šlechtic', 'Opilec', 'Vdova', 'Kazali', 'Gangster']
    selections.forEach((role, index) => {
        app.rows[index].role.value = role
        app.context.autoSelectPlayerTeam(index + 1, role)
    })
    assert.ok(app.rows[0].classList.contains('is-good'))
    assert.ok(app.rows[0].classList.contains('bg-30'))
    assert.ok(app.rows[1].classList.contains('is-good'))
    assert.ok(app.rows[1].classList.contains('bg-10'))
    assert.ok(app.rows[2].classList.contains('is-evil'))
    assert.ok(app.rows[3].classList.contains('is-evil'))
    assert.ok(app.rows[3].classList.contains('bg-30'))
    assert.ok(!app.rows[4].classList.contains('is-good') && !app.rows[4].classList.contains('is-evil'))
    assert.equal(app.get('summary-bar').textContent, '8: 1/1/1/1')
    app.context.setWinner('good')
    assert.equal(app.context.generate().plays[0].board, 'Custom: Na počátku cesty')
    app.context.addPlayer()
    assert.match(app.rows.at(-1).innerHTML, /<select/)
    assert.ok(app.rows.at(-1).innerHTML.includes('Kazali'))
})

test('custom script definitions survive reload and reset removes them', () => {
    const app = recorder()
    app.initialize()
    app.context.importCustomScript(customScriptExample)
    app.rows[0].role.value = 'Šlechtic'
    app.context.autoSelectPlayerTeam(1, 'Šlechtic')
    const reloaded = recorder(app.storage)
    reloaded.initialize()
    assert.equal(reloaded.context.getScript('custom').name, 'Na počátku cesty')
    assert.equal(reloaded.rows[0].role.value, 'Šlechtic')
    assert.ok(reloaded.rows[0].innerHTML.includes('Vdova'))
    assert.equal(reloaded.scripts[3].textContent, 'Custom: Na počátku cesty')
    reloaded.scripts[0].onclick()
    reloaded.scripts[3].onclick()
    assert.equal(reloaded.get('custom-script-json').value, customScriptExample)
    assert.equal(vm.runInContext('currentScript', reloaded.context), 'trouble-brewing')
    reloaded.context.importCustomScriptFromDialog()
    reloaded.context.setWinner('good')
    const exported = JSON.parse(JSON.stringify(reloaded.context.generate()))
    reloaded.context.importBgsplay(exported)
    assert.ok(reloaded.rows[0].innerHTML.includes('Vdova'))
    assert.equal(reloaded.context.generate().plays[0].board, 'Custom: Na počátku cesty')
    reloaded.context.clearRecorder()
    assert.equal(vm.runInContext('customScript', reloaded.context), null)
    assert.equal(reloaded.scripts[3].textContent, 'Custom')
    assert.equal(reloaded.get('custom-script-json').value, '')
})

test('custom script validation is atomic, supports object IDs and safely handles names', () => {
    const app = recorder()
    app.initialize()
    app.context.importCustomScript(customScriptExample)
    const before = JSON.stringify(app.context.getScript('custom'))
    for (const text of ['not json', '{}', '[]', '["empath"]', '[{"id":"_meta","name":" "},"imp"]', '[{"id":"_meta","name":"Test"}]', '[{"id":"_meta","name":"Test"},"unknown-role"]', '[{"id":"_meta","name":"Test"},"__proto__"]', '[{"id":"_meta","name":"Test"},null]']) {
        assert.throws(() => app.context.importCustomScript(text))
        assert.equal(JSON.stringify(app.context.getScript('custom')), before)
    }
    app.get('custom-script-json').value = '[{"id":"_meta","name":"Test"},"unknown-role"]'
    app.context.importCustomScriptFromDialog()
    assert.equal(app.get('custom-script-status').hidden, false)
    assert.ok(app.get('custom-script-status').textContent.includes('unknown-role'))
    app.context.importCustomScript(JSON.stringify([{ id: '_meta', name: '<img src=x onerror=alert(1)>' }, { id: 'empath' }, 'empath', 'djinn', 'bootlegger']))
    const script = app.context.getScript('custom')
    assert.deepEqual(Array.from(script.roles.townsfolk), ['Empat'])
    assert.deepEqual(Array.from(script.roles.fabled), ['Djinn'])
    assert.deepEqual(Array.from(script.roles.loric), ['Bootlegger'])
    assert.equal(app.scripts[3].textContent, 'Custom: <img src=x onerror=alert(1)>')
    assert.ok(!app.rows[0].roleCell.innerHTML.includes('<img'))
})

test('player header actions clear roles or reset players without changing game metadata', () => {
    const app = recorder()
    app.initialize()
    app.context.importBgsplay(playExample)
    app.get('play-location').value = 'TeepCo'
    app.edit()
    const names = app.rows.map(row => row.name.value)
    const storyteller = app.get('storyteller-name').value
    const checkMetadata = () => {
        assert.equal(app.get('play-date').value, '2026-10-17')
        assert.equal(app.get('play-start').value, '13:21')
        assert.equal(app.get('play-end').value, '15:32')
        assert.equal(app.get('play-location').value, 'TeepCo')
        assert.equal(app.get('play-game-copy').value, '2')
        assert.equal(vm.runInContext('currentScript', app.context), 'trouble-brewing')
    }
    const saved = app.storage.get('botc-play-draft-v1')
    app.context.confirm = () => false
    app.context.clearPlayerRoles()
    app.context.clearPlayers()
    assert.equal(app.storage.get('botc-play-draft-v1'), saved)
    app.context.confirm = () => true
    app.context.clearPlayerRoles()
    assert.deepEqual(app.rows.map(row => row.name.value), names)
    assert.equal(app.get('storyteller-name').value, storyteller)
    assert.equal(app.rows.length, 19)
    for (const row of app.rows) {
        assert.equal(row.role.value, '')
        assert.ok(!row.classList.contains('is-good') && !row.classList.contains('is-evil'))
        assert.ok(!row.classList.contains('bg-info') && !row.classList.contains('bg-danger'))
        assert.ok(row.classList.contains('bg-10'))
        assert.ok(row.buttons.every(button => button.attributes['aria-pressed'] === 'false'))
    }
    assert.equal(vm.runInContext('winnerTeam', app.context), null)
    checkMetadata()
    const afterRoles = recorder(app.storage)
    afterRoles.initialize()
    assert.equal(afterRoles.rows.length, 19)
    assert.deepEqual(afterRoles.rows.map(row => row.name.value), names)
    assert.ok(afterRoles.rows.every(row => row.role.value === ''))
    app.context.addPlayer()
    app.context.clearPlayers()
    assert.equal(app.rows.length, 8)
    assert.equal(app.get('storyteller-name').value, '')
    assert.ok(app.rows.every(row => row.name.value === '' && row.role.value === ''))
    assert.equal(vm.runInContext('winnerTeam', app.context), null)
    checkMetadata()
    const afterPlayers = recorder(app.storage)
    afterPlayers.initialize()
    assert.equal(afterPlayers.rows.length, 8)
    assert.equal(afterPlayers.get('storyteller-name').value, '')
    assert.ok(afterPlayers.rows.every(row => row.name.value === '' && row.role.value === ''))
    const header = html.match(/<section[^>]*aria-labelledby="players-title"[\s\S]*?<div class="card-body">/)[0]
    assert.match(header, /card-header d-flex flex-row flex-nowrap/)
    assert.match(header, /ms-auto" onclick="clearPlayerRoles\(\)" aria-label="Vymazat role hráčů"/)
    assert.match(header, /onclick="clearPlayers\(\)" aria-label="Vymazat hráče a role"/)
})

test('move buttons swap whole player rows, update boundaries and persist export order', () => {
    const app = recorder()
    app.initialize()
    app.scripts[0].onclick()
    const first = app.rows[0]
    const second = app.rows[1]
    first.name.value = 'Hejki'
    first.role.value = 'Empat'
    second.name.value = 'Amos'
    second.role.value = 'Opilec'
    app.context.setPlayerTeam(1, 'evil', first.buttons[1])
    app.context.setPlayerTeam(2, 'good', second.buttons[0])
    assert.equal(first.moveUp.disabled, true)
    assert.equal(app.rows.at(-1).moveDown.disabled, true)
    assert.ok(first.innerHTML.indexOf('move-player-up') < first.innerHTML.indexOf('team-btn'))
    assert.ok(first.innerHTML.indexOf('move-player-down') < first.innerHTML.indexOf('team-btn'))
    app.context.movePlayer(1, 1)
    assert.equal(app.rows[0], second)
    assert.equal(app.rows[1], first)
    assert.equal(second.number.textContent, 1)
    assert.equal(first.number.textContent, 2)
    assert.equal(second.moveUp.disabled, true)
    assert.equal(first.moveUp.disabled, false)
    assert.equal(first.role.value, 'Empat')
    assert.ok(first.classList.contains('is-evil'))
    assert.equal(second.role.value, 'Opilec')
    assert.ok(second.classList.contains('is-good'))
    app.context.movePlayer(1, -1)
    assert.equal(app.rows[0], first)
    app.context.movePlayer(1, -1)
    app.context.movePlayer(8, 1)
    app.context.movePlayer(999, 1)
    assert.equal(app.rows[0], first)
    assert.equal(app.rows.at(-1).id, 'player-8')
    app.context.movePlayer(2, -1)
    app.context.setWinner('good')
    const exported = app.context.generate()
    assert.equal(exported.players[1].name, 'Amos')
    assert.equal(exported.players[2].name, 'Hejki')
    assert.equal(exported.plays[0].playerScores[1].teamRole, 'Opilec')
    assert.equal(exported.plays[0].playerScores[1].winner, true)
    assert.equal(exported.plays[0].playerScores[2].teamRole, 'Empat')
    assert.equal(exported.plays[0].playerScores[2].team, '2')
    assert.deepEqual(Array.from(vm.runInContext('players.map(player => player.id)', app.context)), [2, 1, 3, 4, 5, 6, 7, 8])
    const reloaded = recorder(app.storage)
    reloaded.initialize()
    assert.equal(reloaded.rows[0].name.value, 'Amos')
    assert.equal(reloaded.rows[1].name.value, 'Hejki')
    assert.equal(reloaded.rows[1].role.value, 'Empat')
    assert.ok(reloaded.rows[1].classList.contains('is-evil'))
    app.context.removePlayer(2)
    assert.equal(first.moveUp.disabled, true)
    app.context.addPlayer()
    assert.equal(app.rows.at(-2).moveDown.disabled, false)
    assert.equal(app.rows.at(-1).moveDown.disabled, true)
})

test('game title is centered in the navbar', () => {
    const navbar = html.match(/<nav\b[\s\S]*?<\/nav>/)[0]
    assert.match(navbar, /<h1 class="col-6 text-center fs-lg mb-0">Krvavá hodina odbyla<\/h1>/)
    assert.equal((navbar.match(/class="col-3\b/g) || []).length, 2)
    assert.equal((html.match(/<h1\b/g) || []).length, 1)
})

test('recorder close icon returns directly to the index', () => {
    const navbar = html.match(/<nav\b[\s\S]*?<\/nav>/)[0]
    assert.match(navbar, /<a href="\.\/" class="btn-text" aria-label="Zavřít nástroj a vrátit se na seznam her"[^>]*><i class="bi bi-x-lg" aria-hidden="true"><\/i><\/a>/)
    assert.doesNotMatch(navbar, /chevron-left|Zpět na hru|game\.html/)
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

test('known scripts contain only role IDs and use the same translation as custom scripts', () => {
    const app = recorder()
    app.initialize()
    const scripts = vm.runInContext('SCRIPTS', app.context)
    for (const script of scripts) {
        assert.ok(Array.isArray(script.roles))
        assert.ok(script.roles.every(id => typeof id === 'string'))
        if (script.id === 'custom') continue
        const grouped = app.context.getScript(script.id)
        const expectedCounts = script.id === 'trouble-brewing' ? [13, 4, 4, 1, 5] : [13, 4, 4, 4, 5]
        assert.deepEqual(['townsfolk', 'outsider', 'minion', 'demon', 'traveller'].map(type => grouped.roles[type].length), expectedCounts)
        const imported = app.context.parseCustomScript(JSON.stringify([{ id: '_meta', name: script.name }, ...script.roles]))
        assert.deepEqual(JSON.parse(JSON.stringify(grouped.roles)), JSON.parse(JSON.stringify(imported.roles)))
    }
    assert.equal(app.context.getScript('sects-violets').roles.townsfolk[0], 'Filozof')
    assert.equal(app.context.getScript('missing'), undefined)
})

test('script buttons, role options and export names come from SCRIPTS', () => {
    const app = recorder()
    vm.runInContext(`SCRIPTS.push({ id: 'test-script', name: 'Testovací skript', roles: ['empath'] })`, app.context)
    app.initialize()
    assert.doesNotMatch(html, /data-script=/)
    const metadata = html.match(/<section[^>]*aria-labelledby="metadata-title"[\s\S]*?<\/section>/)[0]
    assert.match(metadata, /id="script-buttons"/)
    assert.doesNotMatch(html, /id="script-title"/)
    const definitions = vm.runInContext('SCRIPTS.map(script => getScript(script.id))', app.context)
    assert.equal(app.scripts.length, definitions.length)
    app.context.setWinner('good')
    definitions.forEach((script, index) => {
        const button = app.scripts[index]
        assert.equal(button.dataset.script, script.id)
        assert.equal(button.textContent, script.name)
        if (script.id === 'custom') {
            assert.equal(button.attributes['data-bs-toggle'], 'dialog')
            assert.equal(button.attributes['data-bs-target'], '#custom-script-dialog')
            app.context.selectScript(button)
        } else {
            button.onclick()
        }
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
        const board = script.id === 'custom' ? `Custom: ${script.name}` : script.name
        assert.equal(exported._createPlay.board, board)
        assert.equal(exported.plays[0].board, board)
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
    const definitions = vm.runInContext('SCRIPTS.map(script => getScript(script.id))', app.context)
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
    const definitions = vm.runInContext('SCRIPTS.map(script => getScript(script.id))', app.context)
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
    const roles = app.context.getScript('trouble-brewing').roles
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
