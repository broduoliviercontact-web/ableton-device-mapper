import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { ABLETON_DEVICE_LAYOUTS, getBestLayoutIds, getLayoutById } from '../client/src/data/abletonDeviceLayouts.js'
import { findCatalogDevice } from '../client/src/data/abletonDeviceCatalog.js'
import {
  addLayoutToBuilder,
  createControlPool,
  createPortableProfile,
  detectMappingWarnings,
  parsePortableProfile,
  removeLayoutFromBuilder,
} from '../client/src/utils/layoutBuilder.js'
import { generateAbletonDeviceRemoteScriptFiles } from '../client/src/generators/abletonDeviceRemoteScriptGenerator.js'
import { buildAbletonDeviceMapperPack } from '../client/src/generators/abletonDevicePackGenerator.js'

const catalogPath = path.join(process.cwd(), 'client/src/data/abletonDeviceParameterCatalog.json')
const loadOperator = async () => findCatalogDevice(JSON.parse(await readFile(catalogPath, 'utf8')), 'Operator')
const controls = Array.from({ length: 16 }, (_, index) => ({
  id: `control-${index}`,
  endpointName: 'Test Controller',
  frameworkChannel: 0,
  userChannel: 1,
  data1: index < 8 ? index : 8 + index,
  label: index < 8 ? `Fader ${index + 1}` : `Knob ${index - 7}`,
  controlKind: index < 8 ? 'fader' : 'knob',
}))

test('Operator modular layouts include Musical 8 and Filter 4', () => {
  assert.ok(ABLETON_DEVICE_LAYOUTS.Operator.some((layout) => layout.id === 'operator-musical-8'))
  assert.ok(ABLETON_DEVICE_LAYOUTS.Operator.some((layout) => layout.id === 'operator-filter-4'))
  assert.ok(ABLETON_DEVICE_LAYOUTS.Operator.some((layout) => layout.id === 'operator-envelope-8'))
})

test('layouts add to the current stack instead of replacing it', async () => {
  const device = await loadOperator()
  let state = { layoutStack: [], mappings: [] }
  state = addLayoutToBuilder(state, { layout: getLayoutById('Operator', 'operator-musical-8'), device, controls, instanceId: 'musical-1' })
  state = addLayoutToBuilder(state, { layout: getLayoutById('Operator', 'operator-filter-4'), device, controls, instanceId: 'filter-1' })
  assert.equal(state.layoutStack.length, 2)
  assert.equal(state.mappings.length, 12)
  assert.equal(state.mappings.filter((mapping) => mapping.layoutInstanceId === 'musical-1').length, 8)
  assert.equal(state.mappings.filter((mapping) => mapping.layoutInstanceId === 'filter-1').length, 4)
  assert.ok(state.mappings.every((mapping) => mapping.createdBy === 'layout'))
})

test('removing a layout keeps mappings created manually', async () => {
  const device = await loadOperator()
  let state = addLayoutToBuilder({ layoutStack: [], mappings: [] }, { layout: getLayoutById('Operator', 'operator-filter-4'), device, controls, instanceId: 'filter-1' })
  const manual = { ...state.mappings[0], id: 'manual-1', createdBy: 'manual', layoutId: null, layoutInstanceId: null }
  state.mappings.push(manual)
  const next = removeLayoutFromBuilder(state, 'filter-1')
  assert.equal(next.layoutStack.length, 0)
  assert.deepEqual(next.mappings.map((mapping) => mapping.id), ['manual-1'])
})

test('mapping health detects duplicate MIDI, duplicate parameter, and unassigned MIDI', async () => {
  const device = await loadOperator()
  const base = addLayoutToBuilder({ layoutStack: [], mappings: [] }, { layout: getLayoutById('Operator', 'operator-filter-4'), device, controls, instanceId: 'filter-1' }).mappings
  const mappings = [
    base[0],
    { ...base[1], source: base[0].source, targetParameterName: base[0].targetParameterName },
    { ...base[2], source: null },
  ]
  const warnings = detectMappingWarnings(mappings, device)
  assert.ok(warnings.some((warning) => warning.type === 'duplicate_midi_source'))
  assert.ok(warnings.some((warning) => warning.type === 'duplicate_parameter'))
  assert.ok(warnings.some((warning) => warning.type === 'unassigned_midi_source'))
})

test('control pool distinguishes assigned and free controls', async () => {
  const device = await loadOperator()
  const state = addLayoutToBuilder({ layoutStack: [], mappings: [] }, { layout: getLayoutById('Operator', 'operator-filter-4'), device, controls, instanceId: 'filter-1' })
  const pool = createControlPool(controls, state.mappings)
  assert.equal(pool.filter((control) => control.assigned).length, 4)
  assert.equal(pool.filter((control) => !control.assigned).length, 12)
})

test('Operator best layout contains the validated performance modules', async () => {
  const operator = await loadOperator()
  assert.deepEqual(getBestLayoutIds(operator), ['operator-musical-8', 'operator-filter-4', 'operator-oscillator-levels-4'])
})

test('portable profile export and import preserves builder state', async () => {
  const device = await loadOperator()
  const state = addLayoutToBuilder({ layoutStack: [], mappings: [] }, { layout: getLayoutById('Operator', 'operator-musical-8'), device, controls, instanceId: 'musical-1' })
  const controlPool = createControlPool(controls, state.mappings)
  const exported = createPortableProfile({ scriptName: 'Operator Performance Remote', targetDeviceKey: device.catalogKey, layoutStack: state.layoutStack, mappings: state.mappings, controlPool })
  const restored = parsePortableProfile(JSON.stringify(exported))
  assert.equal(restored.scriptName, 'Operator Performance Remote')
  assert.equal(restored.targetDeviceKey, 'Operator')
  assert.equal(restored.layoutStack.length, 1)
  assert.equal(restored.mappings.length, 8)
  assert.equal(restored.controlPool.length, 16)
})

test('generated profile and Python include layout metadata and invert scaling', async () => {
  const device = await loadOperator()
  const state = addLayoutToBuilder({ layoutStack: [], mappings: [] }, { layout: getLayoutById('Operator', 'operator-filter-4'), device, controls, instanceId: 'filter-1' })
  state.mappings[0].invert = true
  state.mappings[0].scaling = 'inverted_parameter_min_max'
  const controlPool = createControlPool(controls, state.mappings)
  const warnings = detectMappingWarnings(state.mappings, device)
  const files = generateAbletonDeviceRemoteScriptFiles({ device, mappings: state.mappings, scriptDisplayName: 'Operator Builder Remote', layoutStack: state.layoutStack, controlPool, mappingWarnings: warnings })
  const profile = JSON.parse(files['profile.json'])
  const script = files[`${files.scriptSlug}.py`]
  assert.equal(profile.layoutStack.length, 1)
  assert.equal(profile.controlPool.length, 16)
  assert.ok(Array.isArray(profile.mappingWarnings))
  assert.equal(profile.mappings[0].layoutId, 'operator-filter-4')
  assert.equal(profile.mappings[0].layoutInstanceId, 'filter-1')
  assert.equal(profile.mappings[0].createdBy, 'layout')
  assert.equal(profile.mappings[0].invert, true)
  assert.equal(profile.mappings[0].curve, 'linear')
  assert.match(script, /"invert": True/)
  assert.match(script, /def _scale_midi_to_parameter\(self, midi_value, parameter, invert=False\):/)
  assert.match(script, /if invert:\n\s+normalized = 1\.0 - normalized/)
})

test('ZIP export contains the enriched builder profile and conflict notes', async () => {
  const device = await loadOperator()
  const state = addLayoutToBuilder({ layoutStack: [], mappings: [] }, { layout: getLayoutById('Operator', 'operator-musical-8'), device, controls, instanceId: 'musical-1' })
  state.mappings.push({ ...state.mappings[0], id: 'duplicate-1' })
  const controlPool = createControlPool(controls, state.mappings)
  const mappingWarnings = detectMappingWarnings(state.mappings, device)
  const { zip, scriptSlug } = buildAbletonDeviceMapperPack({ device, mappings: state.mappings, inputName: 'Test Controller', scriptDisplayName: 'Operator Stack Remote', layoutStack: state.layoutStack, controlPool, mappingWarnings })
  const root = 'Ableton_Device_Mapper_Pack/'
  const profile = JSON.parse(await zip.file(`${root}1_COPY_THIS_FOLDER_TO_REMOTE_SCRIPTS/${scriptSlug}/profile.json`).async('string'))
  const readme = await zip.file(`${root}2_READ_ME_FIRST.md`).async('string')
  assert.equal(profile.layoutStack[0].layoutId, 'operator-musical-8')
  assert.equal(profile.controlPool.length, 16)
  assert.ok(profile.mappingWarnings.some((warning) => warning.type === 'duplicate_midi_source'))
  assert.match(readme, /Layout warnings/)
  assert.match(readme, /Duplicate MIDI source/)
})
