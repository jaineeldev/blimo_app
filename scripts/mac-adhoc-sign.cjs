// Gives the finished Mac app an ad-hoc signature (no Apple certificate needed), so a downloaded copy gets
// macOS's Open Anyway rather than being called damaged. electron-builder 24 can't do this itself.
// Runs after packing, before the dmg and zip are made. A universal build packs each architecture in a
// temporary folder first, then merges them; only the merged app, in mac-universal, gets signed.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

module.exports = async ({ electronPlatformName, appOutDir, packager }) => {
  if (electronPlatformName !== 'darwin' || path.basename(appOutDir) !== 'mac-universal') return
  const app = path.join(appOutDir, `${packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
}
