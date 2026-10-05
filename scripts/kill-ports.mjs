/*mata cualquier puerto en los numeros mencionados*/ 
import { execSync } from 'child_process'
import { platform }  from 'os'

const PORTS = [3000, 5173, 5174]

function killWindows(port) {
  try {
    const out = execSync(
      `netstat -ano | findstr ":${port} "`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    )
    const pids = new Set(
      out.split('\n')
        .map(l => l.trim().split(/\s+/).at(-1))
        .filter(p => p && /^\d+$/.test(p) && p !== '0')
    )
    for (const pid of pids) {
      try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }) } catch (_) {}
    }
  } catch (_) {}
}

function killUnix(port) {
  try {
    execSync(`lsof -ti tcp:${port} | xargs kill -9`, { stdio: 'ignore' })
  } catch (_) {}
}

const isWin = platform() === 'win32'
for (const port of PORTS) {
  isWin ? killWindows(port) : killUnix(port)
}
console.log(`[kill-ports] Ports ${PORTS.join(', ')} freed.`)
