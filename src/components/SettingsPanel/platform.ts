/** Things that differ by system: a Mac says "open at login", and only Windows has the media helper. */
export const IS_MAC = window.buddy?.platform === 'darwin'
export const HAS_HELPER = window.buddy?.platform === 'win32'
