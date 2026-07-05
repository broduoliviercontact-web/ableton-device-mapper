import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { findCatalogDevice } from '../client/src/data/abletonDeviceCatalog.js'
import {
  addCustomControl,
  assignMidiSourceToMapping,
  createCustomLayout,
  removeCustomControl,
  updateAssignedMidiValues,
  updateCustomControl,
} from '../client/src/utils/customLayoutBuilder.js'
import { createPortableProfile, detectMappingWarnings, parsePortableProfile } from '../client/src/utils/layoutBuilder.js'
import { generateAbletonDeviceRemoteScriptFiles } from '../client/src/generators/abletonDeviceRemoteScriptGenerator.js'

const catalogPath = path.join(process.cwd(), 'client/src/data/abletonDeviceParameterCatalog.json')
const previewPath = path.join(process.cwd(), 'client/src/components/ControllerLayoutPreview.jsx')
const terminalPreviewPath = path.join(process.cwd(), 'client/src/components/TerminalControllerLayoutPreview.jsx')
const appPath = path.join(process.cwd(), 'client/src/AbletonDeviceMapper.jsx')
const loadOperator = async () => findCatalogDevice(JSON.parse(await readFile(catalogPath, 'utf8')), 'Operator')
const idFactory = (() => { let index = 0; return (prefix) => `${prefix}-${++index}` })()

test('custom layout creates 2 faders, 3 knobs, and 1 button as six visual mappings', async () => {
  const device = await loadOperator()
  const created = createCustomLayout({ name: 'My Custom Operator Layout', faders: 2, knobs: 3, buttons: 1, device, instanceId: 'custom-1', idFactory })
  assert.equal(created.mappings.length, 6)
  assert.equal(created.customLayout.controllerLayoutType, 'custom_grid')
  assert.equal(created.customLayout.controls.length, 6)
  assert.equal(created.mappings.filter((mapping) => mapping.controlType === 'continuous').length, 5)
  const button = created.mappings.find((mapping) => mapping.visualControlKind === 'button')
  assert.equal(button.controlType, 'button')
  assert.equal(button.buttonMode, 'toggle_in_script')
  assert.equal(button.preferredControlKind, 'button')
  assert.ok(created.mappings.every((mapping) => mapping.visualControlId && mapping.visualControlKind && mapping.visualControlLabel))
  assert.deepEqual(created.mappings.map((mapping) => mapping.preferredControlKind), ['fader', 'fader', 'knob', 'knob', 'knob', 'button'])
})

test('custom controls can be added, changed, and removed with their mapping', async () => {
  const device = await loadOperator()
  const created = createCustomLayout({ name: 'Mutable', faders: 0, knobs: 0, buttons: 0, device, instanceId: 'custom-2', idFactory })
  let state = { customLayouts: [created.customLayout], layoutStack: [created.layoutEntry], mappings: [] }
  state = addCustomControl(state, { layoutInstanceId: 'custom-2', kind: 'knob', device, idFactory })
  state = addCustomControl(state, { layoutInstanceId: 'custom-2', kind: 'fader', device, idFactory })
  state = addCustomControl(state, { layoutInstanceId: 'custom-2', kind: 'button', device, idFactory })
  assert.deepEqual(state.mappings.map((mapping) => mapping.visualControlKind), ['knob', 'fader', 'button'])
  const knob = state.mappings[0]
  state = updateCustomControl(state, knob.visualControlId, { label: 'Cutoff', kind: 'fader' })
  assert.equal(state.mappings[0].visualControlLabel, 'Cutoff')
  assert.equal(state.mappings[0].preferredControlKind, 'fader')
  state = removeCustomControl(state, knob.visualControlId)
  assert.equal(state.mappings.length, 2)
  assert.equal(state.customLayouts[0].controls.length, 2)
  assert.equal(state.layoutStack[0].controlCount, 2)
})

test('visual Learn MIDI assigns the intended mapping and duplicate MIDI remains a warning', async () => {
  const device = await loadOperator()
  const created = createCustomLayout({ name: 'Learn', faders: 0, knobs: 2, buttons: 0, device, instanceId: 'custom-3', idFactory })
  const source = { id: 'cc-16', endpointName: 'Controller', frameworkChannel: 0, userChannel: 1, data1: 16, controlKind: 'knob', label: 'CC 16' }
  let mappings = assignMidiSourceToMapping(created.mappings, created.mappings[0].id, source)
  assert.equal(mappings[0].source.data1, 16)
  assert.equal(mappings[1].source, null)
  mappings = assignMidiSourceToMapping(mappings, mappings[1].id, source)
  assert.ok(detectMappingWarnings(mappings, device).some((warning) => warning.type === 'duplicate_midi_source'))
})

test('assigned visual controls follow subsequent MIDI values in real time', async () => {
  const device = await loadOperator()
  const created = createCustomLayout({ name: 'Live values', faders: 1, knobs: 1, buttons: 1, device, instanceId: 'custom-live', idFactory })
  const source = { id: 'Controller-0-16', endpointName: 'Controller', frameworkChannel: 0, userChannel: 1, data1: 16, lastValue: 0, controlKind: 'fader', label: 'CC 16' }
  let mappings = assignMidiSourceToMapping(created.mappings, created.mappings[0].id, source)
  mappings = updateAssignedMidiValues(mappings, source, 96)
  assert.equal(mappings[0].source.lastValue, 96)
  assert.equal(mappings[1].source, null)
  mappings = updateAssignedMidiValues(mappings, source, 255)
  assert.equal(mappings[0].source.lastValue, 127)
})

test('portable and generated profiles preserve custom layouts, button mode, and invert', async () => {
  const device = await loadOperator()
  const created = createCustomLayout({ name: 'Profile Grid', faders: 1, knobs: 0, buttons: 1, device, instanceId: 'custom-4', idFactory })
  created.mappings[0].invert = true
  created.mappings[0].scaling = 'inverted_parameter_min_max'
  created.mappings[1].buttonMode = 'momentary'
  const portable = createPortableProfile({ scriptName: 'Custom Grid', targetDeviceKey: device.catalogKey, layoutStack: [created.layoutEntry], mappings: created.mappings, controlPool: [], customLayouts: [created.customLayout] })
  const restored = parsePortableProfile(JSON.stringify(portable))
  assert.equal(restored.customLayouts[0].layoutName, 'Profile Grid')
  assert.equal(restored.mappings[0].invert, true)
  assert.equal(restored.mappings[1].buttonMode, 'momentary')

  const files = generateAbletonDeviceRemoteScriptFiles({ device, mappings: [], scriptDisplayName: 'Custom Grid', layoutStack: [created.layoutEntry], customLayouts: [created.customLayout] })
  const profile = JSON.parse(files['profile.json'])
  assert.equal(profile.customLayouts[0].controllerLayoutType, 'custom_grid')
})

test('ControllerLayoutPreview exposes visual controls and per-control editing actions', async () => {
  const source = await readFile(previewPath, 'utf8')
  assert.match(source, /controller-knob/)
  assert.match(source, /controller-fader/)
  assert.match(source, /controller-button/)
  assert.match(source, /controller-button--active/)
  assert.match(source, /Fader value/)
  assert.match(source, /Knob value/)
  assert.match(source, /Learn MIDI/)
  assert.match(source, /Visual target parameter/)
  assert.match(source, /Remove control/)
  assert.match(source, /\+ Add knob/)
  assert.match(source, /Visual button mode/)
})

test('normal and terminal Custom Layout renderers share one persistent theme switch', async () => {
  const [terminalSource, appSource] = await Promise.all([readFile(terminalPreviewPath, 'utf8'), readFile(appPath, 'utf8')])
  assert.match(terminalSource, /CUSTOM GRID \/ MIDI SURFACE/)
  assert.match(terminalSource, /ascii-control-glyph/)
  assert.match(appSource, /TerminalControllerLayoutPreview/)
  assert.match(appSource, /ableton-device-mapper-theme/)
  assert.match(appSource, /Interface style/)
})
