// Builds helper/DesktopBuddyHelper.cs into helper/bin/DesktopBuddyHelper.exe with the C# compiler that
// comes with Windows (part of .NET Framework 4), so there's nothing to install. It links against the
// media info descriptions Windows keeps in System32\WinMetadata. Skipped when the exe is already newer
// than the source, and off Windows, where the app runs without the helper.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'helper', 'DesktopBuddyHelper.cs')
const out = path.join(root, 'helper', 'bin', 'DesktopBuddyHelper.exe')

if (process.platform !== 'win32') {
  console.log('helper: skipped (Windows only)')
  process.exit(0)
}
if (existsSync(out) && statSync(out).mtimeMs > statSync(source).mtimeMs) {
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
    // No console window pops up when DesktopBuddy starts it.
    '-target:winexe',
    `-out:${out}`,
    `-r:${path.join(metadata, 'Windows.Media.winmd')}`,
    `-r:${path.join(metadata, 'Windows.Foundation.winmd')}`,
    `-r:${path.join(framework, 'System.Runtime.dll')}`,
    `-r:${path.join(framework, 'System.Runtime.InteropServices.WindowsRuntime.dll')}`,
    source,
  ],
  { stdio: 'inherit' },
)
console.log(`helper: built ${path.relative(root, out)}`)
