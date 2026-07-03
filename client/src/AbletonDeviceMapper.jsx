import { useEffect, useMemo, useRef, useState } from 'react'
import catalog from './data/abletonDeviceParameterCatalog.json'
import {
  DEVICE_CATEGORIES,
  LAYOUT_PRESETS,
  findCatalogDevice,
  getCatalogDevices,
  getPresetParameters,
  getRecommendedParameters,
} from './data/abletonDeviceCatalog.js'
import {
  buildAbletonDeviceMapperPack,
  createAbletonDeviceTerminalCommands,
} from './generators/abletonDevicePackGenerator.js'
import {
  createScriptNaming,
  makeDefaultScriptName,
} from './utils/scriptNaming.js'

const STEPS = ['Connect Controller', 'Choose Device', 'Choose Layout', 'Mapping Matrix', 'Export ZIP']

const Icon = ({ name }) => {
  const paths = {
    midi: <><path d="M4 7h16v10H4z"/><path d="M8 10v4m4-4v4m4-4v4"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
    layout: <><rect x="3" y="4" width="7" height="7"/><rect x="14" y="4" width="7" height="7"/><rect x="3" y="15" width="7" height="5"/><rect x="14" y="15" width="7" height="5"/></>,
    route: <><path d="M5 5v5c0 1.1.9 2 2 2h10c1.1 0 2 .9 2 2v5"/><circle cx="5" cy="4" r="2"/><circle cx="19" cy="20" r="2"/><path d="m15 8 4 4-4 4"/></>,
    export: <><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 17v3h14v-3"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7"/><path d="M10 11v5m4-5v5"/></>,
  }
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

const Badge = ({ status = 'ready', children }) => <span className={`badge badge--${status}`}>{children}</span>

const toSource = (control, index, endpointName) => ({
  endpointName: control?.endpointName || endpointName || 'MIDI Controller',
  messageType: 'CONTROLCHANGE',
  userChannel: control?.userChannel || 1,
  frameworkChannel: control?.frameworkChannel ?? 0,
  data1: control?.data1 ?? 16 + index,
  controlKind: control?.controlKind || 'knob',
  label: control?.label || `Control ${index + 1}`,
})

const createMapping = ({ parameter, device, source, index }) => ({
  id: `native-${source.frameworkChannel}-${source.data1}-${Date.now()}-${index}`,
  source,
  controlType: 'continuous',
  targetType: 'ableton_device_parameter',
  targetDeviceName: device.deviceName,
  targetDeviceAliases: [device.deviceName, device.deviceClassName],
  targetParameterName: parameter.name,
  parameterAliases: [parameter.name],
  parameterIndex: parameter.parameterIndex,
  liveIndex: parameter.liveIndex,
  parameterSection: parameter.section || 'Unclassified',
  parameterRisk: parameter.risk || 'unknown',
  parameterSearch: '',
  allowIndexFallback: false,
  scaling: 'parameter_min_max',
})

export default function AbletonDeviceMapper() {
  const devices = useMemo(() => getCatalogDevices(catalog), [])
  const initialDevice = useMemo(() => findCatalogDevice(catalog, 'Operator'), [])
  const midiSupported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  const midiAccessRef = useRef(null)
  const [activeStep, setActiveStep] = useState(0)
  const [midiStatus, setMidiStatus] = useState('idle')
  const [midiError, setMidiError] = useState('')
  const [inputs, setInputs] = useState([])
  const [selectedInputId, setSelectedInputId] = useState('')
  const [lastMessage, setLastMessage] = useState(null)
  const [controls, setControls] = useState([])
  const [category, setCategory] = useState('instrument')
  const [deviceSearch, setDeviceSearch] = useState('')
  const [deviceKey, setDeviceKey] = useState(initialDevice.catalogKey)
  const [selectedPresetId, setSelectedPresetId] = useState('operator-musical-8')
  const [mappings, setMappings] = useState([])
  const [isExporting, setIsExporting] = useState(false)
  const [lastExportedSlug, setLastExportedSlug] = useState('')
  const [scriptName, setScriptName] = useState(() => makeDefaultScriptName({ deviceName: initialDevice.deviceName, controllerName: 'MIDI Controller' }))
  const [scriptNameTouched, setScriptNameTouched] = useState(false)

  const selectedDevice = devices.find((device) => device.catalogKey === deviceKey) || initialDevice
  const filteredDevices = devices.filter((device) => device.deviceCategory === category && (
    !deviceSearch.trim()
    || `${device.deviceName} ${device.deviceClassName}`.toLowerCase().includes(deviceSearch.trim().toLowerCase())
  ))
  const recommended = getRecommendedParameters(selectedDevice, 12)
  const inputName = inputs.find((input) => input.id === selectedInputId)?.name || controls[0]?.endpointName || 'your MIDI controller'
  const defaultScriptName = useMemo(() => makeDefaultScriptName({ deviceName: selectedDevice.deviceName, controllerName: inputName }), [selectedDevice.deviceName, inputName])
  const scriptNaming = useMemo(() => createScriptNaming(scriptName, defaultScriptName), [scriptName, defaultScriptName])
  const { scriptSlug } = scriptNaming
  const scriptNameTooLong = scriptNaming.scriptDisplayName.length > 64
  const readiness = [controls.length > 0, Boolean(selectedDevice), mappings.length > 0, mappings.length > 0, mappings.length > 0]

  useEffect(() => {
    if (!scriptNameTouched) setScriptName(defaultScriptName)
  }, [defaultScriptName, scriptNameTouched])

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Ableton Device Mapper'
    return () => { document.title = previousTitle }
  }, [])

  const refreshInputs = (access) => {
    const nextInputs = Array.from(access.inputs.values()).map((input) => ({ id: input.id, name: input.name || 'Unnamed MIDI input' }))
    setInputs(nextInputs)
    setSelectedInputId((current) => current || nextInputs[0]?.id || '')
  }

  const enableMidi = async () => {
    if (!midiSupported) return
    setMidiStatus('requesting')
    setMidiError('')
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false })
      midiAccessRef.current = access
      access.onstatechange = () => refreshInputs(access)
      refreshInputs(access)
      setMidiStatus('ready')
    } catch (error) {
      setMidiStatus('error')
      setMidiError(error?.message || 'MIDI permission was not granted.')
    }
  }

  useEffect(() => {
    const access = midiAccessRef.current
    if (!access) return undefined
    const input = access.inputs.get(selectedInputId)
    if (!input) return undefined
    const handler = (event) => {
      const [status, data1, data2] = event.data
      if ((status & 0xf0) !== 0xb0) return
      const frameworkChannel = status & 0x0f
      const message = { endpointName: input.name || 'Unnamed MIDI input', userChannel: frameworkChannel + 1, frameworkChannel, data1, data2, timestamp: event.timeStamp }
      setLastMessage(message)
      setControls((current) => {
        const id = `${message.endpointName}-${frameworkChannel}-${data1}`
        const existing = current.find((control) => control.id === id)
        if (existing) return current.map((control) => control.id === id ? { ...control, lastValue: data2 } : control)
        return [...current, { id, ...message, lastValue: data2, controlKind: 'knob', label: `CC ${data1}` }]
      })
    }
    input.onmidimessage = handler
    return () => { input.onmidimessage = null }
  }, [selectedInputId, midiStatus])

  const selectDevice = (nextDevice) => {
    setCategory(nextDevice.deviceCategory)
    setDeviceKey(nextDevice.catalogKey)
    setMappings([])
  }

  const addMappingForControl = (control) => {
    const used = new Set(mappings.map((mapping) => mapping.targetParameterName))
    const parameter = recommended.find((candidate) => !used.has(candidate.name)) || recommended[0] || selectedDevice.parameters.find((candidate) => candidate.name !== 'Device On')
    if (!parameter) return
    setMappings((current) => [...current, createMapping({ parameter, device: selectedDevice, source: toSource(control, current.length, inputName), index: current.length })])
    setActiveStep(3)
  }

  const applyPreset = () => {
    const preset = LAYOUT_PRESETS.find((item) => item.id === selectedPresetId)
    if (!preset) return
    const presetDevice = preset.deviceName ? findCatalogDevice(catalog, preset.deviceName) : selectedDevice
    if (presetDevice && presetDevice.catalogKey !== selectedDevice.catalogKey) {
      setCategory(presetDevice.deviceCategory)
      setDeviceKey(presetDevice.catalogKey)
    }
    const parameters = getPresetParameters(presetDevice, preset)
    setMappings(parameters.map((parameter, index) => createMapping({
      parameter,
      device: presetDevice,
      source: toSource(controls[index], index, inputName),
      index,
    })))
    setActiveStep(3)
  }

  const updateMapping = (id, patch) => setMappings((current) => current.map((mapping) => mapping.id === id ? { ...mapping, ...patch } : mapping))

  const chooseParameter = (mapping, name) => {
    const parameter = selectedDevice.parameters.find((candidate) => candidate.name === name)
    if (!parameter) return
    updateMapping(mapping.id, {
      targetParameterName: parameter.name,
      parameterAliases: [parameter.name],
      parameterIndex: parameter.parameterIndex,
      liveIndex: parameter.liveIndex,
      parameterSection: parameter.section || 'Unclassified',
      parameterRisk: parameter.risk || 'unknown',
    })
  }

  const exportPack = async () => {
    setIsExporting(true)
    try {
      const { zip, scriptSlug: exportedSlug } = buildAbletonDeviceMapperPack({
        device: selectedDevice,
        mappings,
        inputName,
        scriptDisplayName: scriptNaming.scriptDisplayName,
      })
      const blob = await zip.generateAsync({ type: 'blob', platform: 'UNIX' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${exportedSlug}_Pack.zip`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setLastExportedSlug(exportedSlug)
    } finally {
      setIsExporting(false)
    }
  }

  return <div className="app-shell native-mapper">
    <div className="ambient-grid" />
    <header className="topbar">
      <a className="brand" href="/" aria-label="Ableton Device Mapper home"><span className="brand__mark"><i/><i/><i/><i/></span><span>Ableton <strong>Device Mapper</strong></span></a>
      <div className="signal-chain" aria-label="Product workflow"><span>MIDI Controller</span><b>→</b><span>Remote Script</span><b>→</b><span>Native Device</span></div>
      <div className="catalog-status"><span>LIVE {catalog.abletonVersion}</span><Badge>{catalog.deviceCount} DEVICES</Badge></div>
    </header>

    <main id="top">
      <section className="hero native-hero">
        <div className="eyebrow"><span className="live-dot" /> NATIVE DEVICE CONTROL / CATALOG-DRIVEN</div>
        <h1>Map hardware into<br/><em>Ableton devices.</em></h1>
        <p>Native Ableton devices expose parameters through the Live API. Choose a catalogued parameter, capture a MIDI CC, and forge a Remote Script that controls it directly — no companion device required.</p>
        <p className="hero-translation">Les devices natifs Ableton exposent leurs paramètres via l’API Live. L’outil utilise un catalogue de paramètres pour générer un Remote Script qui les contrôle directement.</p>
      </section>

      <nav className="stepper stepper--five" aria-label="Ableton Device Mapper steps">
        {STEPS.map((label, index) => <button key={label} className={`step ${activeStep === index ? 'step--active' : ''}`} onClick={() => setActiveStep(index)}>
          <span className="step__number">0{index + 1}</span><span className="step__icon"><Icon name={['midi','target','layout','route','export'][index]}/></span><span className="step__label">{label}</span><Badge status={readiness[index] ? 'ready' : 'missing'}>{readiness[index] ? 'READY' : 'MISSING'}</Badge>
        </button>)}
      </nav>

      <section className="workspace">
        {activeStep === 0 && <div className="panel-layout">
          <article className="panel panel--primary">
            <PanelHeader index="01" title="Connect MIDI Controller" subtitle="Reuse the Web MIDI capture flow to collect CONTROL CHANGE messages."/>
            <div className="status-strip"><div><span>WEB MIDI</span><Badge status={midiSupported ? 'ready' : 'missing'}>{midiSupported ? 'AVAILABLE' : 'UNAVAILABLE'}</Badge></div><div><span>ACCESS</span><Badge status={midiStatus === 'ready' ? 'ready' : 'missing'}>{midiStatus === 'ready' ? 'ENABLED' : 'LOCKED'}</Badge></div><div><span>CONTROLS</span><strong>{String(controls.length).padStart(2,'0')}</strong></div></div>
            <div className="connect-row"><button className="primary-button" onClick={enableMidi} disabled={!midiSupported || midiStatus === 'requesting'}><Icon name="midi"/>{midiStatus === 'requesting' ? 'Requesting access…' : 'Enable MIDI'}</button><label className="field field--grow"><span>MIDI INPUT</span><select value={selectedInputId} onChange={(event) => setSelectedInputId(event.target.value)} disabled={!inputs.length}><option value="">{inputs.length ? 'Choose input' : 'No input detected'}</option>{inputs.map((input) => <option key={input.id} value={input.id}>{input.name}</option>)}</select></label></div>
            {midiError && <p className="error-note">{midiError}</p>}
            <div className={`message-monitor ${lastMessage ? 'message-monitor--live' : ''}`}><div className="monitor-heading"><span><i/> LAST MIDI MESSAGE</span>{lastMessage && <Badge status="captured">CAPTURED</Badge>}</div>{lastMessage ? <div className="message-fields native-message-fields">{[['ENDPOINT',lastMessage.endpointName],['USER CH',lastMessage.userChannel],['FRAMEWORK CH',lastMessage.frameworkChannel],['CC',lastMessage.data1],['VALUE',lastMessage.data2]].map(([label,value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div> : <EmptyState title="Listening for Control Change" body="Enable MIDI, then move a knob, fader, or button."/>}</div>
          </article>
          <aside className="panel"><PanelHeader title="Detected controls" subtitle="Map captured CC messages to the selected native device."/>{controls.length ? <div className="control-list">{controls.map((control) => <div className="control-card" key={control.id}><div className="control-card__top"><span className="cc-chip">CC {control.data1}</span><span className="value-meter"><i style={{width:`${control.lastValue / 127 * 100}%`}}/></span><strong>{control.lastValue}</strong></div><input className="inline-input" value={control.label} onChange={(event) => setControls((current) => current.map((item) => item.id === control.id ? {...item,label:event.target.value}:item))}/><div className="control-card__meta"><span>CH {control.userChannel}</span><select value={control.controlKind} onChange={(event) => setControls((current) => current.map((item) => item.id === control.id ? {...item,controlKind:event.target.value}:item))}><option value="knob">knob</option><option value="fader">fader</option><option value="button">button</option></select><button onClick={() => addMappingForControl(control)}>MAP →</button></div></div>)}</div> : <EmptyState title="No controls yet" body="Preset layouts can also create sources without hardware capture."/>}</aside>
        </div>}

        {activeStep === 1 && <article className="panel native-device-panel">
          <PanelHeader index="02" title="Choose Ableton Device" subtitle="Browse the combined Live 12.4.5b6 device parameter catalog."/>
          <div className="device-picker-grid"><div className="device-picker-controls"><label className="field"><span>CATEGORY</span><select aria-label="Device category" value={category} onChange={(event) => { const nextCategory=event.target.value; const firstDevice=devices.find((device)=>device.deviceCategory===nextCategory); setCategory(nextCategory); setDeviceSearch(''); if(firstDevice){setDeviceKey(firstDevice.catalogKey);setMappings([])} }}>{DEVICE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="field"><span>SEARCH DEVICE</span><input type="search" value={deviceSearch} onChange={(event) => setDeviceSearch(event.target.value)} placeholder="Operator, EQ Eight, Roar…"/></label><label className="field"><span>DEVICE</span><select aria-label="Ableton device" value={deviceKey} onChange={(event) => { const nextDevice=devices.find((device) => device.catalogKey === event.target.value); if(nextDevice) selectDevice(nextDevice) }}>{filteredDevices.map((device) => <option key={device.catalogKey} value={device.catalogKey}>{device.deviceName}</option>)}</select></label></div>
            <div className="device-dossier"><span className="dossier-kicker">NATIVE DEVICE DOSSIER</span><h2>{selectedDevice.deviceName}</h2><div className="dossier-metrics"><div><small>CLASS NAME</small><strong>{selectedDevice.deviceClassName}</strong></div><div><small>PARAMETERS</small><strong>{selectedDevice.parameterCount}</strong></div><div><small>CATEGORY</small><strong>{selectedDevice.deviceCategory.replace('_',' ')}</strong></div></div><div className="recommended-list"><span>RECOMMENDED PARAMETERS</span><div>{recommended.map((parameter) => <button key={`${parameter.liveIndex}-${parameter.name}`} onClick={() => { if (!mappings.some((mapping) => mapping.targetParameterName === parameter.name)) setMappings((current) => [...current,createMapping({parameter,device:selectedDevice,source:toSource(controls[current.length],current.length,inputName),index:current.length})]) }}>{parameter.name}<small>{parameter.section}</small></button>)}</div></div></div>
          </div><div className="panel-actions"><button className="primary-button" onClick={() => setActiveStep(2)}>Choose mapping layout <span>→</span></button></div>
        </article>}

        {activeStep === 2 && <article className="panel layout-panel"><PanelHeader index="03" title="Choose Mapping Layout" subtitle="Start from a musical bank, a generic control count, or a blank matrix."/><div className="preset-grid">{LAYOUT_PRESETS.map((preset) => <button key={preset.id} className={`preset-card ${selectedPresetId === preset.id ? 'preset-card--active':''}`} onClick={() => setSelectedPresetId(preset.id)}><span>{String(preset.count).padStart(2,'0')}</span><strong>{preset.label}</strong><small>{preset.id === 'operator-musical-8' ? 'Volume · Tone · Filter · Osc levels' : preset.id === 'blank-custom' ? 'Build every route manually' : `${preset.controlKind}s · recommended catalog targets`}</small></button>)}</div><div className="layout-preview"><div><span>SELECTED LAYOUT</span><strong>{LAYOUT_PRESETS.find((item) => item.id === selectedPresetId)?.label}</strong></div><div><span>TARGET DEVICE</span><strong>{LAYOUT_PRESETS.find((item) => item.id === selectedPresetId)?.deviceName || selectedDevice.deviceName}</strong></div><button className="primary-button" onClick={applyPreset}>Apply layout <span>→</span></button></div></article>}

        {activeStep === 3 && <article className="panel native-mapping-panel"><PanelHeader index="04" title="Mapping Matrix" subtitle="Name match first. Fallback index disabled by default."/><div className="mapping-toolbar"><span>{mappings.length} ACTIVE NATIVE ROUTE{mappings.length===1?'':'S'}</span><button className="secondary-button" onClick={() => {const parameter=recommended.find((candidate)=>!mappings.some((mapping)=>mapping.targetParameterName===candidate.name))||recommended[0];if(parameter)setMappings((current)=>[...current,createMapping({parameter,device:selectedDevice,source:toSource(controls[current.length],current.length,inputName),index:current.length})])}}>+ Add route</button></div>{mappings.length ? <div className="native-mapping-table"><div className="native-mapping-head"><span>MIDI SOURCE</span><span>TARGET DEVICE</span><span>SEARCH / TARGET PARAMETER</span><span>SECTION</span><span/></div>{mappings.map((mapping) => {
          const query=mapping.parameterSearch.toLowerCase(); const options=selectedDevice.parameters.filter((parameter)=>parameter.name!=='Device On'&&(!query||`${parameter.name} ${parameter.section}`.toLowerCase().includes(query))).slice(0,120)
          return <div className="native-mapping-row" key={mapping.id}><div className="source-cell"><span className="cc-chip">CC {mapping.source.data1}</span><div><strong>{mapping.source.label}</strong><small>{mapping.source.endpointName} · CH {mapping.source.userChannel}</small></div></div><div className="native-device-cell"><strong>{selectedDevice.deviceName}</strong><small>{selectedDevice.deviceClassName}</small></div><div className="native-target-cell"><input type="search" aria-label="Search parameter" placeholder="Search parameter" value={mapping.parameterSearch} onChange={(event)=>updateMapping(mapping.id,{parameterSearch:event.target.value})}/><select aria-label="Target parameter" value={mapping.targetParameterName} onChange={(event)=>chooseParameter(mapping,event.target.value)}><option value={mapping.targetParameterName}>{mapping.targetParameterName}</option>{options.filter((parameter)=>parameter.name!==mapping.targetParameterName).map((parameter)=><option key={`${parameter.liveIndex}-${parameter.name}`} value={parameter.name}>{parameter.name}</option>)}</select><details className="advanced-index"><summary><strong className={mapping.allowIndexFallback?'fallback-state fallback-state--enabled':'fallback-state'}>{mapping.allowIndexFallback?'Index fallback enabled':'Name match first'}</strong><span>Advanced</span></summary><label className="fallback-opt-in"><input type="checkbox" checked={mapping.allowIndexFallback} onChange={(event)=>updateMapping(mapping.id,{allowIndexFallback:event.target.checked})}/><span><strong>Allow index fallback if name is missing</strong><small>Dangerous: keep disabled unless the catalog name cannot resolve.</small></span></label><div className="fallback-index-editor"><label>FALLBACK PARAMETER INDEX <input type="number" min="0" value={mapping.parameterIndex??0} onChange={(event)=>updateMapping(mapping.id,{parameterIndex:Number(event.target.value)})}/></label></div><p>Catalog liveIndex {mapping.liveIndex}; parameterIndex excludes Device On.</p></details></div><div className="section-cell"><Badge status={mapping.parameterRisk==='safe'?'ready':'captured'}>{mapping.parameterSection}</Badge><small>{mapping.parameterRisk}</small></div><button className="icon-button" onClick={()=>setMappings((current)=>current.filter((item)=>item.id!==mapping.id))} aria-label="Delete mapping"><Icon name="trash"/></button></div>})}<div className="mapping-footer"><span>RESOLUTION POLICY</span><strong>ALIASES → NORMALIZED NAME → OPT-IN INDEX</strong><span>SCALING: PARAMETER MIN / MAX</span></div></div> : <EmptyState title="No routes patched" body="Apply a preset or add a recommended parameter from Step 2."/>}<div className="panel-actions"><button className="primary-button" disabled={!mappings.length} onClick={()=>setActiveStep(4)}>Review export ZIP <span>→</span></button></div></article>}

        {activeStep === 4 && <article className="panel export-panel"><PanelHeader index="05" title="Export Ableton Device Pack" subtitle="Name the Control Surface, then generate its installable pack locally."/><div className="script-name-card"><div className="script-name-heading"><div><span>SCRIPT IDENTITY</span><strong>Name your Ableton Control Surface</strong></div><button type="button" onClick={() => { setScriptName(defaultScriptName); setScriptNameTouched(false) }}>Reset to default</button></div><label className="field"><span>SCRIPT NAME</span><input aria-label="Script name" value={scriptName} placeholder="Operator NanoKontrol Remote" onChange={(event) => { setScriptName(event.target.value); setScriptNameTouched(true) }}/><small>This name will appear as the Ableton Control Surface name. Spaces and accents will be converted to a safe script folder name.</small></label><div className="safe-name-preview"><div><span>ABLETON-SAFE NAME</span><strong>{scriptSlug}</strong></div><div><span>PYTHON CLASS</span><strong>{scriptNaming.pythonClassName}</strong></div></div>{scriptNameTooLong&&<p className="soft-warning">Long name: it will work, but a shorter Control Surface name is easier to identify in Ableton.</p>}<p className="collision-note">Reusing the same script name will update/replace the previous script after reinstall.</p></div><div className="export-layout"><div><div className="export-stamp"><Icon name="export"/><span>PACK STATUS</span><strong>{mappings.length?'READY TO BUILD':'WAITING FOR ROUTES'}</strong></div><h2>{scriptSlug}</h2><p className="muted">Controls {selectedDevice.deviceName} directly through Live's API. No companion target is included or required.</p><button className="export-button" onClick={exportPack} disabled={!mappings.length||isExporting}><Icon name="export"/>{isExporting?'Building ZIP…':'Download native device pack'}</button><small className="privacy-note">Catalog lookup and ZIP generation stay inside this browser session.</small></div><NativeFileTree scriptSlug={scriptSlug}/></div>{lastExportedSlug&&<NativeSetupWizard scriptSlug={lastExportedSlug} deviceName={selectedDevice.deviceName} inputName={inputName}/>}</article>}
      </section>
    </main>
    <footer><span>ABLETON DEVICE MAPPER / v0.1</span><span>83 DEVICES · 2,746 PARAMETERS · NO BACKEND</span><a href="https://deerflow.tech" target="_blank" rel="noreferrer">Created By Deerflow ↗</a></footer>
  </div>
}

function PanelHeader({index,title,subtitle}) { return <div className="panel-header">{index&&<span className="panel-index">{index}</span>}<div><h2>{title}</h2><p>{subtitle}</p></div></div> }
function EmptyState({title,body}) { return <div className="empty-state"><span className="pulse-ring"><i/></span><div><strong>{title}</strong><p>{body}</p></div></div> }

function NativeFileTree({scriptSlug}) { return <div className="file-tree"><div className="file-tree__head"><span>ZIP CONTENTS</span><Badge>6 FILES</Badge></div><pre>{`Ableton_Device_Mapper_Pack/
├── 1_COPY_THIS_FOLDER_TO_REMOTE_SCRIPTS/
│   └── ${scriptSlug}/
│       ├── __init__.py
│       ├── ${scriptSlug}.py
│       └── profile.json
├── 2_READ_ME_FIRST.md
├── INSTALL_CHECK.command
└── TROUBLESHOOTING.md`}</pre></div> }

const NATIVE_SETUP_STEPS = [
  ['Download and unzip the pack','Keep only the newest generated archive.'],
  ['Copy only the Remote Script folder','Use 1_COPY_THIS_FOLDER_TO_REMOTE_SCRIPTS.'],
  ['Remove old script and __pycache__','Replace the folder completely; never merge versions.'],
  ['Restart Ableton Live','Remote Scripts are discovered during startup.'],
  ['Select the generated Control Surface','Use the exact script slug shown below.'],
  ['Select the MIDI Input','Choose the same controller port used for capture.'],
  ['Set Output to None','The generated script needs no MIDI output.'],
  ['No companion target required','This mapper controls a native Live device directly.'],
  ['Load the Ableton device in the Set','Selecting its track makes discovery deterministic.'],
  ['Move MIDI controls','Check BUILD_ID and parameter logs if nothing moves.'],
]

function NativeSetupWizard({scriptSlug,deviceName,inputName}) {
  const [done,setDone]=useState(new Set([0])); const [copyError,setCopyError]=useState(''); const commands=createAbletonDeviceTerminalCommands(scriptSlug)
  const toggle=(index)=>setDone((current)=>{const next=new Set(current);next.has(index)?next.delete(index):next.add(index);return next})
  const copy=async(command)=>{try{await navigator.clipboard.writeText(command);setCopyError('')}catch{setCopyError('Clipboard unavailable — select the command manually.')}}
  return <section className="setup-wizard"><div className="wizard-heading"><div><span className="panel-index">06</span><div><h2>Native Device Setup Wizard</h2><p>Install the script, load the native device, then verify Live's logs.</p></div></div><div className="wizard-progress"><span>{done.size}/{NATIVE_SETUP_STEPS.length} COMPLETE</span><div><i style={{width:`${done.size/NATIVE_SETUP_STEPS.length*100}%`}}/></div></div></div><div className="wizard-config"><div><small>CONTROL SURFACE</small><strong>{scriptSlug}</strong></div><div><small>INPUT</small><strong>{inputName}</strong></div><div><small>TARGET</small><strong>{deviceName}</strong></div></div><div className="setup-grid">{NATIVE_SETUP_STEPS.map(([title,help],index)=><button key={title} className={`setup-step ${done.has(index)?'setup-step--done':''}`} onClick={()=>toggle(index)}><span className="setup-check">{done.has(index)?'✓':String(index+1).padStart(2,'0')}</span><span><strong>{title}</strong><small>{help}</small></span></button>)}</div><div className="terminal-tools"><div className="terminal-tools__heading"><span>MACOS TERMINAL TOOLS</span><small>Use cleanup commands only while Live is closed.</small></div>{commands.map(([label,command])=><div className="command-block" key={label}><div>{label}<button onClick={()=>copy(command)}>COPY</button></div><pre>{command}</pre></div>)}{copyError&&<p className="copy-error">{copyError}</p>}</div></section>
}
