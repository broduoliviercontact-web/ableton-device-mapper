const usefulParameters = (device) => (device?.parameters || []).filter((parameter) => parameter.name !== 'Device On')
const allParameters = (device) => device?.parameters || []

export function isButtonLikeParameter(parameter) {
  if (!parameter?.name) return false
  if (parameter.name === 'Device On' || parameter.controlType === 'switch') return true
  const binaryRange = Number(parameter.min) === 0 && Number(parameter.max) === 1
  const buttonName = /(^|[\s-])(on|enable(?:d)?|active|sync|loop|hold|legato|retrig(?:ger)?|mono|glide)(\b|$)/i.test(parameter.name)
  if (binaryRange && (parameter.isQuantized === true || parameter.controlType === 'enum')) return true
  return buttonName && (binaryRange || parameter.controlType === 'enum' || (parameter.min == null && parameter.max == null))
}

const controlKey = (source) => source ? `${source.endpointName || ''}:${source.frameworkChannel}:${source.data1}` : ''
const cleanControl = (control) => {
  if (!control) return null
  const { assigned, assignedMappingIds, ...source } = control
  return source
}

export function resolveLayoutControls(layout, device) {
  if (layout.controls) return layout.controls
  const parameters = usefulParameters(device)
  let selected = []
  if (layout.strategy === 'blank') return Array.from({ length: layout.controlCount }, (_, index) => ({ label: `Custom ${index + 1}`, parameterName: '', preferredControlKind: 'knob' }))
  if (layout.strategy === 'blank_buttons') return Array.from({ length: layout.controlCount }, (_, index) => ({ label: `Button ${index + 1}`, parameterName: '', preferredControlKind: 'button', buttonMode: 'toggle_in_script' }))
  if (layout.strategy === 'device_on') selected = allParameters(device).filter((parameter) => parameter.name === 'Device On')
  else if (layout.strategy === 'switches') selected = allParameters(device).filter(isButtonLikeParameter)
  else if (layout.strategy === 'performance_buttons') selected = allParameters(device).filter((parameter) => parameter.name !== 'Device On' && isButtonLikeParameter(parameter) && /on|enable|active|hold|legato|mono|glide|sync/i.test(parameter.name))
  else if (layout.strategy === 'recommended') selected = parameters.filter((parameter) => parameter.recommendedForKnob && parameter.risk !== 'dangerous')
  else if (layout.strategy === 'macro') selected = parameters.filter((parameter) => ['continuous', 'bipolar', 'switch'].includes(parameter.controlType) && parameter.risk !== 'dangerous')
  else if (layout.strategy === 'filter') selected = parameters.filter((parameter) => /filter|frequency|freq|cutoff|resonance|\bres\b|morph|drive/i.test(parameter.name))
  else selected = parameters.filter((parameter) => parameter.isEnabled !== false)
  return selected.slice(0, layout.controlCount).map((parameter) => ({
    label: parameter.name,
    parameterName: parameter.name,
    preferredControlKind: isButtonLikeParameter(parameter) ? 'button' : 'knob',
    ...(isButtonLikeParameter(parameter) ? { buttonMode: 'toggle_in_script' } : {}),
  }))
}

export function createControlPool(controls, mappings = []) {
  const assignments = new Map()
  for (const mapping of mappings) {
    const key = controlKey(mapping.source)
    if (!key) continue
    if (!assignments.has(key)) assignments.set(key, [])
    assignments.get(key).push(mapping.id)
  }
  return controls.map((control) => {
    const key = controlKey(control)
    const assignedMappingIds = assignments.get(key) || []
    return { ...control, assigned: assignedMappingIds.length > 0, assignedMappingIds }
  })
}

function pickControl(pool, preferredKind, usedKeys) {
  const free = pool.filter((control) => !usedKeys.has(controlKey(control)))
  if (preferredKind === 'button') return free.find((control) => control.controlKind === 'button') || null
  return free.find((control) => control.controlKind === preferredKind)
    || free.find((control) => control.controlKind !== 'button')
    || null
}

export function createLayoutInstance({ layout, device, controls = [], mappings = [], instanceId = `layout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }) {
  const resolvedControls = resolveLayoutControls(layout, device)
  const usedKeys = new Set(mappings.map((mapping) => controlKey(mapping.source)).filter(Boolean))
  const pool = createControlPool(controls, mappings)
  const nextMappings = resolvedControls.map((definition, index) => {
    const parameter = allParameters(device).find((candidate) => candidate.name === definition.parameterName) || null
    const source = pickControl(pool, definition.preferredControlKind, usedKeys)
    const controlType = definition.preferredControlKind === 'button' ? 'button' : 'continuous'
    if (source) usedKeys.add(controlKey(source))
    return {
      id: `${instanceId}-mapping-${index + 1}`,
      layoutId: layout.id,
      layoutInstanceId: instanceId,
      layoutName: layout.name,
      createdBy: 'layout',
      userLabel: definition.label,
      source: cleanControl(source),
      controlType,
      preferredControlKind: definition.preferredControlKind || 'knob',
      ...(controlType === 'button' ? {
        buttonMode: definition.buttonMode || 'toggle_in_script',
        buttonId: source ? `${source.frameworkChannel}:${source.data1}` : '',
      } : {}),
      targetType: 'ableton_device_parameter',
      targetDeviceName: device.deviceName,
      targetDeviceAliases: [device.deviceName, device.deviceClassName],
      targetParameterName: parameter?.name || definition.parameterName || '',
      parameterAliases: parameter ? [parameter.name] : [],
      parameterIndex: parameter?.parameterIndex ?? null,
      liveIndex: parameter?.liveIndex ?? null,
      parameterSection: parameter?.section || 'Unassigned',
      parameterRisk: parameter?.risk || 'unknown',
      parameterSearch: '',
      allowIndexFallback: false,
      scaling: 'parameter_min_max',
      invert: false,
      curve: 'linear',
    }
  })
  return {
    layoutEntry: { layoutInstanceId: instanceId, layoutId: layout.id, layoutName: layout.name, controlCount: nextMappings.length },
    mappings: nextMappings,
  }
}

export function addLayoutToBuilder(state, options) {
  const created = createLayoutInstance({ ...options, mappings: state.mappings })
  return { layoutStack: [...state.layoutStack, created.layoutEntry], mappings: [...state.mappings, ...created.mappings] }
}

export function replaceBuilderWithLayout(state, options) {
  const manual = state.mappings.filter((mapping) => mapping.createdBy === 'manual')
  const created = createLayoutInstance({ ...options, mappings: manual })
  return { layoutStack: [created.layoutEntry], mappings: [...manual, ...created.mappings] }
}

export function removeLayoutFromBuilder(state, layoutInstanceId) {
  return {
    layoutStack: state.layoutStack.filter((entry) => entry.layoutInstanceId !== layoutInstanceId),
    mappings: state.mappings.filter((mapping) => mapping.layoutInstanceId !== layoutInstanceId || mapping.createdBy === 'manual'),
  }
}

export function moveLayoutInStack(state, layoutInstanceId, direction) {
  const index = state.layoutStack.findIndex((entry) => entry.layoutInstanceId === layoutInstanceId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= state.layoutStack.length) return state
  const layoutStack = [...state.layoutStack]
  ;[layoutStack[index], layoutStack[target]] = [layoutStack[target], layoutStack[index]]
  return { ...state, layoutStack }
}

export function detectMappingWarnings(mappings, device) {
  const warnings = []
  const sourceGroups = new Map()
  const parameterGroups = new Map()
  const catalogNames = new Set(allParameters(device).map((parameter) => parameter.name))
  for (const mapping of mappings) {
    const source = controlKey(mapping.source)
    if (!source) warnings.push({ type: 'unassigned_midi_source', mappingIds: [mapping.id], message: `No MIDI source assigned: ${mapping.userLabel || mapping.targetParameterName || mapping.id}` })
    else {
      if (!sourceGroups.has(source)) sourceGroups.set(source, [])
      sourceGroups.get(source).push(mapping.id)
    }
    if (!mapping.targetParameterName) warnings.push({ type: 'missing_parameter', mappingIds: [mapping.id], message: `No target parameter: ${mapping.userLabel || mapping.id}` })
    else {
      if (!parameterGroups.has(mapping.targetParameterName)) parameterGroups.set(mapping.targetParameterName, [])
      parameterGroups.get(mapping.targetParameterName).push(mapping.id)
      if (!catalogNames.has(mapping.targetParameterName)) warnings.push({ type: 'catalog_parameter_missing', mappingIds: [mapping.id], message: `Parameter missing in catalog: ${mapping.targetParameterName}` })
    }
    if (mapping.allowIndexFallback) warnings.push({ type: 'fallback_enabled', mappingIds: [mapping.id], message: `Index fallback enabled: ${mapping.targetParameterName}` })
    const parameter = allParameters(device).find((candidate) => candidate.name === mapping.targetParameterName)
    const sourceKind = mapping.source?.controlKind
    if (mapping.controlType === 'button') {
      if (sourceKind && sourceKind !== 'button') warnings.push({ type: 'button_assigned_to_continuous_control', mappingIds: [mapping.id], message: `Button mapping assigned to ${sourceKind}: ${mapping.userLabel || mapping.id}` })
      if (!mapping.buttonMode) warnings.push({ type: 'button_mode_missing', mappingIds: [mapping.id], message: `Button mode missing: ${mapping.userLabel || mapping.id}` })
      if (parameter && !isButtonLikeParameter(parameter)) warnings.push({ type: 'button_target_not_switch', mappingIds: [mapping.id], message: `Button target does not look like a switch: ${parameter.name}` })
      if (mapping.buttonMode === 'trigger' && parameter && !isButtonLikeParameter(parameter)) warnings.push({ type: 'trigger_on_continuous_parameter', mappingIds: [mapping.id], message: `Trigger mode used on continuous parameter: ${parameter.name}` })
    } else {
      if (sourceKind === 'button') warnings.push({ type: 'continuous_assigned_to_button', mappingIds: [mapping.id], message: `Continuous mapping assigned to button: ${mapping.userLabel || mapping.id}` })
      if (parameter && isButtonLikeParameter(parameter)) warnings.push({ type: 'continuous_target_switch', mappingIds: [mapping.id], message: `Continuous control assigned to switch-like parameter: ${parameter.name}` })
    }
  }
  for (const [source, mappingIds] of sourceGroups) if (mappingIds.length > 1) {
    const isButton = mappings.some((mapping) => mappingIds.includes(mapping.id) && mapping.controlType === 'button')
    warnings.push({ type: isButton ? 'duplicate_midi_button' : 'duplicate_midi_source', mappingIds, message: `${isButton ? 'Duplicate MIDI button' : 'Duplicate MIDI source'}: ${source}` })
  }
  for (const [parameter, mappingIds] of parameterGroups) if (mappingIds.length > 1) warnings.push({ type: 'duplicate_parameter', mappingIds, message: `Duplicate target parameter: ${parameter}` })
  return warnings
}

export function getLayoutHealth(mappings, warnings) {
  const conflicted = new Set(warnings.flatMap((warning) => warning.mappingIds))
  return {
    ok: mappings.filter((mapping) => !conflicted.has(mapping.id)).length,
    duplicateSources: warnings.filter((warning) => ['duplicate_midi_source', 'duplicate_midi_button'].includes(warning.type)).length,
    duplicateParameters: warnings.filter((warning) => warning.type === 'duplicate_parameter').length,
    unassigned: warnings.filter((warning) => warning.type === 'unassigned_midi_source').length,
    totalWarnings: warnings.length,
  }
}

export function createPortableProfile({ scriptName, targetDeviceKey, layoutStack, mappings, controlPool, customLayouts = [] }) {
  return { schemaVersion: '0.1', mapperType: 'ableton_device_builder', scriptName, targetDeviceKey, layoutStack, mappings, controlPool, customLayouts }
}

export function parsePortableProfile(text) {
  const profile = typeof text === 'string' ? JSON.parse(text) : text
  if (!profile || !Array.isArray(profile.layoutStack) || !Array.isArray(profile.mappings) || !Array.isArray(profile.controlPool)) throw new Error('Invalid Ableton Device Mapper profile.')
  return { ...profile, customLayouts: Array.isArray(profile.customLayouts) ? profile.customLayouts : [] }
}
