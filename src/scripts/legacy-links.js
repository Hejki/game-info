function redirectLegacyGame() {
    const hash = window.location.hash.substring(1)
    if (!hash) return

    let gameId = hash
    try {
        gameId = decodeURIComponent(hash)
    } catch {
        // Neplatné percent-encoding nesmí zastavit přesměrování.
    }
    const target = new URL('game.html', window.location.href)
    target.searchParams.set('id', gameId)
    window.location.replace(target.href)
}

redirectLegacyGame()
window.addEventListener('hashchange', redirectLegacyGame)
