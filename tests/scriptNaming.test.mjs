import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createScriptNaming,
  makeDefaultScriptName,
  makePythonClassName,
  makeScriptSlug,
  sanitizeScriptDisplayName,
} from '../client/src/utils/scriptNaming.js'

test('script display names are trimmed and spaces become safe underscores', () => {
  assert.equal(sanitizeScriptDisplayName('  Operator   NanoKontrol  ', 'Fallback'), 'Operator NanoKontrol')
  assert.equal(makeScriptSlug('Operator NanoKontrol'), 'Operator_NanoKontrol')
  assert.equal(makePythonClassName('Operator NanoKontrol'), 'OperatorNanoKontrol')
})

test('accents and separators are removed from script identifiers', () => {
  assert.deepEqual(createScriptNaming('Écho César test'), {
    scriptDisplayName: 'Écho César test',
    scriptSlug: 'Echo_Cesar_Test',
    pythonClassName: 'EchoCesarTest',
  })
  assert.equal(makeScriptSlug('Auto Filter - Launch Control XL'), 'Auto_Filter_Launch_Control_XL')
  assert.equal(makePythonClassName('Auto Filter - Launch Control XL'), 'AutoFilterLaunchControlXL')
})

test('identifiers beginning with a number receive a Script prefix', () => {
  assert.equal(makeScriptSlug('123 test'), 'Script_123_Test')
  assert.equal(makePythonClassName('123 test'), 'Script123Test')
})

test('empty names use a non-empty device and controller fallback', () => {
  const fallback = makeDefaultScriptName({ deviceName: 'Operator', controllerName: 'nanoKONTROL2 SLIDER/KNOB' })
  const naming = createScriptNaming('', fallback)
  assert.equal(fallback, 'Operator nanoKONTROL2 Remote')
  assert.equal(naming.scriptSlug, 'Operator_NanoKONTROL2_Remote')
  assert.equal(naming.pythonClassName, 'OperatorNanoKONTROL2Remote')
})
