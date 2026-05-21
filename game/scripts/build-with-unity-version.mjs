import { spawn } from 'node:child_process'

function padDatePart(value) {
  return String(value).padStart(2, '0')
}

function createUnityBuildVersion(date) {
  return [
    date.getUTCFullYear(),
    padDatePart(date.getUTCMonth() + 1),
    padDatePart(date.getUTCDate()),
  ].join('') + '-' + [
    padDatePart(date.getUTCHours()),
    padDatePart(date.getUTCMinutes()),
    padDatePart(date.getUTCSeconds()),
  ].join('') + 'Z'
}

const unityBuildVersion = process.env.VITE_UNITY_BUILD_VERSION?.trim() || createUnityBuildVersion(new Date())

console.log(`Building game with Unity build version ${unityBuildVersion}`)

const viteProcess = spawn('vite', ['build'], {
  env: {
    ...process.env,
    VITE_UNITY_BUILD_VERSION: unityBuildVersion,
  },
  stdio: 'inherit',
})

viteProcess.on('error', (error) => {
  console.error('Failed to start Vite build:', error)
  process.exit(1)
})

viteProcess.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
