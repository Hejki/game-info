const colorModeKey = 'game-info-color-mode'
const colorModes = ['auto', 'light', 'dark']
const colorModeLabels = { auto: 'Podle systému', light: 'Světlý', dark: 'Tmavý' }
const colorModeIcons = { auto: 'bi-circle-half', light: 'bi-sun-fill', dark: 'bi-moon-stars-fill' }
let currentColorMode = 'auto'

function applyColorMode(mode) {
    currentColorMode = mode
    if (mode === 'auto') {
        document.documentElement.removeAttribute('data-bs-theme')
    } else {
        document.documentElement.setAttribute('data-bs-theme', mode)
    }
}

function updateColorModeControl() {
    const toggle = document.getElementById('color-mode-toggle')
    if (!toggle) return
    const label = `Barevný režim: ${colorModeLabels[currentColorMode]}`
    toggle.setAttribute('aria-label', label)
    toggle.title = label
    document.getElementById('color-mode-icon').className = `bi ${colorModeIcons[currentColorMode]}`
    document.querySelectorAll('#color-mode-menu [data-bs-theme-value]').forEach(button => {
        const active = button.dataset.bsThemeValue === currentColorMode
        button.classList.toggle('active', active)
        button.setAttribute('aria-pressed', String(active))
        button.querySelector('[data-theme-check]').classList.toggle('d-none', !active)
    })
}

try {
    const savedMode = localStorage.getItem(colorModeKey)
    applyColorMode(colorModes.includes(savedMode) ? savedMode : 'auto')
} catch {
    // Systémový režim funguje i při zakázaném úložišti.
    applyColorMode('auto')
}

document.addEventListener('DOMContentLoaded', updateColorModeControl)

document.addEventListener('click', event => {
    const button = event.target.closest('#color-mode-menu [data-bs-theme-value]')
    if (!button || !colorModes.includes(button.dataset.bsThemeValue)) return
    const mode = button.dataset.bsThemeValue
    applyColorMode(mode)
    updateColorModeControl()
    try {
        localStorage.setItem(colorModeKey, mode)
    } catch {
        // Přepínání funguje i bez možnosti uložit volbu.
    }
})
