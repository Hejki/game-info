import path from 'node:path'
import YAML from 'yaml'
import fs from 'node:fs/promises'

const distDir = "./dist"
const gamesDataDir = "./dist/games"
let gamesIndex = []

try {
    await copySources()

    for await (const dataFile of fs.glob("./data/*.yaml")) {
        await processDataFile(dataFile)
    }
    await writeGamesIndex()
} catch (err) {
    console.error(err)
}

async function copySources() {
    await fs.rm(distDir, { force: true, recursive: true })
    await fs.mkdir(distDir, { recursive: true })
    await fs.cp("./src", distDir, {recursive: true})
}

async function processDataFile(filePath) {
    const yamlText = await fs.readFile(filePath, { encoding: "utf8" })
    const gameData = YAML.parse(yamlText)
    const gameId = path.basename(filePath, ".yaml")

    gamesIndex.push(gameId)
    await fs.mkdir(`${gamesDataDir}/${gameId}`, { recursive: true })
    await fs.writeFile(`${gamesDataDir}/${gameId}/data.json`, JSON.stringify(gameData), { encoding: "utf8" })
    await fs.cp(`./data/${gameId}.jpg`, `${gamesDataDir}/${gameId}/title.jpg`)
}

async function writeGamesIndex() {
    await fs.writeFile(`${gamesDataDir}/index.json`, JSON.stringify(gamesIndex), { encoding: "utf-8" })
}

async function copyDir(src, dest) {
    // Ensure destination exists
    await fs.mkdir(dest, { recursive: true })

    // Read entries
    const entries = await fs.readdir(src, { withFileTypes: true })

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)

        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath) // Recurse
        } else if (entry.isFile()) {
            await fs.copyFile(srcPath, destPath)
        }
    }
}