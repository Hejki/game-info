
async function loadGame() {
    const gameId = window.location.hash.substring(1)

    if (!gameId) {
        await publishGameIndex()
        return
    }

    try {
        const res = await fetch(`games/${gameId}/data.json`)
        if (!res.ok) throw new Error("Game not found")
        const game = await res.json()

        id("hero").style.backgroundImage = `url('games/${gameId}/title.jpg')`
        id("sticky-title").style.background = game.color
        id("game-title").textContent = game.name
        id("game-description").innerHTML = marked.parse(game.description)
        id("start-play-a").href = `bgstats://app.bgstatsapp.com/addPlay.html?gameId=${game.bgg}`

        fillPlayers(game)
        fillPlaytime(game)
        fillWeight(game)
        fillLinks(game)
    } catch (err) {
        console.error(err)
        await publishGameIndex()
    }
}

async function publishGameIndex() {
    const res = await fetch("games/index.json")
    if (!res.ok) throw new Error("Index not found")

    const gamesArray = await res.json()

    document.body.innerHTML = `<div class="px-4 py-5">
        <h1 class="display-5 fw-bold text-body-emphasis">Games Index</h1>
        <div class="mx-auto table-responsive">
        <table class="table">
        <thead><tr>
        <th></th>
        <th class="text-center"><t class="bi bi-person-standing"/></th>
        <th class="text-center"><t class="bi bi-hourglass-split"/></th>
        <th class="text-center"><t class="bi bi-speedometer2"/></th>
        </thead>
        <tbody id="game-index">
        </tbody>
        </table>
        </div>
        </div>
        `

    gamesArray.forEach(game => {
        let tr = document.createElement("tr")

        id("game-index").appendChild(tr)
        tr.innerHTML = `
            <th class="text-nowrap"><a href="#${game.id}" onclick="reloadGame('${game.id}')">${game.name}</a></th>
            <td class="text-center text-nowrap">${game.p}</td>
            <td class="text-center text-nowrap">${game.t}</td>
            <td class="text-center text-nowrap">${game.w}</td>
        `
    })
}

function reloadGame(gameId) {
    window.location.hash = `#${gameId}`
    window.location.reload()
}

function fillPlayers(game) {
    const count = game.players
    const container = id("players")

    id("players-value").textContent = count
    switch (count) {
        case "1-3":
        case "2-3":
        case "1-4":
        case "2-4":
            container.classList.add("bg-success")
            container.classList.add("border-success-subtle")
            break
        case "1-5":
        case "2-5":
            container.classList.add("bg-warning")
            container.classList.add("border-warning-subtle")
            break
        default:
            container.classList.add("bg-danger")
            container.classList.add("border-danger-subtle")
    }
}

function fillPlaytime(game) {
    const time = game.playtime
    const topTimeMatch = time.match(/-(\d+)$/)
    const topTime = topTimeMatch ? Number.parseInt(topTimeMatch[1]) : -1
    const container = id("playtime")

    id("playtime-value").textContent = time
    if (topTime <= 30) {
        container.classList.add("bg-success")
        container.classList.add("border-success-subtle")
    } else if (topTime <= 60) {
        container.classList.add("bg-warning")
        container.classList.add("border-warning-subtle")
    } else {
        container.classList.add("bg-danger")
        container.classList.add("border-danger-subtle")
    }
}

function fillWeight(game) {
    const weight = game.weight
    const container = id("weight")

    id("weight-value").textContent = weight
    if (weight <= 1.4) {
        container.classList.add("bg-success")
        container.classList.add("border-success-subtle")
    } else if (weight < 2) {
        container.classList.add("bg-warning")
        container.classList.add("border-warning-subtle")
    } else {
        container.classList.add("bg-danger")
        container.classList.add("border-danger-subtle")
    }
}

function fillLinks(game) {
    let links = []
    const linksHtml = links
        .map(l => `<li class="list-inline-item"><img src="${l.i}"/> <a href="${l.u}" target="_blank">${l.t}</a></li>`)
        .join("")

    const trollLink = game.zh ? `<li class="list-inline-item ms-2"><img src="https://www.zatrolene-hry.cz/graphics/favicon.cz.svg" class="me-1"/><a href="https://www.zatrolene-hry.cz/spolecenska-hra/${game.zh}" target="_blank">Zatrolené hry</a></li>` : ''

    id("game-links").innerHTML = `<ul class="list-unstyled">
        <li class="list-inline-item"><img src="https://cf.geekdo-static.com/icons/favicon2.ico" class="me-1"/><a href="https://boardgamegeek.com/boardgame/${game.bgg}" target="_blank">BGG</a></li>
        ${trollLink}
        ${linksHtml}
    </ul>`
}

function id(elementId) {
    return document.getElementById(elementId)
}

function startPlay(game) {
    alert(game.bgg)
}

loadGame()

window.addEventListener('hashchange', function () {
    loadGame()
})