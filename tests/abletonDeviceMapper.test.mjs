import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  LAYOUT_PRESETS,
  OPERATOR_MUSICAL_8,
  findCatalogDevice,
  getCatalogDevices,
} from '../client/src/data/abletonDeviceCatalog.js'
import {
  createAbletonDeviceProfile,
  generateAbletonDeviceRemoteScriptFiles,
} from '../client/src/generators/abletonDeviceRemoteScriptGenerator.js'
import { buildAbletonDeviceMapperPack } from '../client/src/generators/abletonDevicePackGenerator.js'

const catalogPath = path.join(process.cwd(), 'client/src/data/abletonDeviceParameterCatalog.json')
const uiPath = path.join(process.cwd(), 'client/src/AbletonDeviceMapper.jsx')

const loadCatalog = async () => JSON.parse(await readFile(catalogPath, 'utf8'))

const operatorMapping = (parameter) => ({
  id: `operator-${parameter.name}`,
  source: {
    endpointName: 'nanoKONTROL2 SLIDER/KNOB',
    messageType: 'CONTROLCHANGE',
    userChannel: 1,
    frameworkChannel: 0,
    data1: 16,
    controlKind: 'knob',
    label: 'Knob 1',
  },
  controlType: 'continuous',
  targetType: 'ableton_device_parameter',
  targetDeviceName: 'Operator',
  targetDeviceAliases: ['Operator'],
  targetParameterName: parameter.name,
  parameterAliases: [parameter.name],
  parameterIndex: parameter.parameterIndex,
  liveIndex: parameter.liveIndex,
  parameterSection: parameter.section,
  allowIndexFallback: false,
  scaling: 'parameter_min_max',
})

test('combined Ableton device catalog is loaded and contains Operator', async () => {
  const catalog = await loadCatalog()
  const devices = getCatalogDevices(catalog)
  const operator = findCatalogDevice(catalog, 'Operator')
  assert.equal(catalog.abletonVersion, '12.4.5b6')
  assert.equal(catalog.deviceCount, 83)
  assert.equal(catalog.totalParameters, 2746)
  assert.equal(devices.length, 83)
  assert.ok(operator)
  assert.equal(operator.deviceCategory, 'instrument')
  assert.equal(operator.parameterCount, 195)
})

test('Operator catalog contains the validated Musical 8 parameters and indices', async () => {
  const operator = findCatalogDevice(await loadCatalog(), 'Operator')
  for (const name of OPERATOR_MUSICAL_8) {
    const parameter = operator.parameters.find((candidate) => candidate.name === name)
    assert.ok(parameter, `missing ${name}`)
    assert.equal(typeof parameter.liveIndex, 'number')
    assert.equal(typeof parameter.parameterIndex, 'number')
  }
  assert.equal(operator.parameters.find((parameter) => parameter.name === 'Volume').parameterIndex, 3)
  assert.equal(operator.parameters.find((parameter) => parameter.name === 'Tone').parameterIndex, 7)
  assert.equal(operator.parameters.find((parameter) => parameter.name === 'Filter Freq').parameterIndex, 169)
})

test('Ableton Device Mapper UI exposes device, parameter and preset controls', async () => {
  const source = await readFile(uiPath, 'utf8')
  assert.match(source, /Ableton Device Mapper/)
  assert.match(source, /Choose Ableton Device/)
  assert.match(source, /aria-label="Ableton device"/)
  assert.match(source, /aria-label="Search parameter"/)
  assert.ok(LAYOUT_PRESETS.some((preset) => preset.label === 'Operator Musical 8'))
  assert.match(source, /Name match first/)
  assert.match(source, /Fallback index disabled by default/)
  assert.match(source, /No companion target required/)
})

test('native Ableton generator preserves listener, lookup and scaling safety', async () => {
  const operator = findCatalogDevice(await loadCatalog(), 'Operator')
  const volume = operator.parameters.find((parameter) => parameter.name === 'Volume')
  const mapping = operatorMapping(volume)
  const files = generateAbletonDeviceRemoteScriptFiles({ device: operator, mappings: [mapping] })
  const script = files[`${files.scriptSlug}.py`]
  const profile = JSON.parse(files['profile.json'])

  assert.match(script, /EncoderElement/)
  assert.match(script, /MIDI_CC_TYPE/)
  assert.match(script, /add_value_listener/)
  assert.match(script, /self\._controls/)
  assert.match(script, /BUILD_ID/)
  assert.match(script, /def _find_target_device/)
  assert.match(script, /def _find_parameter/)
  assert.match(script, /parameter_aliases/)
  assert.match(script, /parameter\.min/)
  assert.match(script, /parameter\.max/)
  assert.match(script, /safe fallback accepted/)
  assert.doesNotMatch(script, /self\.log_message\(/)
  assert.doesNotMatch(script, /def receive_midi\(/)
  assert.doesNotMatch(script, /DeviceComponent/)
  assert.doesNotMatch(script, /set_device_component/)
  assert.equal(profile.mapperType, 'ableton_device')
  assert.equal(profile.mappings[0].allowIndexFallback, false)
  assert.deepEqual(profile.mappings[0].parameterAliases, ['Volume'])
})

test('native Ableton profile follows the documented target contract', async () => {
  const operator = findCatalogDevice(await loadCatalog(), 'Operator')
  const volume = operator.parameters.find((parameter) => parameter.name === 'Volume')
  const profile = createAbletonDeviceProfile({ device: operator, mappings: [operatorMapping(volume)], scriptSlug: 'operator_nanokontrol_remote' })
  assert.equal(profile.schemaVersion, '0.1')
  assert.equal(profile.scriptSlug, 'operator_nanokontrol_remote')
  assert.equal(profile.target.deviceName, 'Operator')
  assert.equal(profile.target.deviceMatchMode, 'name_or_class')
  assert.equal(profile.target.searchScope, 'selected_track_then_all_tracks')
  assert.equal(profile.mappings[0].parameterIndex, 3)
  assert.equal(profile.mappings[0].scaling, 'parameter_min_max')
})

test('generated native Ableton Python compiles', async () => {
  const operator = findCatalogDevice(await loadCatalog(), 'Operator')
  const volume = operator.parameters.find((parameter) => parameter.name === 'Volume')
  const files = generateAbletonDeviceRemoteScriptFiles({ device: operator, mappings: [operatorMapping(volume)] })
  const directory = await mkdtemp(path.join(tmpdir(), 'ableton-device-mapper-'))
  const scriptPath = path.join(directory, `${files.scriptSlug}.py`)
  try {
    await writeFile(scriptPath, files[`${files.scriptSlug}.py`], 'utf8')
    const result = spawnSync('python3', ['-m', 'py_compile', scriptPath], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('native Ableton ZIP contains installation and troubleshooting support', async () => {
  const operator = findCatalogDevice(await loadCatalog(), 'Operator')
  const volume = operator.parameters.find((parameter) => parameter.name === 'Volume')
  const { zip, scriptSlug } = buildAbletonDeviceMapperPack({ device: operator, mappings: [operatorMapping(volume)], inputName: 'nanoKONTROL2 SLIDER/KNOB' })
  const names = Object.keys(zip.files)
  const prefix = 'Ableton_Device_Mapper_Pack/'
  assert.ok(names.includes(`${prefix}1_COPY_THIS_FOLDER_TO_REMOTE_SCRIPTS/${scriptSlug}/__init__.py`))
  assert.ok(names.includes(`${prefix}1_COPY_THIS_FOLDER_TO_REMOTE_SCRIPTS/${scriptSlug}/${scriptSlug}.py`))
  assert.ok(names.includes(`${prefix}1_COPY_THIS_FOLDER_TO_REMOTE_SCRIPTS/${scriptSlug}/profile.json`))
  assert.ok(names.includes(`${prefix}2_READ_ME_FIRST.md`))
  assert.ok(names.includes(`${prefix}INSTALL_CHECK.command`))
  assert.ok(names.includes(`${prefix}TROUBLESHOOTING.md`))
  const profile = JSON.parse(await zip.file(`${prefix}1_COPY_THIS_FOLDER_TO_REMOTE_SCRIPTS/${scriptSlug}/profile.json`).async('string'))
  assert.equal(profile.mapperType, 'ableton_device')
  assert.ok(profile.mappings.every((mapping) => mapping.allowIndexFallback === false))
  const troubleshooting = await zip.file(`${prefix}TROUBLESHOOTING.md`).async('string')
  assert.match(troubleshooting, /Device not found/)
  assert.match(troubleshooting, /Parameter not found/)
  assert.match(troubleshooting, /Wrong parameter moves/)
  assert.match(troubleshooting, /Nothing moves/)
})
