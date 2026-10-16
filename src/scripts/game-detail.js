async function loadGame() {
    const gameId = new URLSearchParams(window.location.search).get('id')
    if (!gameId) {
        window.location.replace('./')
        return
    }

    try {
        if (!/^[a-zA-Z0-9_-]+$/.test(gameId)) throw new Error('Invalid game ID')

        const res = await fetch(`games/${encodeURIComponent(gameId)}/data.json`)
        if (!res.ok) throw new Error("Game not found")
        const game = await res.json()
        id("hero").style.backgroundImage = `url('games/${gameId}/title.jpg')`
        id("sticky-title").style.background = game.color
        id("game-title").textContent = game.name
        document.title = `${game.name} · Game Index`
        id("game-description").innerHTML = marked.parse(game.description)
        id("start-play-a").href = `bgstats://app.bgstatsapp.com/addPlay.html?gameId=${game.bgg}`

        fillPlayers(game)
        fillPlaytime(game)
        fillWeight(game)
        fillLinks(game)
        id("game-status").hidden = true
        id("game-detail").hidden = false
    } catch (err) {
        console.error(err)
        id("game-navbar").classList.remove('navbar-overlay')
        id("game-status").textContent = 'Hru se nepodařilo načíst. Zkus stránku obnovit nebo se vrať na seznam her.'
    }
}

function fillPlayers(game) {
    const count = game.players
    const container = id("players")
    resetInfoColor(container)

    id("players-value").textContent = count
    switch (count) {
        case "1-3":
        case "2-3":
        case "1-4":
        case "2-4":
            setInfoColor(container, "success")
            break
        case "1-5":
        case "2-5":
            setInfoColor(container, "warning")
            break
        default:
            setInfoColor(container, "danger")
    }
}

function fillPlaytime(game) {
    const time = game.playtime
    const topTimeMatch = String(time).match(/^(?:\d+\s*-\s*)?(\d+)$/)
    const topTime = topTimeMatch ? Number.parseInt(topTimeMatch[1]) : NaN
    const container = id("playtime")
    resetInfoColor(container)

    id("playtime-value").textContent = time
    if (topTime <= 30) {
        setInfoColor(container, "success")
    } else if (topTime <= 60) {
        setInfoColor(container, "warning")
    } else {
        setInfoColor(container, "danger")
    }
}

function fillWeight(game) {
    const weight = game.weight
    const container = id("weight")
    resetInfoColor(container)

    id("weight-value").textContent = weight
    if (weight <= 1.4) {
        setInfoColor(container, "success")
    } else if (weight < 2) {
        setInfoColor(container, "warning")
    } else {
        setInfoColor(container, "danger")
    }
}

function resetInfoColor(container) {
    container.classList.remove(
        "bg-success", "border-success", "fg-contrast-success",
        "bg-warning", "border-warning", "fg-contrast-warning",
        "bg-danger", "border-danger", "fg-contrast-danger"
    )
}

function setInfoColor(container, color) {
    container.classList.add(`bg-${color}`, `border-${color}`, `fg-contrast-${color}`)
}

function fillLinks(game) {
    const links = []
    if (game.bgg) links.push({ type: 'bgg', title: 'BGG', url: `https://boardgamegeek.com/boardgame/${game.bgg}` })
    if (game.zh) links.push({ type: 'zh', title: 'Zatrolené hry', url: `https://www.zatrolene-hry.cz/spolecenska-hra/${game.zh}` })
    links.push(...(game.links || []))

    const icons = { video: 'play-btn-fill', rules: 'journal-bookmark-fill' }
    const favicons = {
        bgg: 'https://cf.geekdo-static.com/icons/favicon2.ico',
        zh: 'https://www.zatrolene-hry.cz/graphics/favicon.cz.svg',
    }
    const list = document.createElement('ul')
    list.className = 'list-unstyled d-flex flex-column gap-3 mt-5'

    for (const link of links) {
        if (!link || typeof link.title !== 'string' || !link.title.trim()) continue
        let url
        try {
            url = new URL(link.url)
        } catch {
            continue
        }
        if (!['http:', 'https:'].includes(url.protocol)) continue

        const item = document.createElement('li')
        const anchor = document.createElement('a')
        anchor.className = 'd-inline-flex align-items-center gap-3'
        anchor.href = url.href
        anchor.target = '_blank'
        anchor.rel = 'noopener noreferrer'

        const favicon = Object.hasOwn(favicons, link.type) ? favicons[link.type] : null
        const icon = document.createElement(favicon ? 'img' : 'i')
        if (favicon) {
            icon.src = favicon
            icon.alt = ''
        } else {
            const iconName = Object.hasOwn(icons, link.type) ? icons[link.type] : 'link-45deg'
            icon.className = `bi bi-${iconName}`
            icon.setAttribute('aria-hidden', 'true')
        }
        const title = document.createElement('span')
        title.textContent = link.title
        anchor.appendChild(icon)
        anchor.appendChild(title)
        item.appendChild(anchor)
        list.appendChild(item)
    }
    id('game-links').replaceChildren(list)
}

function id(elementId) {
    return document.getElementById(elementId)
}

loadGame()
