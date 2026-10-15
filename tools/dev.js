import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createServer } from 'vite'

const projectDir = fileURLToPath(new URL('../', import.meta.url))
const watchedPaths = ['src', 'data', 'tools/build.js'].map(file => path.resolve(projectDir, file))
let child
let timer
let building = false
let pending = false
let stopping = false

async function build() {
    console.log('[dev] Sestavuji aplikaci…')
    return new Promise(resolve => {
        child = spawn(process.execPath, ['tools/build.js'], {
            cwd: projectDir,
            stdio: 'inherit',
        })
        child.on('error', error => console.error('[dev]', error))
        child.on('close', code => {
            child = undefined
            resolve(code === 0)
        })
    })
}

if (!await build()) {
    process.exitCode = 1
} else {
    const server = await createServer({
        configFile: false,
        root: path.resolve(projectDir, 'dist'),
        publicDir: false,
        server: {
            host: '127.0.0.1',
            port: 5173,
            watch: {
                ignored: ['**/dist/**'],
                awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
            },
        },
    })

    async function rebuild() {
        pending = true
        if (building || stopping) return
        building = true
        try {
            while (pending && !stopping) {
                pending = false
                const success = await build()
                if (success && !stopping && !pending) {
                    // dist is not watched: discard cached transforms and ETags before reloading.
                    for (const environment of Object.values(server.environments)) {
                        environment.moduleGraph.invalidateAll()
                    }
                    server.ws.send({ type: 'full-reload', path: '*' })
                    console.log('[dev] Hotovo, prohlížeč obnoven.')
                } else if (!success && !stopping) {
                    console.error('[dev] Build selhal. Čekám na další změnu.')
                }
            }
        } finally {
            building = false
        }
    }

    server.watcher.add(watchedPaths)
    server.watcher.on('all', (event, file) => {
        if (!watchedPaths.some(watched => file === watched || file.startsWith(`${watched}${path.sep}`))) return
        clearTimeout(timer)
        timer = setTimeout(rebuild, 100)
    })

    async function stop() {
        stopping = true
        clearTimeout(timer)
        child?.kill()
        await server.close()
    }

    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    await server.listen()
    server.printUrls()
}
