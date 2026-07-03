const stripAccents = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')

const wordsFromName = (value) => stripAccents(value)
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .trim()
  .split(/\s+/)
  .filter(Boolean)

const titleToken = (token) => {
  if (!token) return ''
  return `${token.charAt(0).toUpperCase()}${token.slice(1)}`
}

export function sanitizeScriptDisplayName(name, fallback = 'Ableton Device Remote') {
  const cleanFallback = String(fallback || 'Ableton Device Remote').trim().replace(/\s+/g, ' ')
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ')
  return cleaned || cleanFallback || 'Ableton Device Remote'
}

export function makeScriptSlug(displayName) {
  const words = wordsFromName(displayName).map(titleToken)
  const withFallback = words.length ? words : ['Script']
  if (!/^[a-zA-Z]/.test(withFallback[0])) withFallback.unshift('Script')
  return withFallback.join('_')
}

export function makePythonClassName(displayName) {
  return makeScriptSlug(displayName).split('_').map(titleToken).join('')
}

export function makeDefaultScriptName({ deviceName, controllerName } = {}) {
  const device = sanitizeScriptDisplayName(deviceName, 'Ableton Device')
  let controller = sanitizeScriptDisplayName(controllerName, 'MIDI Controller')
  if (/^your midi controller$/i.test(controller)) controller = 'MIDI Controller'
  controller = controller.replace(/\s+(?:SLIDER\s*\/\s*KNOB|MIDI PORT|INPUT PORT)$/i, '')
  return `${device} ${controller} Remote`.trim().replace(/\s+/g, ' ')
}

export function createScriptNaming(name, fallback) {
  const scriptDisplayName = sanitizeScriptDisplayName(name, fallback)
  return {
    scriptDisplayName,
    scriptSlug: makeScriptSlug(scriptDisplayName),
    pythonClassName: makePythonClassName(scriptDisplayName),
  }
}
