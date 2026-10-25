// Builds the helper (helper/*.cs) into helper/bin/BlimoHelper.exe with the C# compiler that
// comes with Windows (part of .NET Framework 4), so there's nothing to install. It links against the
// media info descriptions Windows keeps in System32\WinMetadata. Skipped when the exe is already newer
// than every source file, and off Windows, where the app runs without the helper.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const folder = path.join(root, 'helper')
const sources = readdirSync(folder)
  .filter((file) => file.endsWith('.cs'))
  .sort()
  .map((file) => path.join(folder, file))
const out = path.join(folder, 'bin', 'BlimoHelper.exe')

if (process.platform !== 'win32') {
  console.log('helper: skipped (Windows only)')
  process.exit(0)
}
if (existsSync(out) && sources.every((source) => statSync(out).mtimeMs > statSync(source).mtimeMs)) {
  console.log('helper: up to date')
  process.exit(0)
}

const windows = process.env.WINDIR ?? 'C:\\Windows'
const framework = path.join(windows, 'Microsoft.NET', 'Framework64', 'v4.0.30319')
const metadata = path.join(windows, 'System32', 'WinMetadata')
mkdirSync(path.dirname(out), { recursive: true })
execFileSync(
  path.join(framework, 'csc.exe'),
  [
    '-nologo',
    '-optimize+',
    // No console window pops up when Blimo starts it.
    '-target:winexe',
    `-out:${out}`,
    `-r:${path.join(metadata, 'Windows.Media.winmd')}`,
    `-r:${path.join(metadata, 'Windows.Foundation.winmd')}`,
    `-r:${path.join(framework, 'System.Runtime.dll')}`,
    `-r:${path.join(framework, 'System.Runtime.InteropServices.WindowsRuntime.dll')}`,
    ...sources,
  ],
  { stdio: 'inherit' },
)
console.log(`helper: built ${path.relative(root, out)}`)
