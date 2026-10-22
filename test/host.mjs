// Host self-test: state file, tool actions, HTTP surface, restart recovery,
// and origin rejection. Uses a throwaway profile directory.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../index.js'

const scratch = mkdtempSync(join(tmpdir(), 'persona-mask-test-'))
process.env.DSH_PROFILE_DIR = scratch

function makeHarness(config, baseDir) {
  const state = { sections: new Map(), tools: new Map(), routes: new Map() }
  const ctx = {
    get(name) {
      return baseDir !== undefined && name === 'hmr' ? { baseDir } : undefined
    },
    systemPrompt: {
      section(section) {
        state.sections.set(section.name, section)
        return () => state.sections.delete(section.name)
      },
    },
    tools: {
      register(definition) {
        state.tools.set(definition.name, definition)
        return () => state.tools.delete(definition.name)
      },
    },
    effect(setup) {
      return setup()
    },
    inject(_names, callback) {
      callback({
        webServer: {
          register(route) {
            state.routes.set(route.path, route)
            return () => state.routes.delete(route.path)
          },
        },
        effect(setup) {
          return setup()
        },
      })
    },
  }
  apply(ctx, config)
  return state
}

function sectionText(harness) {
  return harness.sections.get('persona:active').text()
}

async function call(route, { method = 'GET', body, headers = {} } = {}) {
  const req = {
    method,
    headers: { host: '127.0.0.1:1234', ...headers },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(body)
    },
  }
  let status = 0
  let payload = ''
  const res = {
    writableEnded: false,
    writeHead(code) {
      status = code
    },
    end(chunk) {
      payload += chunk === undefined ? '' : String(chunk)
      this.writableEnded = true
    },
  }
  await route.handler(req, res)
  return { status, body: payload === '' ? null : JSON.parse(payload) }
}

try {
  // Fresh profile: registered but silent, default off.
  const first = makeHarness({ active: 'off' })
  assert.equal(sectionText(first), '')
  assert.ok(first.routes.has('/persona-mask/state'), 'settings route registered')

  const tool = first.tools.get('persona')
  assert.ok(tool, 'persona tool registered')

  const initial = await call(first.routes.get('/persona-mask/state'))
  assert.equal(initial.status, 200)
  assert.equal(initial.body.enabled, false)
  assert.equal(initial.body.presets.length, 6)
  assert.ok(initial.body.presets.some((preset) => preset.id === 'bigfish'))

  const listed = await tool.execute({ action: 'list' }, {})
  assert.equal(listed.status, 'listed')
  assert.equal(listed.enabled, false)
  assert.match(listed.message, /大肥鱼/)

  // Tool switch flips the section and persists.
  const activated = await tool.execute({ action: 'set', preset: 'bigfish' }, {})
  assert.equal(activated.enabled, true)
  assert.equal(activated.activeId, 'bigfish')
  assert.match(sectionText(first), /当前人格：大肥鱼/)
  const stored = JSON.parse(readFileSync(join(scratch, 'data', 'persona-mask', 'state.json'), 'utf8'))
  assert.equal(stored.enabled, true)
  assert.equal(stored.activeId, 'bigfish')

  // HTTP switch: off, then another persona (auto-enables).
  const off = await call(first.routes.get('/persona-mask/state'), {
    method: 'POST',
    body: JSON.stringify({ enabled: false }),
    headers: { origin: 'http://127.0.0.1:1234' },
  })
  assert.equal(off.status, 200)
  assert.equal(off.body.enabled, false)
  assert.equal(sectionText(first), '')

  const switched = await call(first.routes.get('/persona-mask/state'), {
    method: 'POST',
    body: JSON.stringify({ activeId: 'catgirl' }),
    headers: { origin: 'http://127.0.0.1:1234' },
  })
  assert.equal(switched.status, 200)
  assert.equal(switched.body.activeId, 'catgirl')
  assert.equal(switched.body.enabled, true)
  assert.match(sectionText(first), /当前人格：猫娘/)

  // Unknown persona and cross-origin POSTs are rejected.
  const unknown = await call(first.routes.get('/persona-mask/state'), {
    method: 'POST',
    body: JSON.stringify({ activeId: 'nope' }),
    headers: { origin: 'http://127.0.0.1:1234' },
  })
  assert.equal(unknown.status, 400)

  const crossOrigin = await call(first.routes.get('/persona-mask/state'), {
    method: 'POST',
    body: JSON.stringify({ enabled: false }),
    headers: { origin: 'http://evil.example' },
  })
  assert.equal(crossOrigin.status, 403)

  // Restart: a new activation reads the persisted state.
  const second = makeHarness({ active: 'off' })
  assert.match(sectionText(second), /当前人格：猫娘/)
  const restored = await call(second.routes.get('/persona-mask/state'))
  assert.equal(restored.body.enabled, true)
  assert.equal(restored.body.activeId, 'catgirl')

  // Custom personas persist too.
  await second.tools.get('persona').execute(
    { action: 'set', name: '测试人格', instructions: '用一句话回答问题。' },
    {},
  )
  const third = makeHarness(undefined)
  const thirdList = await third.tools.get('persona').execute({ action: 'list' }, {})
  assert.match(thirdList.message, /测试人格/)

  // Custom CRUD over the settings route.
  const customRoute = third.routes.get('/persona-mask/custom')
  assert.ok(customRoute, 'custom route registered')
  const origin = { origin: 'http://127.0.0.1:1234' }
  const created = await call(customRoute, {
    method: 'POST',
    body: JSON.stringify({ action: 'create', name: '路由人格', instructions: '用短句。' }),
    headers: origin,
  })
  assert.equal(created.status, 200)
  const createdPersona = created.body.presets.find((entry) => entry.name === '路由人格')
  assert.ok(createdPersona, 'created persona in snapshot')
  assert.equal(createdPersona.custom, true)
  assert.equal(createdPersona.instructions, '用短句。')

  const updated = await call(customRoute, {
    method: 'POST',
    body: JSON.stringify({
      action: 'update',
      id: createdPersona.id,
      name: '改名人格',
      instructions: '用长句。',
    }),
    headers: origin,
  })
  assert.equal(updated.status, 200)
  assert.ok(
    updated.body.presets.some(
      (entry) => entry.id === createdPersona.id && entry.name === '改名人格',
    ),
    'updated persona name',
  )

  await third.tools.get('persona').execute({ action: 'set', preset: createdPersona.id }, {})

  const removed = await call(customRoute, {
    method: 'POST',
    body: JSON.stringify({ action: 'delete', id: createdPersona.id }),
    headers: origin,
  })
  assert.equal(removed.status, 200)
  assert.equal(removed.body.enabled, false, 'deleting the active persona disables it')
  assert.ok(!removed.body.presets.some((entry) => entry.id === createdPersona.id))

  const invalid = await call(customRoute, {
    method: 'POST',
    body: JSON.stringify({ action: 'create', name: '', instructions: '' }),
    headers: origin,
  })
  assert.equal(invalid.status, 400)

  // Config seed applies only when no state file exists.
  const seedDir = mkdtempSync(join(tmpdir(), 'persona-mask-seed-'))
  process.env.DSH_PROFILE_DIR = seedDir
  const seeded = makeHarness({
    active: 'mentor',
    personas: [{ id: 'butler', name: '管家', summary: '恭敬', instructions: '你以管家的方式说话。' }],
  })
  assert.match(sectionText(seeded), /当前人格：温柔导师/)
  const seededList = await seeded.tools.get('persona').execute({ action: 'list' }, {})
  assert.match(seededList.message, /管家/)
  rmSync(seedDir, { recursive: true, force: true })

  // An explicit hmr.baseDir wins over the environment.
  const explicitDir = mkdtempSync(join(tmpdir(), 'persona-mask-base-'))
  const explicit = makeHarness({ active: 'off' }, explicitDir)
  await explicit.tools.get('persona').execute({ action: 'set', preset: 'poet' }, {})
  assert.ok(
    existsSync(join(explicitDir, 'data', 'persona-mask', 'state.json')),
    'state written under hmr.baseDir',
  )
  rmSync(explicitDir, { recursive: true, force: true })

  console.log('persona-mask host test: ok')
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
