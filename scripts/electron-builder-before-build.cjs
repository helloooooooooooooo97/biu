/**
 * Runtime dependencies are staged under pack-host/node_modules by electron-pack.mjs.
 * Returning false tells electron-builder that node_modules are handled externally,
 * preventing a second 60k-file copy into Resources/app before macOS signing.
 */
module.exports = async function beforeBuild() {
  return false
}
