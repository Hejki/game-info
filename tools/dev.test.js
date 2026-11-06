import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { setTimeout } from 'node:timers/promises'
import test from 'node:test'

const projectDir = fileURLToPath(new URL('../', import.meta.url))

test('dev server serves fresh JavaScript after rebuilding, including conditional requests', { timeout: 30000 }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'game-info-dev-test-'))
    let child
    let logs = ''
    async function waitFor(condition) {
        const deadline = Date.now() + 10000
        while (Date.now() < deadline) {
            if (await condition()) return
            if (child?.exitCode !== null) throw new Error(`Dev server exited:\n${logs}`)
            await setTimeout(50)
        }
        throw new Error(`Timed out waiting for dev server:\n${logs}`)
    }

    try {
        for (const dir of ['tools', 'src/scripts', 'data']) {
            await fs.mkdir(path.join(root, dir), { recursive: true })
        }
        for (const file of ['dev.js', 'build.js']) {
            await fs.copyFile(path.join(projectDir, 'tools', file), path.join(root, 'tools', file))
        }
        await fs.symlink(path.join(projectDir, 'node_modules'), path.join(root, 'node_modules'), 'dir')
        await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}')
        await fs.writeFile(path.join(root, 'src/index.html'), '<script src="scripts/game-loader.js"></script>')
        await fs.mkdir(path.join(root, 'data/test'))
        await fs.writeFile(path.join(root, 'data/test/test.yaml'), 'name: Test\n')
        await fs.writeFile(path.join(root, 'data/_groups.yaml'), 'test: Before\n')
        await fs.writeFile(path.join(root, 'data/test/_cover.jpg'), '')
        await fs.writeFile(path.join(root, 'data/test/test.jpg'), '')
        const scriptPath = path.join(root, 'src/scripts/game-loader.js')
        await fs.writeFile(scriptPath, 'document.body.dataset.version = "before"')

        child = spawn(process.execPath, [path.join(root, 'tools/dev.js')], {
            cwd: root,
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        child.stdout.on('data', data => { logs += data })
        child.stderr.on('data', data => { logs += data })
        await waitFor(() => /http:\/\/(?:localhost|127\.0\.0\.1):\d+\//.test(logs))
        const base = logs.match(/http:\/\/(?:localhost|127\.0\.0\.1):\d+\//)[0].replace('localhost', '127.0.0.1')
        await fetch(base)
        const address = Object.values(os.networkInterfaces()).flat().find(address => address.family === 'IPv4' && !address.internal)
        if (address) {
            const networkUrl = new URL(base)
            networkUrl.hostname = address.address
            assert.equal((await fetch(networkUrl)).status, 200, 'Dev server must accept connections on its LAN interface')
        }
        const url = `${base}scripts/game-loader.js`
        const initial = await fetch(url)
        assert.match(await initial.text(), /"before"/)
        let etag = initial.headers.get('etag')
        assert.ok(etag)

        for (const version of ['after', 'latest']) {
            logs = ''
            await fs.writeFile(scriptPath, `document.body.dataset.version = "${version}"`)
            await waitFor(() => logs.includes('prohlížeč obnoven'))
            const response = await fetch(url, { headers: { 'If-None-Match': etag } })
            assert.equal(response.status, 200, 'Old ETag must not return 304 after rebuild')
            assert.match(await response.text(), new RegExp(`"${version}"`))
            assert.notEqual(response.headers.get('etag'), etag)
            etag = response.headers.get('etag')
            assert.match(await (await fetch(url)).text(), new RegExp(`"${version}"`))
        }
        logs = ''
        await fs.writeFile(path.join(root, 'data/_groups.yaml'), 'test: Updated group\n')
        await waitFor(() => logs.includes('prohlížeč obnoven'))
        const index = await (await fetch(`${base}games/index.json`)).json()
        assert.equal(index[0].groupName, 'Updated group')
    } finally {
        if (child && child.exitCode === null) {
            const exited = once(child, 'exit')
            child.kill('SIGTERM')
            await exited
        }
        await fs.rm(root, { recursive: true, force: true })
    }
})
