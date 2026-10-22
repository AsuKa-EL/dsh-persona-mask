// Client self-check: load the browser module with a stubbed loader + React,
// then verify the settings.section registration and dictionaries without
// executing hooks or touching the DOM.
import assert from 'node:assert/strict'

let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      captured = definition
    },
  },
}

await import(new URL('../client.js', import.meta.url).href)

assert.ok(captured, 'module loader received a definition')
assert.equal(captured.id, 'dsh-persona-mask')
assert.equal(typeof captured.factory, 'function')

const React = {
  createElement: (...args) => ({ kind: 'element', args }),
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  useCallback: (callback) => callback,
  useRef: (value) => ({ current: value }),
  Fragment: 'Fragment',
}

const plugin = captured.factory((specifier) => {
  if (specifier === 'react') return React
  throw new Error(`unexpected require: ${specifier}`)
})

assert.equal(plugin.name, 'dsh-persona-mask')
assert.deepEqual(plugin.inject, ['slots', 'locale'])
assert.equal(typeof plugin.apply, 'function')

const seen = []
const ctx = {
  effect(setup) {
    return setup()
  },
  locale: {
    register(ns, dicts) {
      seen.push({ kind: 'locale', ns, dicts })
      return () => {}
    },
    bind(ns) {
      return (key) => `${ns}.${key}`
    },
    subscribe() {
      return () => {}
    },
  },
  slots: {
    inject(slot, callback) {
      seen.push({ kind: 'inject', slot })
      callback()
    },
    register(options, component) {
      seen.push({ kind: 'slot', options, component })
      return () => {}
    },
  },
}

plugin.apply(ctx)

const dictionary = seen.find((entry) => entry.kind === 'locale')
assert.ok(dictionary, 'locale dictionaries registered')
assert.equal(dictionary.ns, 'persona')
assert.equal(dictionary.dicts.zh.title, '人格面具')
assert.equal(dictionary.dicts.en.title, 'Persona')
for (const key of [
  'enable',
  'enabled',
  'disabled',
  'active',
  'note',
  'retry',
  'newPersona',
  'edit',
  'delete',
  'confirmDelete',
  'save',
  'fieldName',
  'fieldInstructions',
]) {
  assert.ok(dictionary.dicts.zh[key], `zh dictionary has ${key}`)
  assert.ok(dictionary.dicts.en[key], `en dictionary has ${key}`)
}

assert.ok(seen.some((entry) => entry.kind === 'inject' && entry.slot === 'settings.section'))
const slot = seen.find((entry) => entry.kind === 'slot')
assert.ok(slot, 'settings slot registered')
assert.equal(slot.options.name, 'settings.section')
assert.equal(slot.options.id, 'persona')
assert.equal(slot.options.locale, 'persona')
assert.equal(typeof slot.options.label, 'function')
assert.equal(slot.options.label(), 'persona.title')
assert.equal(typeof slot.component, 'function')

console.log('persona-mask client test: ok')
