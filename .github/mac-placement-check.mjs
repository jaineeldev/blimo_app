// Tries the built app on GitHub's Mac, the only Mac it gets before it ships. The workflow opens it with
// --inspect=9229; this reaches into its main process to check the buddy can be put anywhere on the screen,
// and that a real mouse drag moves it while another app is in front.
// Writes placement.txt and place-*.png for the "Mac screenshots" download. Fails if the buddy got stuck.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const report = (line) => {
  console.log(line)
  appendFileSync('placement.txt', `${line}\n`)
}

const [{ webSocketDebuggerUrl }] = await (await fetch('http://127.0.0.1:9229/json/list')).json()
const socket = new WebSocket(webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.onopen = resolve
  socket.onerror = reject
})
const replies = new Map()
let lastId = 0
socket.onmessage = ({ data }) => {
  const reply = JSON.parse(data)
  replies.get(reply.id)?.(reply)
}

/** Runs `body` in the app's main process, with `win` and `screen` to hand, and gives back what it returns. */
async function inApp(body) {
  const id = ++lastId
  const expression = `(() => {
    const { BrowserWindow, screen } = process.getBuiltinModule('module').createRequire('/tmp/check.js')('electron')
    const win = BrowserWindow.getAllWindows()[0]
    return JSON.stringify((() => { ${body} })())
  })()`
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
  const { result } = await new Promise((resolve) => replies.set(id, resolve))
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return JSON.parse(result.result.value)
}

const { x: left, y: top, width: screenWidth, height: screenHeight } = await inApp('return screen.getPrimaryDisplay().bounds')
const { width, height } = await inApp('return win.getBounds()')
/** Where the window goes for the buddy, in its middle, to be at (x, y). */
const around = (x, y) => ({ x: Math.round(x - width / 2), y: Math.round(y - height / 2), width, height })
const place = (bounds) => inApp(`win.setBounds(${JSON.stringify(bounds)}); return win.getBounds()`)

const SPOTS = {
  'over the menu bar': [left + screenWidth / 2, top + 12],
  'over the Dock': [left + screenWidth / 2, top + screenHeight - 40],
  'top left corner': [left + 100, top + 100],
  'bottom right corner': [left + screenWidth - 100, top + screenHeight - 100],
}

let stuck = false
for (const [name, [x, y]] of Object.entries(SPOTS)) {
  const wanted = around(x, y)
  const got = await place(wanted)
  const ok = got.x === wanted.x && got.y === wanted.y
  if (!ok) stuck = true
  report(`${ok ? 'ok   ' : 'STUCK'} ${name}: wanted ${wanted.x},${wanted.y}, got ${got.x},${got.y}`)
  await wait(500)
  execFileSync('screencapture', ['-x', `place-${name.replaceAll(' ', '-')}.png`])
}

// A real drag, from the middle of the screen up to the top, with Finder in front so the first press has
// to count. It starts with a small move, as a hand would: the buddy follows from where the drag begins.
const start = { x: Math.round(left + screenWidth / 2), y: Math.round(top + screenHeight / 2) }
const goal = { x: start.x, y: Math.round(top + 60) }
await place(around(start.x, start.y))
execFileSync('open', ['-a', 'Finder'])
await wait(1000)
report(`Blimo in front before the drag: ${await inApp('return win.isFocused()')}`)
const moves = [`dm:${start.x},${start.y - 6}`, 'w:120', ...[0.25, 0.5, 0.75, 1].flatMap((u) => [`dm:${start.x},${Math.round(start.y + (goal.y - start.y) * u)}`, 'w:120'])]
execFileSync('cliclick', [`m:${start.x},${start.y}`, 'w:700', `dd:${start.x},${start.y}`, 'w:150', ...moves, `du:${goal.x},${goal.y}`])
await wait(600)
const cursor = await inApp('return screen.getCursorScreenPoint()')
const dropped = await inApp('return win.getBounds()')
const buddyY = dropped.y + height / 2
execFileSync('screencapture', ['-x', 'place-after-drag.png'])
if (cursor.y !== goal.y) {
  report(`not tested: GitHub's Mac didn't let the simulated mouse move (it's at ${cursor.x},${cursor.y})`)
} else {
  const ok = Math.abs(buddyY - goal.y) <= 12
  if (!ok) stuck = true
  report(`${ok ? 'ok   ' : 'STUCK'} real drag to the top: wanted its middle at y ${goal.y}, got ${buddyY}`)
}

socket.close()
process.exitCode = stuck ? 1 : 0
