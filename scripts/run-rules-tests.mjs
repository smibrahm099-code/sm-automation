// Runs the firestore.rules tests against the Firestore emulator.
//
// firebase-tools would normally start the emulator, but it will not install on every machine, so
// this starts the emulator jar directly. Download it once (about 61 MB) with:
//   npm run emulator:get
// Any Java 11 or newer works; a JetBrains IDE ships one, which is used if nothing else is found.
import {spawn, spawnSync} from 'node:child_process'
import {existsSync, readdirSync} from 'node:fs'
import {createConnection} from 'node:net'
import {join} from 'node:path'

const JAR = '.emulator/firestore-emulator.jar'
const HOST = '127.0.0.1'
const PORT = 8080

function findJava() {
  if (process.env.JAVA_HOME) {
    const p = join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    if (existsSync(p)) return p
  }
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['java'], {encoding:'utf8'})
  if (which.status === 0) return which.stdout.split(/\r?\n/)[0].trim()
  // a JetBrains IDE bundles its own runtime
  for (const base of ['C:/Program Files/JetBrains', join(process.env.LOCALAPPDATA || '', 'JetBrains')]) {
    if (!existsSync(base)) continue
    for (const dir of readdirSync(base)) {
      const p = join(base, dir, 'jbr', 'bin', 'java.exe')
      if (existsSync(p)) return p
    }
  }
  return null
}

const waitForPort = (ms = 60000) => new Promise((resolve, reject) => {
  const deadline = Date.now() + ms
  const tick = () => {
    const s = createConnection({host:HOST, port:PORT})
    s.on('connect', () => { s.destroy(); resolve() })
    s.on('error', () => {
      s.destroy()
      if (Date.now() > deadline) reject(new Error('the emulator did not start in time'))
      else setTimeout(tick, 400)
    })
  }
  tick()
})

const java = findJava()
if (!java) {
  console.error('No Java found. The Firestore emulator needs Java 11 or newer; set JAVA_HOME and try again.')
  process.exit(1)
}
if (!existsSync(JAR)) {
  console.error(`Emulator not found at ${JAR}. Run: npm run emulator:get`)
  process.exit(1)
}

const emulator = spawn(java, ['-jar', JAR, `--host=${HOST}`, `--port=${PORT}`], {stdio:'ignore'})
const stop = () => { try { emulator.kill() } catch {} }
process.on('exit', stop)
process.on('SIGINT', () => { stop(); process.exit(130) })

try {
  await waitForPort()
} catch (e) {
  console.error(e.message)
  stop()
  process.exit(1)
}

const vitest = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.rules.config.js'],
  {stdio:'inherit', shell: process.platform === 'win32', env:{...process.env, FIRESTORE_EMULATOR_HOST:`${HOST}:${PORT}`}})
stop()
process.exit(vitest.status ?? 1)
