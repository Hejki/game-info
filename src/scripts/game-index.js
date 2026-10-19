function normalizeSearch(text) {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs')
}

async function loadGameIndex() {
    try {
        const res = await fetch('games/index.json')
        if (!res.ok) throw new Error('Index not found')
        const games = await res.json()
        const rows = document.getElementById('game-index')
        const searchableRows = []

        for (const game of games) {
            const row = document.createElement('tr')
            const name = document.createElement('th')
            name.className = 'text-nowrap'
            const link = document.createElement('a')
            link.href = `game.html?id=${encodeURIComponent(game.id)}`
            link.textContent = game.name
            name.appendChild(link)

            if (game.language && game.language !== 'cs') {
                name.appendChild(document.createTextNode(' '))
                const flag = document.createElement('span')
                flag.textContent = '🇬🇧'
                flag.setAttribute('role', 'img')
                flag.setAttribute('aria-label', 'Hra není v češtině')
                flag.title = 'Hra není v češtině'
                name.appendChild(flag)
            }

            for (const tool of game.tools || []) {
                name.appendChild(document.createTextNode(' '))
                const toolLink = document.createElement('a')
                toolLink.href = tool.link
                const icon = document.createElement('i')
                icon.className = tool.icon
                toolLink.appendChild(icon)
                name.appendChild(toolLink)
            }
            row.appendChild(name)
            for (const value of [game.p, game.t, game.w]) {
                const cell = document.createElement('td')
                cell.className = 'text-center text-nowrap'
                cell.textContent = value
                row.appendChild(cell)
            }
            rows.appendChild(row)
            searchableRows.push({ row, name: normalizeSearch(game.name) })
        }
        const search = document.getElementById('game-search')
        function filterGames() {
            const words = normalizeSearch(search.value).trim().split(/\s+/).filter(Boolean)
            let count = 0
            for (const { row, name } of searchableRows) {
                row.hidden = !words.every(word => name.includes(word))
                if (!row.hidden) count++
            }
            document.getElementById('game-search-count').textContent = `Zobrazeno ${count} z ${games.length} her`
            document.getElementById('game-search-empty').hidden = count !== 0
            document.getElementById('game-index-table').hidden = count === 0
        }
        search.addEventListener('input', filterGames)
        search.disabled = false
        filterGames()
        document.getElementById('game-index-status').hidden = true
    } catch (error) {
        console.error(error)
        document.getElementById('game-index-status').textContent = 'Seznam her se nepodařilo načíst. Zkus stránku obnovit.'
    }
}

if (!window.location.hash.substring(1)) loadGameIndex()
