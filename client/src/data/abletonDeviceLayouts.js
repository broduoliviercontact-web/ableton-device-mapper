const controls = (items) => items.map(([label, parameterName, preferredControlKind = 'knob', buttonMode]) => ({
  label,
  parameterName,
  preferredControlKind,
  ...(buttonMode ? { buttonMode } : {}),
}))

export const ABLETON_DEVICE_LAYOUTS = {
  Operator: [
    {
      id: 'operator-musical-8',
      name: 'Operator Musical 8',
      description: 'Useful musical controls for performance.',
      category: 'performance',
      controlCount: 8,
      controls: controls([
        ['Volume', 'Volume', 'fader'], ['Tone', 'Tone'], ['Filter Freq', 'Filter Freq'], ['Filter Res', 'Filter Res'],
        ['Osc-A Level', 'Osc-A Level', 'fader'], ['Osc-B Level', 'Osc-B Level', 'fader'], ['Osc-C Level', 'Osc-C Level', 'fader'], ['Osc-D Level', 'Osc-D Level', 'fader'],
      ]),
    },
    {
      id: 'operator-mixer-4', name: 'Operator Mixer 4', description: 'Four oscillator mixer faders.', category: 'mixer', controlCount: 4,
      controls: controls([['Osc-A Level', 'Osc-A Level', 'fader'], ['Osc-B Level', 'Osc-B Level', 'fader'], ['Osc-C Level', 'Osc-C Level', 'fader'], ['Osc-D Level', 'Osc-D Level', 'fader']]),
    },
    {
      id: 'operator-filter-4', name: 'Operator Filter 4', description: 'Frequency, resonance, morph, and drive.', category: 'filter', controlCount: 4,
      controls: controls([['Filter Freq', 'Filter Freq'], ['Filter Res', 'Filter Res'], ['Filter Morph', 'Filter Morph'], ['Filter Drive', 'Filter Drive']]),
    },
    {
      id: 'operator-oscillator-levels-4', name: 'Operator Oscillator Levels 4', description: 'Direct level control for all oscillators.', category: 'oscillator', controlCount: 4,
      controls: controls([['Osc-A Level', 'Osc-A Level', 'fader'], ['Osc-B Level', 'Osc-B Level', 'fader'], ['Osc-C Level', 'Osc-C Level', 'fader'], ['Osc-D Level', 'Osc-D Level', 'fader']]),
    },
    {
      id: 'operator-envelope-8', name: 'Operator Envelope 8', description: 'Pitch and LFO envelope stages.', category: 'envelope', controlCount: 8,
      controls: controls([['Pitch Attack', 'Pe Attack'], ['Pitch Decay', 'Pe Decay'], ['Pitch Sustain', 'Pe Sustain'], ['Pitch Release', 'Pe Release'], ['LFO Env Attack', 'Le Attack'], ['LFO Env Decay', 'Le Decay'], ['LFO Env Sustain', 'Le Sustain'], ['LFO Env Release', 'Le Release']]),
    },
    {
      id: 'operator-lfo-4', name: 'Operator LFO 4', description: 'LFO rate and modulation depths.', category: 'modulation', controlCount: 4,
      controls: controls([['LFO Rate', 'LFO Rate'], ['LFO Amount', 'LFO Amt'], ['LFO Amount A', 'LFO Amt A'], ['LFO Amount B', 'LFO Amt B']]),
    },
    {
      id: 'operator-pitch-transpose-4', name: 'Operator Pitch / Transpose 4', description: 'Global and oscillator pitch controls.', category: 'pitch', controlCount: 4,
      controls: controls([['Transpose', 'Transpose'], ['Osc-A Coarse', 'A Coarse'], ['Osc-B Coarse', 'B Coarse'], ['Osc-C Coarse', 'C Coarse']]),
    },
    {
      id: 'operator-switches-4', name: 'Operator Switches 4', description: 'Direct on/off control for all four oscillators.', category: 'buttons', controlCount: 4,
      controls: controls([['Osc-A On', 'Osc-A On', 'button'], ['Osc-B On', 'Osc-B On', 'button'], ['Osc-C On', 'Osc-C On', 'button'], ['Osc-D On', 'Osc-D On', 'button']]),
    },
    {
      id: 'operator-performance-buttons-4', name: 'Operator Performance Buttons', description: 'Filter, LFO, glide, and pitch-envelope switches.', category: 'buttons', controlCount: 4,
      controls: controls([['Filter On', 'Filter On', 'button'], ['LFO On', 'LFO On', 'button'], ['Glide On', 'Glide On', 'button'], ['Pitch Envelope On', 'Pe On', 'button']]),
    },
    {
      id: 'operator-device-on', name: 'Operator Device On', description: 'Toggle the complete Operator device.', category: 'buttons', controlCount: 1,
      controls: controls([['Device On', 'Device On', 'button']]),
    },
  ],
}

export const GENERIC_ABLETON_LAYOUTS = [
  { id: 'generic-first-8', name: 'First 8 Parameters', description: 'First eight useful catalog parameters.', category: 'generic', controlCount: 8, strategy: 'first' },
  { id: 'generic-first-16', name: 'First 16 Parameters', description: 'First sixteen useful catalog parameters.', category: 'generic', controlCount: 16, strategy: 'first' },
  { id: 'generic-recommended-8', name: 'Recommended 8', description: 'Eight catalog-recommended performance targets.', category: 'generic', controlCount: 8, strategy: 'recommended' },
  { id: 'generic-recommended-16', name: 'Recommended 16', description: 'Sixteen catalog-recommended performance targets.', category: 'generic', controlCount: 16, strategy: 'recommended' },
  { id: 'generic-macro-like-8', name: 'Macro-like 8', description: 'Eight safe continuous, bipolar, or switch parameters.', category: 'generic', controlCount: 8, strategy: 'macro' },
  { id: 'generic-filter-like', name: 'Filter-like Controls', description: 'Frequency, cutoff, resonance, morph, and drive matches.', category: 'generic', controlCount: 8, strategy: 'filter' },
  { id: 'generic-blank-8', name: 'Blank Custom 8', description: 'Eight empty mappings ready for manual assignment.', category: 'custom', controlCount: 8, strategy: 'blank' },
  { id: 'generic-device-on-button', name: 'Device On Button', description: 'One button for the device master on/off parameter.', category: 'buttons', controlCount: 1, strategy: 'device_on' },
  { id: 'generic-first-4-switches', name: 'First 4 Switches', description: 'First four switch-like parameters in the catalog.', category: 'buttons', controlCount: 4, strategy: 'switches' },
  { id: 'generic-first-8-switches', name: 'First 8 Switches', description: 'First eight switch-like parameters in the catalog.', category: 'buttons', controlCount: 8, strategy: 'switches' },
  { id: 'generic-performance-buttons-4', name: 'Performance Buttons 4', description: 'Four useful on/off performance parameters.', category: 'buttons', controlCount: 4, strategy: 'performance_buttons' },
  { id: 'generic-blank-buttons-8', name: 'Blank Buttons 8', description: 'Eight unassigned button routes for custom targets.', category: 'buttons', controlCount: 8, strategy: 'blank_buttons' },
]

export function getLayoutsForDevice(deviceName) {
  return [...(ABLETON_DEVICE_LAYOUTS[deviceName] || []), ...GENERIC_ABLETON_LAYOUTS]
}

export function getLayoutById(deviceName, layoutId) {
  return getLayoutsForDevice(deviceName).find((layout) => layout.id === layoutId) || null
}

export function getBestLayoutIds(device, { includeButtons = false } = {}) {
  if (device?.deviceName === 'Operator') return [
    'operator-musical-8',
    'operator-filter-4',
    'operator-oscillator-levels-4',
    ...(includeButtons ? ['operator-switches-4'] : []),
  ]
  const ids = ['generic-recommended-8', 'generic-first-8']
  if ((device?.parameters || []).some((parameter) => /filter|frequency|cutoff|resonance/i.test(parameter.name))) ids.push('generic-filter-like')
  if (includeButtons) ids.push('generic-performance-buttons-4')
  return ids
}
