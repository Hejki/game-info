
async function loadGame() {
    const id = window.location.hash.substring(1)

    if (!id) {
        document.body.innerHTML = "<p>No game ID provided.</p>"
        return
    }

    try {
        const res = await fetch(`games/${id}/data.json`)
        if (!res.ok) throw new Error("Game not found")
        const game = await res.json()

        document.getElementById("hero").style.backgroundImage = `url('games/${id}/title.jpg')`
    //    document.getElementById("game-title-hero").textContent = game.name
    //    document.getElementById("game-title-hero").style.color = game.color
        document.getElementById("sticky-title").style.background = game.color
        document.getElementById("game-title").textContent = game.name
        
        document.getElementById("players-value").textContent = game.players
        document.getElementById("playtime-value").textContent = game.playtime
        document.getElementById("weight-value").textContent = game.weight
        

        // document.getElementById("game-players").textContent = game.players
        // document.getElementById("game-playtime").textContent = game.playtime
        // document.getElementById("game-age").textContent = game.age
        // document.getElementById("game-image").src = `images/${game.image}`
        // document.getElementById("game-image").alt = game.name
    } catch (err) {
        // document.body.innerHTML = "<p>Error loading game data.</p>"
        console.error(err)
    }
}

loadGame()