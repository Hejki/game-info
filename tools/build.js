import path from 'node:path'
import YAML from 'yaml'
import fs from 'node:fs/promises'

const distDir = "./dist"
const gamesDataDir = "./dist/games"
let gamesIndex = []
const gameIds = new Set()
let groupNames = {}

try {
    try {
        groupNames = YAML.parse(await fs.readFile('./data/_groups.yaml', 'utf8')) || {}
    } catch (error) {
        if (error.code !== 'ENOENT') throw error
    }
    if (typeof groupNames !== 'object' || Array.isArray(groupNames)) throw new Error('Invalid group definitions: data/_groups.yaml')
    for (const [id, name] of Object.entries(groupNames)) {
        if (!/^[a-z0-9_-]+$/.test(id) || typeof name !== 'string' || !name.trim()) {
            throw new Error(`Invalid group definition: ${id} in data/_groups.yaml`)
        }
    }
    await copySources()
    await processDirectory('./data')
    await writeGamesIndex()
} catch (err) {
    console.error(err)
    process.exitCode = 1
}

async function copySources() {
    await fs.rm(distDir, { force: true, recursive: true })
    await fs.mkdir(distDir, { recursive: true })
    await fs.cp("./src", distDir, {recursive: true})
}

async function processDirectory(directory, group = null) {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))
    for (const entry of entries) {
        const filePath = path.join(directory, entry.name)
        if (entry.isDirectory()) {
            if (group) throw new Error(`Nested group directories are not supported: ${filePath}`)
            if (!/^[a-z0-9_-]+$/.test(entry.name)) throw new Error(`Invalid group directory: ${filePath}`)
            if (!Object.hasOwn(groupNames, entry.name)) throw new Error(`Missing group name for ${entry.name} in data/_groups.yaml`)
            const output = `${distDir}/groups/${entry.name}`
            await fs.mkdir(output, { recursive: true })
            await fs.copyFile(path.join(filePath, '_cover.jpg'), `${output}/_cover.jpg`)
            await processDirectory(filePath, { id: entry.name, name: groupNames[entry.name], image: `groups/${entry.name}/_cover.jpg` })
        } else if (entry.isFile() && entry.name.endsWith('.yaml') && !['_group.yaml', '_groups.yaml'].includes(entry.name)) {
            await processDataFile(filePath, group)
        }
    }
}

async function processDataFile(filePath, group) {
    const yamlText = await fs.readFile(filePath, { encoding: "utf8" })
    const gameData = YAML.parse(yamlText)
    const gameId = path.basename(filePath, ".yaml")
    if (gameIds.has(gameId)) throw new Error(`Duplicate game ID: ${gameId}`)
    gameIds.add(gameId)
    if (gameData.group != null) throw new Error(`Group must be inferred from its directory, not declared in ${filePath}`)
    if (group) gameData.group = group.id

    gamesIndex.push({
        id: gameId,
        name: gameData.name,
        language: gameData.language,
        p: gameData.players,
        t: gameData.playtime,
        w: gameData.weight,
        tools: gameData.tools,
        group: gameData.group,
        groupName: group?.name,
        groupImage: group?.image,
    })
    await fs.mkdir(`${gamesDataDir}/${gameId}`, { recursive: true })
    await fs.writeFile(`${gamesDataDir}/${gameId}/data.json`, JSON.stringify(gameData), { encoding: "utf8" })
    await fs.copyFile(path.join(path.dirname(filePath), `${gameId}.jpg`), `${gamesDataDir}/${gameId}/title.jpg`)
}

async function writeGamesIndex() {
    await fs.writeFile(`${gamesDataDir}/index.json`, JSON.stringify(gamesIndex), { encoding: "utf-8" })
}
