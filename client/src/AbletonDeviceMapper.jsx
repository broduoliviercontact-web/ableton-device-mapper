import { useEffect, useMemo, useRef, useState } from 'react'
import catalog from './data/abletonDeviceParameterCatalog.json'
import { DEVICE_CATEGORIES, findCatalogDevice, getCatalogDevices, getRecommendedParameters } from './data/abletonDeviceCatalog.js'
import { getBestLayoutIds, getLayoutById, getLayoutsForDevice } from './data/abletonDeviceLayouts.js'
import { buildAbletonDeviceMapperPack, createAbletonDeviceTerminalCommands } from './generators/abletonDevicePackGenerator.js'
import { createScriptNaming, makeDefaultScriptName } from './utils/scriptNaming.js'
import {
  addLayoutToBuilder,
  createControlPool,
  createPortableProfile,
  detectMappingWarnings,
  getLayoutHealth,
  isButtonLikeParameter,
  moveLayoutInStack,
  parsePortableProfile,
  removeLayoutFromBuilder,
  replaceBuilderWithLayout,
  resolveLayoutControls,
} from './utils/layoutBuilder.js'

const STEPS = ['Script Name', 'Connect Controller', 'Choose Device', 'Add Layouts', 'Configure Mapping', 'Export ZIP']

const Icon = ({ name }) => {
  const paths = {
    midi: <><path d="M4 7h16v10H4z"/><path d="M8 10v4m4-4v4m4-4v4"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
    layout: <><rect x="3" y="4" width="7" height="7"/><rect x="14" y="4" width="7" height="7"/><rect x="3" y="15" width="7" height="5"/><rect x="14" y="15" width="7" height="5"/></>,
    route: <><path d="M5 5v5c0 1.1.9 2 2 2h10c1.1 0 2 .9 2 2v5"/><circle cx="5" cy="4" r="2"/><circle cx="19" cy="20" r="2"/><path d="m15 8 4 4-4 4"/></>,
    export: <><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 17v3h14v-3"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7"/><path d="M10 11v5m4-5v5"/></>,
    name: <><path d="M4 6h16M9 6v14m6-14v14M6 20h12"/></>,
  }
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

const Badge = ({ status = 'ready', children }) => <span className={`badge badge--${status}`}>{children}</span>
const stripPoolFields = ({ assigned, assignedMappingIds, ...control }) => control

const manualMapping = ({ parameter, device, source, index }) => ({
  id: `manual-${Date.now()}-${index}`,
  layoutId: null,
  layoutInstanceId: null,
  layoutName: 'Manual mappings',
  createdBy: 'manual',
  userLabel: parameter?.name || `Manual ${index + 1}`,
  source: source ? stripPoolFields(source) : null,
  controlType: source?.controlKind === 'button' ? 'button' : 'continuous',
  preferredControlKind: source?.controlKind || 'knob',
  ...(source?.controlKind === 'button' ? { buttonMode: 'toggle_in_script', buttonId: `${source.frameworkChannel}:${source.data1}` } : {}),
  targetType: 'ableton_device_parameter',
  targetDeviceName: device.deviceName,
  targetDeviceAliases: [device.deviceName, device.deviceClassName],
  targetParameterName: parameter?.name || '',
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
})

export default function AbletonDeviceMapper() {
  const devices = useMemo(() => getCatalogDevices(catalog), [])
  const initialDevice = useMemo(() => findCatalogDevice(catalog, 'Operator'), [])
  const midiSupported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  const midiAccessRef = useRef(null)
  const controlsRef = useRef([])
  const importInputRef = useRef(null)
  const instanceCounter = useRef(0)

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
  const [layoutStack, setLayoutStack] = useState([])
  const [mappings, setMappings] = useState([])
  const [selectedLayoutId, setSelectedLayoutId] = useState('operator-musical-8')
  const [previewLayout, setPreviewLayout] = useState(null)
  const [includeButtonLayouts, setIncludeButtonLayouts] = useState(false)
  const [learningMappingId, setLearningMappingId] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [lastExportedSlug, setLastExportedSlug] = useState('')
  const [scriptName, setScriptName] = useState(() => makeDefaultScriptName({ deviceName: initialDevice.deviceName, controllerName: 'MIDI Controller' }))
  const [scriptNameTouched, setScriptNameTouched] = useState(false)

  const selectedDevice = devices.find((device) => device.catalogKey === deviceKey) || initialDevice
  const filteredDevices = devices.filter((device) => device.deviceCategory === category && (!deviceSearch.trim() || `${device.deviceName} ${device.deviceClassName}`.toLowerCase().includes(deviceSearch.trim().toLowerCase())))
  const recommended = getRecommendedParameters(selectedDevice, 16)
  const inputName = inputs.find((input) => input.id === selectedInputId)?.name || controls[0]?.endpointName || 'your MIDI controller'
  const defaultScriptName = useMemo(() => makeDefaultScriptName({ deviceName: selectedDevice.deviceName, controllerName: inputName }), [selectedDevice.deviceName, inputName])
  const scriptNaming = useMemo(() => createScriptNaming(scriptName, defaultScriptName), [scriptName, defaultScriptName])
  const layouts = useMemo(() => getLayoutsForDevice(selectedDevice.deviceName), [selectedDevice.deviceName])
  const controlPool = useMemo(() => createControlPool(controls, mappings), [controls, mappings])
  const warnings = useMemo(() => detectMappingWarnings(mappings, selectedDevice), [mappings, selectedDevice])
  const health = useMemo(() => getLayoutHealth(mappings, warnings), [mappings, warnings])
  const scriptNameTooLong = scriptNaming.scriptDisplayName.length > 64
  const readiness = [Boolean(scriptNaming.scriptSlug), controls.length > 0, Boolean(selectedDevice), layoutStack.length > 0, mappings.length > 0, mappings.length > 0]

  useEffect(() => { document.title = 'Ableton Device Mapper' }, [])
  useEffect(() => { controlsRef.current = controls }, [controls])
  useEffect(() => { if (!scriptNameTouched) setScriptName(defaultScriptName) }, [defaultScriptName, scriptNameTouched])
  useEffect(() => {
    if (!layouts.some((layout) => layout.id === selectedLayoutId)) setSelectedLayoutId(layouts[0]?.id || '')
  }, [layouts, selectedLayoutId])

  const refreshInputs = (access) => {
    const next = Array.from(access.inputs.values()).map((input) => ({ id: input.id, name: input.name || 'Unnamed MIDI input' }))
    setInputs(next)
    setSelectedInputId((current) => current || next[0]?.id || '')
  }

  const enableMidi = async () => {
    if (!midiSupported) return
    setMidiStatus('requesting'); setMidiError('')
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false })
      midiAccessRef.current = access
      access.onstatechange = () => refreshInputs(access)
      refreshInputs(access); setMidiStatus('ready')
    } catch (error) { setMidiStatus('error'); setMidiError(error?.message || 'MIDI permission was not granted.') }
  }

  useEffect(() => {
    const access = midiAccessRef.current
    const input = access?.inputs.get(selectedInputId)
    if (!input) return undefined
    const handler = (event) => {
      const [status, data1, data2] = event.data
      if ((status & 0xf0) !== 0xb0) return
      const frameworkChannel = status & 0x0f
      const id = `${input.name}-${frameworkChannel}-${data1}`
      const knownControl = controlsRef.current.find((control) => control.id === id)
      const source = { ...(knownControl || {}), id, endpointName: input.name || 'Unnamed MIDI input', userChannel: frameworkChannel + 1, frameworkChannel, data1, lastValue: data2, controlKind: knownControl?.controlKind || 'knob', label: knownControl?.label || `CC ${data1}` }
      setLastMessage({ ...source, data2, timestamp: event.timeStamp })
      setControls((current) => current.some((control) => control.id === id) ? current.map((control) => control.id === id ? { ...control, lastValue: data2 } : control) : [...current, source])
      if (learningMappingId) {
        setMappings((current) => current.map((mapping) => mapping.id === learningMappingId ? { ...mapping, source: { ...source } } : mapping))
        setLearningMappingId('')
      }
    }
    input.onmidimessage = handler
    return () => { input.onmidimessage = null }
  }, [selectedInputId, midiStatus, learningMappingId])

  const nextInstanceId = (layoutId) => { instanceCounter.current += 1; return `${layoutId}-${Date.now()}-${instanceCounter.current}` }
  const builderState = () => ({ layoutStack, mappings })
  const commitBuilder = (next) => { setLayoutStack(next.layoutStack); setMappings(next.mappings) }

  const applyLayout = (mode = 'add') => {
    const layout = getLayoutById(selectedDevice.deviceName, selectedLayoutId)
    if (!layout) return
    if (mode === 'preview') { setPreviewLayout({ layout, controls: resolveLayoutControls(layout, selectedDevice) }); return }
    const options = { layout, device: selectedDevice, controls, instanceId: nextInstanceId(layout.id) }
    commitBuilder(mode === 'replace' ? replaceBuilderWithLayout(builderState(), options) : addLayoutToBuilder(builderState(), options))
    setPreviewLayout(null); setActiveStep(4)
  }

  const autoBuild = () => {
    let next = { layoutStack: [], mappings: mappings.filter((mapping) => mapping.createdBy === 'manual') }
    for (const layoutId of getBestLayoutIds(selectedDevice, { includeButtons: includeButtonLayouts })) {
      const layout = getLayoutById(selectedDevice.deviceName, layoutId)
      if (layout) next = addLayoutToBuilder(next, { layout, device: selectedDevice, controls, instanceId: nextInstanceId(layout.id) })
    }
    commitBuilder(next); setActiveStep(4)
  }

  const updateMapping = (id, patch) => setMappings((current) => current.map((mapping) => mapping.id === id ? { ...mapping, ...patch } : mapping))
  const chooseParameter = (mapping, name) => {
    const parameter = selectedDevice.parameters.find((candidate) => candidate.name === name)
    updateMapping(mapping.id, parameter ? { targetParameterName: parameter.name, parameterAliases: [parameter.name], parameterIndex: parameter.parameterIndex, liveIndex: parameter.liveIndex, parameterSection: parameter.section || 'Unclassified', parameterRisk: parameter.risk || 'unknown', ...(mapping.createdBy === 'manual' && isButtonLikeParameter(parameter) ? { controlType: 'button', preferredControlKind: 'button', buttonMode: mapping.buttonMode || 'toggle_in_script' } : {}) } : { targetParameterName: '', parameterAliases: [], parameterIndex: null, liveIndex: null, parameterSection: 'Unassigned' })
  }
  const assignSource = (mappingId, id) => {
    const source = controls.find((control) => control.id === id) || null
    const mapping = mappings.find((candidate) => candidate.id === mappingId)
    updateMapping(mappingId, { source, ...(mapping?.controlType === 'button' ? { buttonId: source ? `${source.frameworkChannel}:${source.data1}` : '' } : {}) })
  }
  const setControlType = (mapping, controlType) => updateMapping(mapping.id, controlType === 'button'
    ? { controlType, preferredControlKind: 'button', buttonMode: mapping.buttonMode || 'toggle_in_script', buttonId: mapping.source ? `${mapping.source.frameworkChannel}:${mapping.source.data1}` : '' }
    : { controlType, preferredControlKind: mapping.source?.controlKind === 'fader' ? 'fader' : 'knob', buttonMode: null, buttonId: null })
  const addManualMapping = () => {
    const usedParameters = new Set(mappings.map((mapping) => mapping.targetParameterName))
    const parameter = recommended.find((item) => !usedParameters.has(item.name)) || recommended[0]
    const source = controlPool.find((control) => !control.assigned) || null
    setMappings((current) => [...current, manualMapping({ parameter, device: selectedDevice, source, index: current.length })])
  }

  const exportProfile = () => {
    const profile = createPortableProfile({ scriptName: scriptNaming.scriptDisplayName, targetDeviceKey: selectedDevice.catalogKey, layoutStack, mappings, controlPool })
    const blob = new Blob([`${JSON.stringify(profile, null, 2)}\n`], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `${scriptNaming.scriptSlug}_Profile.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const importProfile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const profile = parsePortableProfile(await file.text())
      const device = devices.find((item) => item.catalogKey === profile.targetDeviceKey) || selectedDevice
      setCategory(device.deviceCategory); setDeviceKey(device.catalogKey); setScriptName(profile.scriptName || defaultScriptName); setScriptNameTouched(true)
      setLayoutStack(profile.layoutStack); setMappings(profile.mappings); setControls(profile.controlPool.map(stripPoolFields)); setProfileMessage(`Imported ${file.name}`); setActiveStep(4)
    } catch (error) { setProfileMessage(error.message) }
    event.target.value = ''
  }

  const exportPack = async () => {
    setIsExporting(true)
    try {
      const { zip, scriptSlug } = buildAbletonDeviceMapperPack({ device: selectedDevice, mappings, inputName, scriptDisplayName: scriptNaming.scriptDisplayName, layoutStack, controlPool, mappingWarnings: warnings })
      const blob = await zip.generateAsync({ type: 'blob', platform: 'UNIX' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `${scriptSlug}_Pack.zip`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setLastExportedSlug(scriptSlug)
    } finally { setIsExporting(false) }
  }

  return <div className="app-shell native-mapper">
    <div className="ambient-grid"/>
    <header className="topbar"><a className="brand" href="/" aria-label="Ableton Device Mapper home"><span className="brand__mark"><i/><i/><i/><i/></span><span>Ableton <strong>Device Mapper</strong></span></a><div className="signal-chain"><span>Control Pool</span><b>+</b><span>Layout Stack</span><b>→</b><span>Remote Script</span></div><div className="catalog-status"><span>LIVE {catalog.abletonVersion}</span><Badge>{catalog.deviceCount} DEVICES</Badge></div></header>
    <main id="top">
      <section className="hero native-hero"><div className="eyebrow"><span className="live-dot"/> MODULAR LAYOUT BUILDER / CATALOG-DRIVEN</div><h1>Stack controls.<br/><em>Build your surface.</em></h1><p>Add musical layouts like building blocks, assign captured hardware intelligently, then export one coherent Ableton Remote Script.</p></section>
      <nav className="stepper stepper--six" aria-label="Builder steps">{STEPS.map((label, index) => <button key={label} className={`step ${activeStep === index ? 'step--active' : ''}`} onClick={() => setActiveStep(index)}><span className="step__number">0{index + 1}</span><span className="step__icon"><Icon name={['name','midi','target','layout','route','export'][index]}/></span><span className="step__label">{label}</span><Badge status={readiness[index] ? 'ready' : 'missing'}>{readiness[index] ? 'READY' : 'MISSING'}</Badge></button>)}</nav>
      <section className="workspace">
        {activeStep === 0 && <article className="panel"><PanelHeader index="01" title="Script Name" subtitle="Give this Control Surface a readable, reusable identity."/><ScriptNameCard scriptName={scriptName} setScriptName={(value) => { setScriptName(value); setScriptNameTouched(true) }} reset={() => { setScriptName(defaultScriptName); setScriptNameTouched(false) }} naming={scriptNaming} tooLong={scriptNameTooLong}/><div className="panel-actions"><button className="primary-button" onClick={() => setActiveStep(1)}>Connect controller →</button></div></article>}

        {activeStep === 1 && <div className="panel-layout"><article className="panel"><PanelHeader index="02" title="Connect MIDI Controller" subtitle="Capture controls into a reusable MIDI Control Pool."/><div className="connect-row"><button className="primary-button" onClick={enableMidi} disabled={!midiSupported || midiStatus === 'requesting'}><Icon name="midi"/>{midiStatus === 'requesting' ? 'Requesting…' : 'Enable MIDI'}</button><label className="field field--grow"><span>MIDI INPUT</span><select value={selectedInputId} onChange={(event) => setSelectedInputId(event.target.value)} disabled={!inputs.length}><option value="">{inputs.length ? 'Choose input' : 'No input detected'}</option>{inputs.map((input) => <option key={input.id} value={input.id}>{input.name}</option>)}</select></label></div>{midiError&&<p className="error-note">{midiError}</p>}<MessageMonitor message={lastMessage} learning={Boolean(learningMappingId)}/></article><aside className="panel"><PanelHeader title="MIDI Control Pool" subtitle={`${controlPool.filter((item) => !item.assigned).length} free · ${controlPool.filter((item) => item.assigned).length} assigned`}/><ControlPool controls={controlPool} update={(id, patch) => setControls((current) => current.map((control) => control.id === id ? { ...control, ...patch } : control))}/></aside></div>}

        {activeStep === 2 && <article className="panel"><PanelHeader index="03" title="Choose Ableton Device" subtitle="Layouts resolve against exact Live catalog parameter names."/><div className="device-picker-grid"><div className="device-picker-controls"><label className="field"><span>CATEGORY</span><select value={category} onChange={(event) => { const nextCategory=event.target.value; const device=devices.find((item)=>item.deviceCategory===nextCategory); setCategory(nextCategory); if(device){setDeviceKey(device.catalogKey);setLayoutStack([]);setMappings([])} }}>{DEVICE_CATEGORIES.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="field"><span>SEARCH DEVICE</span><input value={deviceSearch} onChange={(event)=>setDeviceSearch(event.target.value)} placeholder="Operator, EQ Eight, Roar…"/></label><label className="field"><span>DEVICE</span><select aria-label="Ableton device" value={deviceKey} onChange={(event)=>{const device=devices.find((item)=>item.catalogKey===event.target.value);if(device){setDeviceKey(device.catalogKey);setLayoutStack([]);setMappings([])}}}>{filteredDevices.map((device)=><option key={device.catalogKey} value={device.catalogKey}>{device.deviceName}</option>)}</select></label></div><div className="device-dossier"><span className="dossier-kicker">NATIVE DEVICE DOSSIER</span><h2>{selectedDevice.deviceName}</h2><div className="dossier-metrics"><div><small>CLASS</small><strong>{selectedDevice.deviceClassName}</strong></div><div><small>PARAMETERS</small><strong>{selectedDevice.parameterCount}</strong></div><div><small>LAYOUTS</small><strong>{layouts.length}</strong></div></div></div></div><div className="panel-actions"><button className="primary-button" onClick={()=>setActiveStep(3)}>Add layouts →</button></div></article>}

        {activeStep === 3 && <article className="panel"><PanelHeader index="04" title="Add Layouts" subtitle="Add modules by default; replace or preview only when needed."/><div className="layout-builder-toolbar"><label className="include-buttons-check"><input type="checkbox" checked={includeButtonLayouts} onChange={(event)=>setIncludeButtonLayouts(event.target.checked)}/><span><strong>Include button layouts</strong><small>Add performance switches to Auto-build.</small></span></label><button className="auto-build-button" onClick={autoBuild}>Auto-build best layout</button><button className="secondary-button" onClick={()=>{setLayoutStack([]);setMappings([])}}>Clear mapping</button></div><div className="layout-builder-grid"><div><h3 className="subsection-title">Available Layouts</h3><div className="preset-grid layout-catalog">{layouts.map((layout)=><button key={layout.id} className={`preset-card ${selectedLayoutId===layout.id?'preset-card--active':''}`} onClick={()=>setSelectedLayoutId(layout.id)}><span>{String(layout.controlCount).padStart(2,'0')}</span><strong>{layout.name}</strong><small>{layout.description}</small></button>)}</div><div className="layout-actions"><button className="primary-button" onClick={()=>applyLayout('add')}>Add layout</button><button className="secondary-button" onClick={()=>applyLayout('replace')}>Replace mapping</button><button className="secondary-button" onClick={()=>applyLayout('preview')}>Preview only</button></div>{previewLayout&&<div className="layout-preview-list"><strong>{previewLayout.layout.name}</strong>{previewLayout.controls.map((control,index)=><span key={`${control.parameterName}-${index}`}>{control.preferredControlKind} → {control.parameterName||'Unassigned parameter'}</span>)}</div>}</div><LayoutStack stack={layoutStack} warnings={warnings} onRemove={(id)=>commitBuilder(removeLayoutFromBuilder(builderState(),id))} onMove={(id,direction)=>commitBuilder(moveLayoutInStack(builderState(),id,direction))}/></div></article>}

        {activeStep === 4 && <article className="panel"><PanelHeader index="05" title="Configure Mapping" subtitle="Edit grouped routes, sources, parameters, scaling, and conflict policy."/><HealthSummary health={health}/><div className="mapping-toolbar"><span>{mappings.length} ACTIVE ROUTES</span><div><button className="secondary-button" onClick={addManualMapping}>+ Manual mapping</button><button className="secondary-button" onClick={exportProfile}>Export Profile JSON</button><button className="secondary-button" onClick={()=>importInputRef.current?.click()}>Import Profile JSON</button><input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={importProfile}/></div></div>{profileMessage&&<p className="profile-message">{profileMessage}</p>}<GroupedMappingMatrix mappings={mappings} stack={layoutStack} controls={controlPool} device={selectedDevice} warnings={warnings} learningMappingId={learningMappingId} updateMapping={updateMapping} setControlType={setControlType} chooseParameter={chooseParameter} assignSource={assignSource} learn={setLearningMappingId} remove={(id)=>setMappings((current)=>current.filter((mapping)=>mapping.id!==id))}/><div className="panel-actions"><button className="primary-button" disabled={!mappings.length} onClick={()=>setActiveStep(5)}>Review export →</button></div></article>}

        {activeStep === 5 && <article className="panel export-panel"><PanelHeader index="06" title="Export Ableton Device Pack" subtitle="Warnings remain visible but never block an intentional export."/><HealthSummary health={health}/><div className="export-layout"><div><div className="export-stamp"><Icon name="export"/><span>PACK STATUS</span><strong>{mappings.length?'READY TO BUILD':'WAITING FOR ROUTES'}</strong></div><h2>{scriptNaming.scriptSlug}</h2><p className="muted">{layoutStack.length} layouts · {mappings.length} mappings · {warnings.length} warnings</p><button className="export-button" onClick={exportPack} disabled={!mappings.length||isExporting}><Icon name="export"/>{isExporting?'Building ZIP…':'Download native device pack'}</button></div><NativeFileTree scriptSlug={scriptNaming.scriptSlug}/></div>{lastExportedSlug&&<NativeSetupWizard scriptSlug={lastExportedSlug} deviceName={selectedDevice.deviceName} inputName={inputName}/>}</article>}
      </section>
    </main>
    <footer><span>ABLETON DEVICE MAPPER / LAYOUT BUILDER</span><span>STACK · ASSIGN · VERIFY · EXPORT</span><a href="https://deerflow.tech" target="_blank" rel="noreferrer">Created By Deerflow ↗</a></footer>
  </div>
}

function PanelHeader({index,title,subtitle}) { return <div className="panel-header">{index&&<span className="panel-index">{index}</span>}<div><h2>{title}</h2><p>{subtitle}</p></div></div> }
function EmptyState({title,body}) { return <div className="empty-state"><span className="pulse-ring"><i/></span><div><strong>{title}</strong><p>{body}</p></div></div> }

function ScriptNameCard({scriptName,setScriptName,reset,naming,tooLong}) { return <div className="script-name-card"><div className="script-name-heading"><div><span>SCRIPT IDENTITY</span><strong>Name your Ableton Control Surface</strong></div><button onClick={reset}>Reset to default</button></div><label className="field"><span>SCRIPT NAME</span><input aria-label="Script name" value={scriptName} placeholder="Operator NanoKontrol Remote" onChange={(event)=>setScriptName(event.target.value)}/><small>Spaces and accents are converted to safe Ableton and Python identifiers.</small></label><div className="safe-name-preview"><div><span>ABLETON-SAFE NAME</span><strong>{naming.scriptSlug}</strong></div><div><span>PYTHON CLASS</span><strong>{naming.pythonClassName}</strong></div></div>{tooLong&&<p className="soft-warning">Long name: a shorter Control Surface name is easier to identify in Ableton.</p>}</div> }

function MessageMonitor({message,learning}) { return <div className={`message-monitor ${message?'message-monitor--live':''}`}><div className="monitor-heading"><span><i/> {learning?'LEARN MIDI: MOVE A CONTROL':'LAST MIDI MESSAGE'}</span>{message&&<Badge status="captured">CC {message.data1} · {message.data2}</Badge>}</div>{message?<div className="message-fields native-message-fields">{[['ENDPOINT',message.endpointName],['USER CH',message.userChannel],['FRAMEWORK CH',message.frameworkChannel],['CC',message.data1],['VALUE',message.data2]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>:<EmptyState title="Listening for Control Change" body="Enable MIDI, then move hardware controls."/>}</div> }

function ControlPool({controls,update}) { if(!controls.length)return <EmptyState title="Control pool empty" body="Captured knobs, faders, and buttons appear here."/>; return <div className="control-pool">{controls.map((control)=><div className={`pool-control ${control.assigned?'pool-control--assigned':''}`} key={control.id}><div><span className="cc-chip">CC {control.data1}</span><strong>{control.label}</strong></div><small>{control.assigned?`ASSIGNED × ${control.assignedMappingIds.length}`:'FREE'} · CH {control.userChannel}</small><select value={control.controlKind} onChange={(event)=>update(control.id,{controlKind:event.target.value})}><option value="knob">knob</option><option value="fader">fader</option><option value="button">button</option></select></div>)}</div> }

function LayoutStack({stack,warnings,onRemove,onMove}) { return <aside className="layout-stack"><h3 className="subsection-title">Layout Stack</h3>{stack.length?stack.map((entry,index)=>{const conflicts=warnings.filter((warning)=>warning.mappingIds.some((id)=>id.startsWith(entry.layoutInstanceId))).length;return <div className="stack-entry" key={entry.layoutInstanceId}><span>{String(index+1).padStart(2,'0')}</span><div><strong>{entry.layoutName}</strong><small>{entry.controlCount} controls</small></div>{conflicts>0&&<Badge status="captured">{conflicts} conflicts</Badge>}<div className="stack-actions"><button onClick={()=>onMove(entry.layoutInstanceId,-1)} disabled={index===0}>↑</button><button onClick={()=>onMove(entry.layoutInstanceId,1)} disabled={index===stack.length-1}>↓</button><button onClick={()=>onRemove(entry.layoutInstanceId)}>×</button></div></div>}):<EmptyState title="Stack is empty" body="Select a layout and use Add layout."/>}</aside> }

function HealthSummary({health}) { return <div className="health-summary"><div><span>LAYOUT HEALTH</span><strong>{health.ok} mappings OK</strong></div><div><small>DUPLICATE MIDI</small><strong>{health.duplicateSources}</strong></div><div><small>DUPLICATE PARAMETERS</small><strong>{health.duplicateParameters}</strong></div><div><small>UNASSIGNED</small><strong>{health.unassigned}</strong></div><Badge status={health.totalWarnings?'captured':'ready'}>{health.totalWarnings} WARNINGS</Badge></div> }

function GroupedMappingMatrix({mappings,stack,controls,device,warnings,learningMappingId,updateMapping,setControlType,chooseParameter,assignSource,learn,remove}) {
  if(!mappings.length)return <EmptyState title="No mappings" body="Add a layout or create a manual route."/>
  const groups=[...stack.map((entry)=>({id:entry.layoutInstanceId,name:entry.layoutName,mappings:mappings.filter((mapping)=>mapping.layoutInstanceId===entry.layoutInstanceId)})),{id:'manual',name:'Manual mappings',mappings:mappings.filter((mapping)=>mapping.createdBy==='manual')}].filter((group)=>group.mappings.length)
  return <div className="mapping-groups">{groups.map((group)=><section className="mapping-group" key={group.id}><div className="mapping-group-title"><span>{group.name}</span><Badge>{group.mappings.length} ROUTES</Badge></div>{group.mappings.map((mapping)=>{const query=(mapping.parameterSearch||'').toLowerCase();const options=device.parameters.filter((parameter)=>(!query||`${parameter.name} ${parameter.section}`.toLowerCase().includes(query))).slice(0,120);const rowWarnings=warnings.filter((warning)=>warning.mappingIds.includes(mapping.id));const isButton=mapping.controlType==='button';return <div className={`builder-mapping-row ${isButton?'builder-mapping-row--button':''} ${rowWarnings.length?'builder-mapping-row--warning':''}`} key={mapping.id}><div className="mapping-kind"><Badge status={isButton?'captured':'ready'}>{isButton?'BUTTON':'CC'}</Badge><label><span>CONTROL TYPE</span><select aria-label="Control type" value={mapping.controlType||'continuous'} onChange={(event)=>setControlType(mapping,event.target.value)}><option value="continuous">Continuous</option><option value="button">Button</option></select></label></div><div className="builder-source"><select aria-label="MIDI source" value={mapping.source?.id||''} onChange={(event)=>assignSource(mapping.id,event.target.value)}><option value="">No MIDI source assigned</option>{controls.map((control)=><option key={control.id} value={control.id}>{control.label} · CC {control.data1} · {control.controlKind}</option>)}</select><div><button className={learningMappingId===mapping.id?'learn-button learn-button--active':'learn-button'} onClick={()=>learn(learningMappingId===mapping.id?'':mapping.id)}>{learningMappingId===mapping.id?'Move a control…':'Learn MIDI'}</button><button className="mini-button" onClick={()=>assignSource(mapping.id,'')}>Unassign</button></div></div><div className="builder-target"><input value={mapping.userLabel||''} onChange={(event)=>updateMapping(mapping.id,{userLabel:event.target.value})} aria-label="Mapping label"/><input type="search" value={mapping.parameterSearch||''} onChange={(event)=>updateMapping(mapping.id,{parameterSearch:event.target.value})} placeholder="Search parameter"/><select value={mapping.targetParameterName||''} onChange={(event)=>chooseParameter(mapping,event.target.value)}><option value="">No target parameter</option>{mapping.targetParameterName&&<option value={mapping.targetParameterName}>{mapping.targetParameterName}</option>}{options.filter((parameter)=>parameter.name!==mapping.targetParameterName).map((parameter)=><option key={`${parameter.liveIndex}-${parameter.name}`} value={parameter.name}>{parameter.name}</option>)}</select></div><div className="builder-options">{isButton?<><label><span>BUTTON MODE</span><select aria-label="Button mode" value={mapping.buttonMode||''} onChange={(event)=>updateMapping(mapping.id,{buttonMode:event.target.value})}><option value="">Choose mode</option><option value="momentary">Momentary</option><option value="toggle_from_input">Input toggle</option><option value="toggle_in_script">Script toggle</option><option value="trigger">Trigger</option></select></label><small className="button-mode-help">Momentary = on while held<br/>Script toggle = latch on/off<br/>Trigger = one-shot action</small></>:<><label><span>SCALING</span><select value={mapping.invert?'inverted_parameter_min_max':'parameter_min_max'} onChange={(event)=>updateMapping(mapping.id,{invert:event.target.value==='inverted_parameter_min_max',scaling:event.target.value})}><option value="parameter_min_max">parameter min/max</option><option value="inverted_parameter_min_max">inverted min/max</option></select></label><label className="invert-check"><input type="checkbox" checked={mapping.invert===true} onChange={(event)=>updateMapping(mapping.id,{invert:event.target.checked,scaling:event.target.checked?'inverted_parameter_min_max':'parameter_min_max'})}/> Invert MIDI</label><small>curve: {mapping.curve||'linear'}</small></>}</div><details className="advanced-index"><summary><strong className={mapping.allowIndexFallback?'fallback-state fallback-state--enabled':'fallback-state'}>{mapping.allowIndexFallback?'Index fallback enabled':'Name match first'}</strong><span>Advanced</span></summary><label className="fallback-opt-in"><input type="checkbox" checked={mapping.allowIndexFallback===true} onChange={(event)=>updateMapping(mapping.id,{allowIndexFallback:event.target.checked})}/><span><strong>Allow index fallback</strong><small>Keep disabled unless name matching cannot work.</small></span></label></details><div className="row-warning-list">{rowWarnings.map((warning)=><small key={`${warning.type}-${warning.message}`}>{warning.message}</small>)}</div><button className="icon-button" onClick={()=>remove(mapping.id)} aria-label="Delete mapping"><Icon name="trash"/></button></div>})}</section>)}</div>
}

function NativeFileTree({scriptSlug}) { return <div className="file-tree"><div className="file-tree__head"><span>ZIP CONTENTS</span><Badge>6 FILES</Badge></div><pre>{`Ableton_Device_Mapper_Pack/
├── 1_COPY_THIS_FOLDER_TO_REMOTE_SCRIPTS/
│   └── ${scriptSlug}/
│       ├── __init__.py
│       ├── ${scriptSlug}.py
│       └── profile.json
├── 2_READ_ME_FIRST.md
├── INSTALL_CHECK.command
└── TROUBLESHOOTING.md`}</pre></div> }

function NativeSetupWizard({scriptSlug,deviceName,inputName}) { const commands=createAbletonDeviceTerminalCommands(scriptSlug);return <section className="setup-wizard"><div className="wizard-heading"><div><span className="panel-index">✓</span><div><h2>Setup Wizard</h2><p>Install the stack as one Control Surface.</p></div></div></div><div className="wizard-config"><div><small>CONTROL SURFACE</small><strong>{scriptSlug}</strong></div><div><small>INPUT</small><strong>{inputName}</strong></div><div><small>TARGET</small><strong>{deviceName}</strong></div></div><div className="terminal-tools">{commands.map(([label,command])=><div className="command-block" key={label}><div>{label}</div><pre>{command}</pre></div>)}</div></section> }
