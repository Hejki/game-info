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
    const trollLink = game.zh ? `<li class="list-inline-item ms-3"><img src="https://www.zatrolene-hry.cz/graphics/favicon.cz.svg" class="me-1"/><a href="https://www.zatrolene-hry.cz/spolecenska-hra/${game.zh}" target="_blank">Zatrolené hry</a></li>` : ''

    id("game-links").innerHTML = `<ul class="list-unstyled">
        <li class="list-inline-item"><img src="https://cf.geekdo-static.com/icons/favicon2.ico" class="me-1"/><a href="https://boardgamegeek.com/boardgame/${game.bgg}" target="_blank">BGG</a></li>
        ${trollLink}
    </ul>`
}

function id(elementId) {
    return document.getElementById(elementId)
}

loadGame()
