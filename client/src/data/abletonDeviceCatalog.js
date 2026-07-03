export const DEVICE_CATEGORIES = [
  { value: 'instrument', label: 'Instruments' },
  { value: 'audio_effect', label: 'Audio Effects' },
  { value: 'midi_effect', label: 'MIDI Effects' },
]

export const OPERATOR_MUSICAL_8 = [
  'Volume',
  'Tone',
  'Filter Freq',
  'Filter Res',
  'Osc-A Level',
  'Osc-B Level',
  'Osc-C Level',
  'Osc-D Level',
]

export const LAYOUT_PRESETS = [
  { id: '8-knobs', label: '8 Knobs', count: 8, controlKind: 'knob' },
  { id: '8-faders', label: '8 Faders', count: 8, controlKind: 'fader' },
  { id: '16-controls', label: '16 Controls', count: 16, controlKind: 'knob' },
  { id: 'operator-musical-8', label: 'Operator Musical 8', count: 8, controlKind: 'knob', deviceName: 'Operator', parameterNames: OPERATOR_MUSICAL_8 },
  { id: 'auto-filter-basic', label: 'Auto Filter Basic', count: 8, controlKind: 'knob', deviceName: 'Auto Filter' },
  { id: 'eq-eight-basic', label: 'EQ Eight Basic', count: 8, controlKind: 'knob', deviceName: 'EQ Eight' },
  { id: 'blank-custom', label: 'Blank Custom', count: 0, controlKind: 'knob' },
]

export function getCatalogDevices(catalog) {
  return Object.entries(catalog?.devices || {}).map(([catalogKey, device]) => ({
    catalogKey,
    ...device,
    deviceCategory: device.deviceCategory || 'unknown',
  }))
}

export function findCatalogDevice(catalog, nameOrKey) {
  const normalized = String(nameOrKey || '').toLowerCase()
  return getCatalogDevices(catalog).find((device) => (
    device.catalogKey.toLowerCase() === normalized
    || device.deviceName.toLowerCase() === normalized
    || device.deviceClassName.toLowerCase() === normalized
  )) || null
}

export function getRecommendedParameters(device, limit = Infinity) {
  const parameters = (device?.parameters || []).filter((parameter) => parameter.name !== 'Device On')
  const recommended = parameters.filter((parameter) => parameter.recommendedForKnob === true && parameter.risk !== 'unsafe')
  return (recommended.length ? recommended : parameters).slice(0, limit)
}

export function getPresetParameters(device, preset) {
  if (!device || !preset || preset.count === 0) return []
  if (preset.parameterNames) {
    return preset.parameterNames.map((name) => device.parameters.find((parameter) => parameter.name === name)).filter(Boolean)
  }
  return getRecommendedParameters(device, preset.count)
}
