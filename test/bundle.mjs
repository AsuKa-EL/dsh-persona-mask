// Bundle/manifest check: assert the publish metadata, exported files, patch
// binding, locales, and the client module contract.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (name) => readFileSync(new URL(name, root), 'utf8')

const pkg = JSON.parse(read('package.json'))
assert.equal(pkg.name, 'dsh-persona-mask')
assert.equal(pkg.version, '2.0.0')
assert.equal(pkg.private, false)
assert.equal(pkg.license, 'MIT')
assert.equal(pkg.author, 'AsuKa-EL')
assert.equal(pkg.repository.url, 'git+https://github.com/AsuKa-EL/dsh-persona-mask.git')
assert.match(pkg.homepage, /github\.com\/AsuKa-EL\/dsh-persona-mask/)
assert.match(pkg.bugs.url, /github\.com\/AsuKa-EL\/dsh-persona-mask/)
assert.ok(existsSync(new URL('LICENSE', root)), 'LICENSE ships')
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.equal(pkg.dsh.client.platform, 'web')
assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'))
assert.equal(pkg.exports['./client'], './client.js')
assert.match(pkg.scripts.test, /test\/host\.mjs/)
assert.match(pkg.scripts.test, /test\/client\.mjs/)
assert.match(pkg.scripts.test, /test\/bundle\.mjs/)

for (const file of [
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'locale/*.json',
  'icon.svg',
  'README.md',
  'LICENSE',
]) {
  assert.ok(pkg.files.includes(file), `files lists ${file}`)
}
assert.ok(!pkg.files.some((file) => file.startsWith('test/')), 'tests stay out of the npm tarball')

for (const locale of ['zh', 'en']) {
  const meta = JSON.parse(read(`locale/${locale}.json`)).meta
  assert.ok(meta.title.length > 0 && meta.description.length > 0, `${locale} meta complete`)
}

const patch = read('cordis.patch.yml')
assert.match(patch, /^- insert:/m)
assert.match(patch, /id: persona/)
assert.match(patch, /name: 'dsh-persona-mask'/)
assert.match(patch, /active: 'off'/)

const icon = read('icon.svg')
assert.match(icon, /^<svg[\s\S]*<\/svg>\s*$/)
assert.ok(Buffer.byteLength(icon) < 256 * 1024, 'icon under 256 KiB')

const host = read('index.js')
const client = read('client.js')
assert.doesNotMatch(host, /from\s+['"]@deepseek-ai\//, 'host imports no @deepseek-ai package')
assert.match(client, /window\.__ModuleLoader__\.load/)
assert.match(client, /id:\s*'dsh-persona-mask'/)
assert.match(client, /settings\.section/)
assert.match(client, /\/persona-mask\/state/)
assert.match(client, /\/persona-mask\/custom/)

console.log('persona-mask bundle test: ok')
