import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Script } from 'node:vm'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const source = read('assets/js/tool-share.js')

test('all four tools load the same share disclosure assets exactly once', () => {
  for (const tool of ['photo-to-sketch-online', 'mural-visualizer', 'art-concept-generator', 'concept-lab']) {
    const html = read(`tools/${tool}/index.html`)
    assert.equal(html.split('src="/assets/js/tool-share.js"').length - 1, 1)
    assert.equal(html.split('href="/assets/tool-share.css"').length - 1, 1)
  }
  assert.doesNotThrow(() => new Script(source))
})

test('share links exclude session query strings and do not upload artwork', () => {
  assert.match(source, /location\.pathname/)
  assert.doesNotMatch(source, /location\.(?:search|hash|href)|fetch\(/)
  for (const channel of ['WhatsApp', 'Facebook', 'X / Twitter', 'Telegram', 'LinkedIn', 'Instagram', 'TikTok', 'Pinterest']) assert.ok(source.includes(channel))
  assert.match(source, /e\.name!=="AbortError"/)
  assert.match(source, /navigator\.canShare\(\{files:\[file\]\}\)/)
})

test('disclosure has keyboard dismissal, live feedback and resets with result state', () => {
  assert.match(source, /createElement\("details"\)/)
  assert.match(source, /aria-live="polite"/)
  assert.match(source, /e\.key==="Escape"/)
  assert.match(source, /root\.hidden=!next;root\.open=false/)
  assert.match(read('assets/tool-share.css'), /\.beo-share \[hidden\]/)
  assert.match(read('service-worker.js'), /"\/assets\/js\/tool-share\.js"/)
})
