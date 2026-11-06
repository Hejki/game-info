import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const projectDir = fileURLToPath(new URL('../', import.meta.url))

test('build infers groups from directories, preserves game IDs and validates metadata and covers', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'game-info-build-test-'))
    try {
        for (const dir of ['src', 'tools', 'data']) await fs.mkdir(path.join(root, dir))
        await fs.copyFile(path.join(projectDir, 'tools/build.js'), path.join(root, 'tools/build.js'))
        await fs.symlink(path.join(projectDir, 'node_modules'), path.join(root, 'node_modules'), 'dir')
        await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}')
        await fs.writeFile(path.join(root, 'src/index.html'), '<main>Test</main>')
        await fs.writeFile(path.join(root, 'data/test.jpg'), '')
        const build = () => spawnSync(process.execPath, ['tools/build.js'], { cwd: root, encoding: 'utf8' })
        await fs.writeFile(path.join(root, 'data/test.yaml'), 'name: Test\n')
        assert.equal(build().status, 0, 'Groups are optional for standalone games')
        await fs.mkdir(path.join(root, 'data/collection'))
        await fs.writeFile(path.join(root, 'data/_groups.yaml'), 'collection: Test collection\n')
        await fs.writeFile(path.join(root, 'data/collection/_cover.jpg'), 'group-image')
        await fs.writeFile(path.join(root, 'data/collection/member.yaml'), 'name: Member\n')
        await fs.writeFile(path.join(root, 'data/collection/member.jpg'), 'member-image')
        const result = build()
        assert.equal(result.status, 0, result.stderr)
        const index = JSON.parse(await fs.readFile(path.join(root, 'dist/games/index.json'), 'utf8'))
        assert.equal(index.length, 2, '_groups.yaml must not be treated as a game')
        const member = index.find(game => game.id === 'member')
        assert.equal(index.find(game => game.id === 'test').group, undefined)
        assert.equal(member.group, 'collection')
        assert.equal(member.groupName, 'Test collection')
        assert.equal(member.groupImage, 'groups/collection/_cover.jpg')
        const detail = JSON.parse(await fs.readFile(path.join(root, 'dist/games/member/data.json'), 'utf8'))
        assert.equal(detail.group, 'collection')
        assert.equal(await fs.readFile(path.join(root, 'dist/games/member/title.jpg'), 'utf8'), 'member-image')
        assert.equal(await fs.readFile(path.join(root, 'dist/groups/collection/_cover.jpg'), 'utf8'), 'group-image')
        await fs.writeFile(path.join(root, 'data/member.yaml'), 'name: Duplicate\n')
        const duplicate = build()
        assert.notEqual(duplicate.status, 0)
        assert.match(duplicate.stderr, /Duplicate game ID/)
        await fs.unlink(path.join(root, 'data/member.yaml'))
        await fs.writeFile(path.join(root, 'data/_groups.yaml'), 'collection: ""\n')
        const invalid = build()
        assert.notEqual(invalid.status, 0)
        assert.match(invalid.stderr, /Invalid group definition/)
        await fs.writeFile(path.join(root, 'data/_groups.yaml'), '{}\n')
        const unknown = build()
        assert.notEqual(unknown.status, 0)
        assert.match(unknown.stderr, /Missing group name/)
        await fs.writeFile(path.join(root, 'data/_groups.yaml'), 'collection: Test collection\n')
        await fs.unlink(path.join(root, 'data/collection/_cover.jpg'))
        const missing = build()
        assert.notEqual(missing.status, 0)
        assert.match(missing.stderr, /_cover\.jpg/)
    } finally {
        await fs.rm(root, { recursive: true, force: true })
    }
})
