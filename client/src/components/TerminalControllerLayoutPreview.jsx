import { useEffect, useMemo, useState } from 'react'
import { isButtonLikeParameter } from '../utils/layoutBuilder.js'

const KIND_ORDER = ['knob', 'fader', 'button']
const KIND_LABELS = { knob: 'Knobs', fader: 'Faders', button: 'Buttons' }

function AsciiControlGlyph({ kind, mapping }) {
  const value = Math.max(0, Math.min(127, Number(mapping?.source?.lastValue) || 0))
  const valueLabel = String(value).padStart(3, '0')
  const percent = (value / 127) * 100
  if (kind === 'knob') {
    const angle = -132 + (percent * 2.64)
    return <div className="ascii-control-glyph ascii-knob" role="img" aria-label={`Knob value ${value}`}>
      <pre aria-hidden="true">{`   .---------.
  /           \\
 |      O      |
  \\___________/`}</pre>
      <span className="ascii-knob__needle" style={{ transform: `translateX(-50%) rotate(${angle}deg)` }} aria-hidden="true">|</span>
      <strong>VALUE:{valueLabel}</strong>
    </div>
  }
  if (kind === 'fader') {
    return <div className="ascii-control-glyph ascii-fader" role="img" aria-label={`Fader value ${value}`}>
      <span className="ascii-fader__max">127 +</span>
      <span className="ascii-fader__track" aria-hidden="true"><i className="ascii-fader__thumb" style={{ bottom: `${percent}%` }}>[###]</i></span>
      <span className="ascii-fader__min">000 +</span>
      <strong>VALUE:{valueLabel}</strong>
    </div>
  }
  const active = value > 0
  const mode = mapping?.buttonMode === 'trigger' ? 'TRIGGER' : mapping?.buttonMode === 'momentary' ? 'MOMENT' : 'TOGGLE'
  return <div className={`ascii-control-glyph ascii-pad ${active ? 'ascii-pad--active' : ''}`} role="img" aria-label={`Button ${active ? 'on' : 'off'}, value ${value}`}>
    <pre aria-hidden="true">{`+------------+
| ${active ? '[*  ON  *]' : '[   OFF  ]'} |
+------------+`}</pre>
    <strong>MODE:{mode}</strong>
    <strong>VALUE:{valueLabel}</strong>
  </div>
}

function VisualControl({ control, mapping, warnings, selected, learning, onSelect, onLearn, onUnassign }) {
  const hasWarnings = warnings.length > 0
  const status = learning ? 'LEARN' : selected ? 'EDIT' : hasWarnings ? 'WARN !' : mapping?.source && mapping?.targetParameterName ? 'OK' : 'WAIT'
  return <div role="button" tabIndex="0" data-control-kind={control.kind} className={`visual-control visual-control--${control.kind} ${selected ? 'visual-control--selected' : ''} ${learning ? 'visual-control--learning' : ''} ${hasWarnings ? 'visual-control--warning' : ''}`} onClick={onSelect} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect() }}>
    <span className="ascii-control-border" aria-hidden="true">+--------------------------+</span>
    <div className="ascii-control-body">
      <strong>|{selected ? '>' : ' '} {mapping?.visualControlLabel || control.label}</strong>
      <AsciiControlGlyph kind={control.kind} mapping={mapping} />
      <span className={mapping?.source ? 'visual-route visual-route--assigned' : 'visual-route'}>| MIDI: {learning ? 'WAIT..._' : mapping?.source ? `CC${mapping.source.data1} / CH${mapping.source.userChannel}` : 'NONE'}</span>
      <span className="visual-target">| TARGET: {mapping?.targetParameterName || 'NONE'}</span>
      <span className={`ascii-status ascii-status--${status.replace(/\W/g, '').toLowerCase()}`}>| STATUS: {status}</span>
    </div>
    <span className="visual-control__actions">
      <button type="button" className={learning ? 'ascii-button learn-button--active' : 'ascii-button'} onClick={(event) => { event.stopPropagation(); onLearn() }}>[ {learning ? 'WAITING' : 'LEARN'} ]</button>
      {mapping?.source && <button type="button" className="ascii-button" onClick={(event) => { event.stopPropagation(); onUnassign() }}>[ CLEAR ]</button>}
    </span>
    <span className="ascii-control-border" aria-hidden="true">+--------------------------+</span>
  </div>
}

export default function ControllerLayoutPreview({
  customLayouts,
  mappings,
  warnings,
  selectedMappingId,
  learningMappingId,
  device,
  onSelect,
  onLearn,
  onUnassign,
  onAddControl,
  onRemoveControl,
  onRenameLayout,
  onUpdateControl,
  onUpdateMapping,
  onChooseParameter,
}) {
  const [activeLayoutId, setActiveLayoutId] = useState(customLayouts[0]?.layoutInstanceId || '')
  const [parameterSearch, setParameterSearch] = useState('')
  useEffect(() => {
    if (!customLayouts.some((layout) => layout.layoutInstanceId === activeLayoutId)) setActiveLayoutId(customLayouts[0]?.layoutInstanceId || '')
  }, [customLayouts, activeLayoutId])

  const layout = customLayouts.find((item) => item.layoutInstanceId === activeLayoutId) || customLayouts[0]
  const selectedMapping = mappings.find((mapping) => mapping.id === selectedMappingId && mapping.createdBy === 'custom_layout' && mapping.layoutInstanceId === layout?.layoutInstanceId)
    || mappings.find((mapping) => mapping.layoutInstanceId === layout?.layoutInstanceId)
  const selectedControl = layout?.controls.find((control) => control.mappingId === selectedMapping?.id)
  const parameterOptions = useMemo(() => {
    const query = parameterSearch.trim().toLowerCase()
    const filtered = (device?.parameters || []).filter((parameter) => !query || `${parameter.name} ${parameter.section}`.toLowerCase().includes(query))
    return [...filtered].sort((a, b) => {
      if (selectedMapping?.controlType === 'button') return Number(isButtonLikeParameter(b)) - Number(isButtonLikeParameter(a))
      return Number(b.recommendedForKnob === true) - Number(a.recommendedForKnob === true)
    }).slice(0, 140)
  }, [device, parameterSearch, selectedMapping?.controlType])

  if (!layout) return <div className="controller-designer-empty ascii-window"><pre className="ascii-pre">{`+----------------------------------------------------------+
| CUSTOM GRID / MIDI SURFACE                               |
+----------------------------------------------------------+
| STATUS: EMPTY                                            |
| > DEFINE FADERS / KNOBS / BUTTONS                        |
| > [ CREATE CUSTOM LAYOUT ]                               |
+----------------------------------------------------------+`}</pre></div>

  const controlWarnings = (mappingId) => warnings.filter((warning) => warning.mappingIds.includes(mappingId))
  return <div className="controller-designer">
    <div className="controller-surface">
      <div className="controller-surface__header">
        <div><span>+---------------- CUSTOM GRID / MIDI SURFACE ----------------+</span><input aria-label="Custom layout name" value={layout.layoutName} onChange={(event) => onRenameLayout(layout.layoutInstanceId, event.target.value)} /></div>
        <div className="diagram-metrics"><span><b>{layout.controls.length}</b> modules</span><span><b>{mappings.filter((mapping) => mapping.layoutInstanceId === layout.layoutInstanceId && mapping.source).length}</b> learned</span><span><b>{warnings.filter((warning) => warning.mappingIds.some((id) => layout.controls.some((control) => control.mappingId === id))).length}</b> alerts</span></div>
        {customLayouts.length > 1 && <select aria-label="Custom layout" value={layout.layoutInstanceId} onChange={(event) => setActiveLayoutId(event.target.value)}>{customLayouts.map((item) => <option key={item.layoutInstanceId} value={item.layoutInstanceId}>{item.layoutName}</option>)}</select>}
      </div>
      <div className="controller-faceplate">
        <div className="surface-ruler"><span>+------</span><span>CONTROL BUS / CHANNEL ROUTING</span><span>------+</span></div>
        {KIND_ORDER.map((kind) => {
          const controls = layout.controls.filter((control) => control.kind === kind)
          if (!controls.length) return null
          return <section className={`controller-row controller-row--${kind}`} key={kind}><span className="controller-row__label">| {KIND_LABELS[kind].toUpperCase()}</span><div>{controls.map((control) => {
            const mapping = mappings.find((item) => item.id === control.mappingId)
            return <VisualControl key={control.id} control={control} mapping={mapping} warnings={controlWarnings(control.mappingId)} selected={selectedMapping?.id === control.mappingId} learning={learningMappingId === control.mappingId} onSelect={() => onSelect(control.mappingId)} onLearn={() => onLearn(control.mappingId)} onUnassign={() => onUnassign(control.mappingId)} />
          })}</div></section>
        })}
        {!layout.controls.length && <p className="controller-empty-row">This faceplate is empty. Add a control below.</p>}
      </div>
      <div className="controller-add-strip"><span>&gt; ADD_MODULE:</span><button type="button" onClick={() => onAddControl(layout.layoutInstanceId, 'knob')}>[ + KNOB ]</button><button type="button" onClick={() => onAddControl(layout.layoutInstanceId, 'fader')}>[ + FADER ]</button><button type="button" onClick={() => onAddControl(layout.layoutInstanceId, 'button')}>[ + BUTTON ]</button></div>
    </div>

    <aside className="visual-control-editor">
      {selectedMapping && selectedControl ? <>
        <div className="visual-editor__heading"><div><span>+----------- EDIT CONTROL -----------+</span><strong>| CONTROL: {selectedMapping.visualControlLabel}</strong></div><span className={`editor-kind editor-kind--${selectedControl.kind}`}>[{selectedControl.kind}]</span></div>
        <label><span>CONTROL LABEL</span><input aria-label="Visual control label" value={selectedMapping.visualControlLabel || ''} onChange={(event) => onUpdateControl(selectedControl.id, { label: event.target.value })} /></label>
        <label><span>CONTROL SHAPE</span><select aria-label="Visual control kind" value={selectedControl.kind} onChange={(event) => onUpdateControl(selectedControl.id, { kind: event.target.value })}><option value="knob">Knob</option><option value="fader">Fader</option><option value="button">Button</option></select></label>
        <div className="visual-midi-actions"><button type="button" className={learningMappingId === selectedMapping.id ? 'primary-button learn-button--active' : 'primary-button'} onClick={() => onLearn(selectedMapping.id)}>{learningMappingId === selectedMapping.id ? 'WAIT MIDI...' : 'LEARN MIDI'}</button><button type="button" className="secondary-button" onClick={() => onUnassign(selectedMapping.id)}>UNASSIGN</button></div>
        <div className="visual-assignment-readout"><small>MIDI</small><strong>{selectedMapping.source ? `CC ${selectedMapping.source.data1} · Channel ${selectedMapping.source.userChannel}` : 'Not assigned'}</strong></div>
        <label><span>SEARCH PARAMETER</span><input aria-label="Visual parameter search" type="search" value={parameterSearch} onChange={(event) => setParameterSearch(event.target.value)} placeholder="Volume, Filter Freq, Device On…" /></label>
        <label><span>TARGET PARAMETER</span><select aria-label="Visual target parameter" value={selectedMapping.targetParameterName || ''} onChange={(event) => onChooseParameter(selectedMapping, event.target.value)}><option value="">No parameter</option>{selectedMapping.targetParameterName && <option value={selectedMapping.targetParameterName}>{selectedMapping.targetParameterName}</option>}{parameterOptions.filter((parameter) => parameter.name !== selectedMapping.targetParameterName).map((parameter) => <option key={`${parameter.liveIndex}-${parameter.name}`} value={parameter.name}>{isButtonLikeParameter(parameter) ? '◼ ' : ''}{parameter.name}</option>)}</select></label>
        {selectedMapping.controlType === 'button' ? <label><span>BUTTON MODE</span><select aria-label="Visual button mode" value={selectedMapping.buttonMode || 'toggle_in_script'} onChange={(event) => onUpdateMapping(selectedMapping.id, { buttonMode: event.target.value })}><option value="momentary">Momentary</option><option value="toggle_from_input">Input toggle</option><option value="toggle_in_script">Script toggle</option><option value="trigger">Trigger</option></select><small>Script toggle is ideal for momentary buttons that should latch.</small></label> : <div className="visual-scaling-options"><label><span>SCALING</span><select aria-label="Visual scaling" value={selectedMapping.invert ? 'inverted_parameter_min_max' : 'parameter_min_max'} onChange={(event) => onUpdateMapping(selectedMapping.id, { invert: event.target.value === 'inverted_parameter_min_max', scaling: event.target.value })}><option value="parameter_min_max">parameter_min_max</option><option value="inverted_parameter_min_max">inverted_parameter_min_max</option></select></label><label className="invert-check"><input type="checkbox" checked={selectedMapping.invert === true} onChange={(event) => onUpdateMapping(selectedMapping.id, { invert: event.target.checked, scaling: event.target.checked ? 'inverted_parameter_min_max' : 'parameter_min_max' })}/> Invert MIDI</label></div>}
        <div className="visual-warning-stack">{controlWarnings(selectedMapping.id).map((warning) => <small key={`${warning.type}-${warning.message}`}>⚠ {warning.message}</small>)}</div>
        <button type="button" className="remove-visual-control" onClick={() => onRemoveControl(selectedControl.id)}>&gt; [ REMOVE CONTROL ]</button>
      </> : <div className="visual-editor-empty"><strong>Select a control</strong><p>Click any module on the faceplate to edit MIDI, target, label, and behavior.</p></div>}
    </aside>
  </div>
}
