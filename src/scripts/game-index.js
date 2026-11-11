function normalizeSearch(text) {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs')
}

function formatGameCount(count) {
    const noun = count === 1 ? 'hra' : count >= 2 && count <= 4 ? 'hry' : 'her'
    return `${count} ${noun}`
}

function parseGameRange(value) {
    const match = String(value ?? '').trim().match(/^(\d+)(?:\s*[-–—]\s*(\d+))?$/)
    if (!match) return null
    const min = Number(match[1])
    const max = Number(match[2] || match[1])
    return min > 0 && max >= min ? { min, max } : null
}

function fillGameName(container, game, linked = true) {
    const link = document.createElement(linked ? 'a' : 'span')
    if (linked) link.href = `game.html?id=${encodeURIComponent(game.id)}`
    link.textContent = game.name
    container.appendChild(link)
    if (game.language && game.language !== 'cs') {
        container.appendChild(document.createTextNode(' '))
        const flag = document.createElement('span')
        flag.textContent = '🇬🇧'
        flag.setAttribute('role', 'img')
        flag.setAttribute('aria-label', 'Hra není v češtině')
        flag.title = 'Hra není v češtině'
        container.appendChild(flag)
    }
    for (const tool of linked ? game.tools || [] : []) {
        container.appendChild(document.createTextNode(' '))
        container.appendChild(createToolLink(tool, game))
    }
}

function createToolLink(tool, game) {
    const link = document.createElement('a')
    link.href = tool.link
    link.title = tool.title || `Spustit nástroj: ${game.name}`
    link.setAttribute('aria-label', link.title)
    const icon = document.createElement('i')
    icon.className = tool.icon
    icon.setAttribute('aria-hidden', 'true')
    link.appendChild(icon)
    return link
}

function createGameCard(game, href = `game.html?id=${encodeURIComponent(game.id)}`, caption = '', imageSrc = `games/${encodeURIComponent(game.id)}/title.jpg`) {
    const column = document.createElement('div')
    column.className = 'col-6 md:col-4 lg:col-3 xl:col-2'
    const card = document.createElement('article')
    card.className = 'card h-100 overflow-hidden game-grid-card'
    const imageLink = document.createElement('a')
    imageLink.className = 'card-img-overlay p-0'
    imageLink.href = href
    const image = document.createElement('img')
    image.className = 'd-block w-100 h-100 object-fit-cover'
    image.src = imageSrc
    image.alt = game.name
    image.loading = 'lazy'
    image.decoding = 'async'
    imageLink.appendChild(image)
    card.appendChild(imageLink)
    const artworkSpace = document.createElement('div')
    artworkSpace.className = 'ratio-4x3 flex-shrink-0 pe-none'
    artworkSpace.setAttribute('aria-hidden', 'true')
    card.appendChild(artworkSpace)
    const body = document.createElement('div')
    body.className = 'card-body position-relative flex-shrink-0 mt-auto'
    const title = document.createElement('h2')
    title.className = 'fs-lg mb-3 text-break flex-fill'
    fillGameName(title, game, false)
    body.appendChild(title)
    const metadata = document.createElement('div')
    metadata.className = 'd-flex flex-wrap gap-3 fs-sm'
    if (caption) metadata.textContent = caption
    for (const [value, label, iconClass] of [
        [game.p, 'Počet hráčů', 'bi bi-person-standing'],
        [game.t == null ? null : `${game.t} min`, 'Herní doba', 'bi bi-hourglass-split'],
        [game.w, 'Obtížnost', 'bi bi-speedometer2'],
    ]) {
        if (value == null) continue
        const item = document.createElement('span')
        const icon = document.createElement('i')
        icon.className = iconClass
        icon.setAttribute('aria-hidden', 'true')
        item.appendChild(icon)
        const accessibleLabel = document.createElement('span')
        accessibleLabel.className = 'visually-hidden'
        accessibleLabel.textContent = `${label}: `
        item.appendChild(accessibleLabel)
        item.appendChild(document.createTextNode(` ${value}`))
        metadata.appendChild(item)
    }
    body.appendChild(metadata)
    card.appendChild(body)
    if (game.tools?.length) {
        const tools = document.createElement('div')
        tools.className = 'game-grid-tools d-flex gap-2'
        for (const tool of game.tools) {
            const link = createToolLink(tool, game)
            link.className = 'btn-solid theme-info'
            tools.appendChild(link)
        }
        card.appendChild(tools)
    }
    column.appendChild(card)
    return column
}

async function loadGameIndex() {
    try {
        const res = await fetch('games/index.json')
        if (!res.ok) throw new Error('Index not found')
        const allGames = await res.json()
        fillToolsMenus(allGames)
        const requestedGroup = new URLSearchParams(window.location.search).get('group')
        const games = requestedGroup === null ? allGames : allGames.filter(game => game.group === requestedGroup)
        if (requestedGroup !== null) {
            if (!games.length) {
                document.getElementById('game-index-status').textContent = 'Skupina nebyla nalezena.'
                return
            }
            const name = games[0].groupName || requestedGroup
            document.getElementById('game-group-title').textContent = name
            document.getElementById('game-group-header').hidden = false
            document.title = `${name} · Game Index`
        }
        const rows = document.getElementById('game-index')
        const grid = document.getElementById('game-grid')
        const searchableRows = []
        const groups = new Map()
        let view = 'list'
        try {
            if (localStorage.getItem('game-index-view') === 'grid') view = 'grid'
        } catch {
            // Storage can be unavailable; switching views should still work.
        }

        const displayedGroups = new Set()
        const orderedGames = games.flatMap(game => {
            if (requestedGroup !== null || !game.group) return [game]
            if (displayedGroups.has(game.group)) return []
            displayedGroups.add(game.group)
            return games.filter(member => member.group === game.group)
        })
        for (const game of orderedGames) {
            let group = null
            if (requestedGroup === null && game.group) {
                group = groups.get(game.group)
                if (!group) {
                    const header = document.createElement('tr')
                    header.className = 'game-group-header'
                    const cell = document.createElement('th')
                    cell.colSpan = 4
                    const button = document.createElement('button')
                    button.type = 'button'
                    button.className = 'game-group-toggle d-flex align-items-center gap-3'
                    const icon = document.createElement('i')
                    icon.className = 'bi bi-chevron-right'
                    icon.setAttribute('aria-hidden', 'true')
                    const label = document.createElement('span')
                    button.appendChild(icon)
                    button.appendChild(label)
                    cell.appendChild(button)
                    header.appendChild(cell)
                    const members = games.filter(member => member.group === game.group)
                    const name = game.groupName || game.group
                    const card = createGameCard({ id: game.id, name }, `index.html?group=${encodeURIComponent(game.group)}`, `${formatGameCount(members.length)} ve skupině`, game.groupImage)
                    group = { name, header, card, button, icon, label, members: [], expanded: false }
                    groups.set(game.group, group)
                    rows.appendChild(header)
                    grid.appendChild(card)
                    const currentGroup = group
                    button.addEventListener('click', () => {
                        currentGroup.expanded = !currentGroup.expanded
                        filterGames()
                    })
                }
            }
            const row = document.createElement('tr')
            const name = document.createElement('th')
            name.className = 'text-nowrap'
            fillGameName(name, game)
            row.appendChild(name)
            for (const value of [game.p, game.t, game.w]) {
                const cell = document.createElement('td')
                cell.className = 'text-center text-nowrap'
                cell.textContent = value
                row.appendChild(cell)
            }
            rows.appendChild(row)
            const card = createGameCard(game)
            grid.appendChild(card)
            const entry = { row, card, group, language: game.language || 'cs', players: parseGameRange(game.p), duration: parseGameRange(game.t), name: normalizeSearch(`${game.name} ${game.groupName || ''}`) }
            searchableRows.push(entry)
            if (group) {
                row.className = 'game-group-member'
                row.id = `group-${game.group}-${game.id}`
                group.members.push(entry)
                group.button.setAttribute('aria-controls', group.members.map(member => member.row.id).join(' '))
            }
        }
        const search = document.getElementById('game-search')
        const playersFilter = document.getElementById('game-filter-players')
        const durationFilter = document.getElementById('game-filter-duration')
        const languageFilter = document.getElementById('game-filter-language')
        const languageNames = new Intl.DisplayNames(['cs'], { type: 'language' })
        for (const language of [...new Set(games.map(game => game.language || 'cs'))].sort()) {
            const option = document.createElement('button')
            option.type = 'button'
            option.className = 'menu-item'
            option.value = language
            option.setAttribute('data-bs-value', language)
            option.setAttribute('role', 'option')
            option.setAttribute('aria-selected', 'false')
            option.textContent = languageNames.of(language)
            document.getElementById('game-filter-language-menu').appendChild(option)
        }
        const clearFilters = document.getElementById('game-filter-clear')
        const filterToggle = document.getElementById('game-filter-toggle')
        const filterCount = document.getElementById('game-filter-count')
        function filterGames() {
            const words = normalizeSearch(search.value).trim().split(/\s+/).filter(Boolean)
            const players = Number(playersFilter.value)
            const duration = Number(durationFilter.value)
            const filtering = words.length > 0 || playersFilter.value !== '' || durationFilter.value !== '' || languageFilter.value !== ''
            clearFilters.disabled = false
            const activeFilters = [playersFilter, durationFilter, languageFilter].filter(input => input.value !== '').length
            filterCount.textContent = String(activeFilters)
            filterCount.hidden = activeFilters === 0
            filterToggle.setAttribute('aria-label', activeFilters ? `Filtry her: ${activeFilters} aktivní` : 'Filtry her')
            if (activeFilters) filterToggle.classList.add('active')
            else filterToggle.classList.remove('active')
            let count = 0
            for (const entry of searchableRows) {
                entry.matches = words.every(word => entry.name.includes(word))
                    && (playersFilter.value === '' || (Number.isInteger(players) && entry.players && players >= entry.players.min && players <= entry.players.max))
                    && (durationFilter.value === '' || (entry.duration && entry.duration.max <= duration))
                    && (languageFilter.value === '' || entry.language === languageFilter.value)
                const open = !entry.group || entry.group.expanded || filtering
                entry.row.hidden = !entry.matches || !open
                entry.card.hidden = !entry.matches || Boolean(entry.group && !filtering)
                if (entry.matches) count++
            }
            for (const group of groups.values()) {
                const matches = group.members.filter(member => member.matches).length
                const open = group.expanded || filtering
                group.header.hidden = matches === 0
                group.card.hidden = matches === 0 || filtering
                group.label.textContent = `${group.name} (${matches})`
                group.icon.className = open ? 'bi bi-chevron-down' : 'bi bi-chevron-right'
                group.button.setAttribute('aria-expanded', String(open))
                group.button.disabled = filtering
            }
            document.getElementById('game-search-count').textContent = `Zobrazeno ${count} z ${games.length} her`
            document.getElementById('game-search-empty').hidden = count !== 0
            document.getElementById('game-index-table').hidden = count === 0 || view !== 'list'
            document.getElementById('game-index-grid').hidden = count === 0 || view !== 'grid'
        }
        for (const mode of ['list', 'grid']) {
            const button = document.getElementById(`game-view-${mode}`)
            button.disabled = false
            button.addEventListener('click', () => {
                view = mode
                try { localStorage.setItem('game-index-view', view) } catch { /* Keep working without persistence. */ }
                updateViewButtons()
                filterGames()
            })
        }
        function updateViewButtons() {
            for (const mode of ['list', 'grid']) {
                const button = document.getElementById(`game-view-${mode}`)
                button.setAttribute('aria-pressed', String(view === mode))
                if (view === mode) button.classList.add('active')
                else button.classList.remove('active')
            }
        }
        updateViewButtons()
        search.addEventListener('input', filterGames)
        search.disabled = false
        playersFilter.disabled = false
        durationFilter.disabled = false
        languageFilter.disabled = false
        filterToggle.disabled = false
        playersFilter.addEventListener('input', filterGames)
        for (const combobox of [durationFilter, languageFilter]) {
            combobox.addEventListener('change.bs.combobox', event => {
                combobox.value = event.value
                filterGames()
            })
        }
        clearFilters.addEventListener('click', () => {
            search.value = ''
            playersFilter.value = ''
            durationFilter.value = ''
            languageFilter.value = ''
            resetFilterCombobox('game-filter-duration', 'Libovolná')
            resetFilterCombobox('game-filter-language', 'Libovolný')
            filterGames()
        })
        filterGames()
        document.getElementById('game-index-status').hidden = true
    } catch (error) {
        console.error(error)
        document.getElementById('game-index-status').textContent = 'Seznam her se nepodařilo načíst. Zkus stránku obnovit.'
    }
}

function fillToolsMenus(games) {
    for (const prefix of ['index-tools', 'index-tools-mobile']) {
        const menu = document.getElementById(`${prefix}-menu`)
        const seen = new Set()
        for (const game of games) {
            for (const tool of game.tools || []) {
                if (seen.has(tool.link)) continue
                seen.add(tool.link)
                const link = createToolLink(tool, game)
                link.className = 'menu-item'
                link.appendChild(document.createTextNode(` ${tool.title || game.name}`))
                menu.appendChild(link)
            }
        }
        document.getElementById(`${prefix}-toggle`).disabled = seen.size === 0
    }
}

function resetFilterCombobox(id, label) {
    document.getElementById(`${id}-value`).textContent = label
    const options = document.getElementById(`${id}-menu`).children
    for (let index = 0; index < options.length; index++) {
        const selected = index === 0
        if (selected) options[index].classList.add('selected')
        else options[index].classList.remove('selected')
        options[index].setAttribute('aria-selected', String(selected))
    }
}

if (!window.location.hash.substring(1)) loadGameIndex()
