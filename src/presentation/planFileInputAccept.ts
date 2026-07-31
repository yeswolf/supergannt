/**
 * `accept` for the Open plan file picker.
 *
 * Android WebView maps unknown extensions (e.g. `.mpp`) poorly and filters the
 * system picker by MIME type. Real `.mpp` files are often `application/octet-stream`,
 * so a narrow accept list greys them out. Use all-files accept on Android; codecs
 * still validate by extension after pick.
 */
export function planFileInputAccept(): string {
  if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) {
    return '*/*'
  }
  return [
    '.xml',
    '.mspdi',
    '.mpp',
    '.mpt',
    '.mpx',
    'application/xml',
    'text/xml',
    'application/vnd.ms-project',
    'application/octet-stream',
  ].join(',')
}
