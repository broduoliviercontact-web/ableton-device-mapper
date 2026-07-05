import { useEffect, useMemo, useState } from 'react'
import { isButtonLikeParameter } from '../utils/layoutBuilder.js'

const KIND_ORDER = ['knob', 'fader', 'button']
const KIND_LABELS = { knob: 'Knobs', fader: 'Faders', button: 'Buttons' }

function ControlGlyph({ kind, mapping }) {
  const value = Math.max(0, Math.min(127, Number(mapping?.source?.lastValue) || 0))
  const percent = value / 127
  if (kind === 'knob') {
    const angle = -132 + (percent * 264)
    return <span className="controller-glyph" role="img" aria-label={`Knob value ${value}`}><span className="controller-knob"><i style={{ transform: `rotate(${angle}deg)` }} /></span><small>{String(value).padStart(3, '0')}</small></span>
  }
  if (kind === 'fader') {
    const top = 4 + ((1 - percent) * 36)
    return <span className="controller-glyph" role="img" aria-label={`Fader value ${value}`}><span className="controller-fader"><i style={{ top: `${top}px` }} /></span><small>{String(value).padStart(3, '0')}</small></span>
  }
  const active = value > 0
  return <span className="controller-glyph" role="img" aria-label={`Button ${active ? 'on' : 'off'}, value ${value}`}><span className={`controller-button ${active ? 'controller-button--active' : ''}`}><i /></span><small>{active ? 'ON' : 'OFF'}</small></span>
}

function VisualControl({ control, mapping, warnings, selected, learning, onSelect, onLearn, onUnassign }) {
  const hasWarnings = warnings.length > 0
  return <div role="button" tabIndex="0" className={`visual-control visual-control--${control.kind} ${selected ? 'visual-control--selected' : ''} ${hasWarnings ? 'visual-control--warning' : ''}`} onClick={onSelect} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect() }}>
    <span className="visual-control__top"><small>{control.kind}</small>{hasWarnings && <b title={warnings.map((warning) => warning.message).join('\n')}>!</b>}</span>
    <ControlGlyph kind={control.kind} mapping={mapping} />
    <strong>{mapping?.visualControlLabel || control.label}</strong>
    <span className={mapping?.source ? 'visual-route visual-route--assigned' : 'visual-route'}>{mapping?.source ? `CC${mapping.source.data1} · CH${mapping.source.userChannel}` : 'Learn MIDI'}</span>
    <span className="visual-target">{mapping?.targetParameterName || 'No parameter'}</span>
    <span className="visual-control__actions">
      <button type="button" className={learning ? 'mini-button learn-button--active' : 'mini-button'} onClick={(event) => { event.stopPropagation(); onLearn() }}>{learning ? 'Waiting…' : 'Learn'}</button>
      {mapping?.source && <button type="button" className="mini-button" onClick={(event) => { event.stopPropagation(); onUnassign() }}>Unassign</button>}
    </span>
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

  if (!layout) return <div className="controller-designer-empty"><div className="designer-blueprint"><i/><i/><i/><i/><i/><i/></div><strong>Draw your controller</strong><p>Choose faders, knobs, and buttons above, then create a custom layout.</p></div>

  const controlWarnings = (mappingId) => warnings.filter((warning) => warning.mappingIds.includes(mappingId))
  return <div className="controller-designer">
    <div className="controller-surface">
      <div className="controller-surface__header">
        <div><span>CUSTOM GRID / MIDI SURFACE</span><input aria-label="Custom layout name" value={layout.layoutName} onChange={(event) => onRenameLayout(layout.layoutInstanceId, event.target.value)} /></div>
        {customLayouts.length > 1 && <select aria-label="Custom layout" value={layout.layoutInstanceId} onChange={(event) => setActiveLayoutId(event.target.value)}>{customLayouts.map((item) => <option key={item.layoutInstanceId} value={item.layoutInstanceId}>{item.layoutName}</option>)}</select>}
      </div>
      <div className="controller-faceplate">
        {KIND_ORDER.map((kind) => {
          const controls = layout.controls.filter((control) => control.kind === kind)
          if (!controls.length) return null
          return <section className={`controller-row controller-row--${kind}`} key={kind}><span className="controller-row__label">{KIND_LABELS[kind]}</span><div>{controls.map((control) => {
            const mapping = mappings.find((item) => item.id === control.mappingId)
            return <VisualControl key={control.id} control={control} mapping={mapping} warnings={controlWarnings(control.mappingId)} selected={selectedMapping?.id === control.mappingId} learning={learningMappingId === control.mappingId} onSelect={() => onSelect(control.mappingId)} onLearn={() => onLearn(control.mappingId)} onUnassign={() => onUnassign(control.mappingId)} />
          })}</div></section>
        })}
        {!layout.controls.length && <p className="controller-empty-row">This faceplate is empty. Add a control below.</p>}
      </div>
      <div className="controller-add-strip"><span>ADD MODULE</span><button type="button" onClick={() => onAddControl(layout.layoutInstanceId, 'knob')}>+ Add knob</button><button type="button" onClick={() => onAddControl(layout.layoutInstanceId, 'fader')}>+ Add fader</button><button type="button" onClick={() => onAddControl(layout.layoutInstanceId, 'button')}>+ Add button</button></div>
    </div>

    <aside className="visual-control-editor">
      {selectedMapping && selectedControl ? <>
        <div className="visual-editor__heading"><div><span>SELECTED CONTROL</span><strong>{selectedMapping.visualControlLabel}</strong></div><span className={`editor-kind editor-kind--${selectedControl.kind}`}>{selectedControl.kind}</span></div>
        <label><span>CONTROL LABEL</span><input aria-label="Visual control label" value={selectedMapping.visualControlLabel || ''} onChange={(event) => onUpdateControl(selectedControl.id, { label: event.target.value })} /></label>
        <label><span>CONTROL SHAPE</span><select aria-label="Visual control kind" value={selectedControl.kind} onChange={(event) => onUpdateControl(selectedControl.id, { kind: event.target.value })}><option value="knob">Knob</option><option value="fader">Fader</option><option value="button">Button</option></select></label>
        <div className="visual-midi-actions"><button type="button" className={learningMappingId === selectedMapping.id ? 'primary-button learn-button--active' : 'primary-button'} onClick={() => onLearn(selectedMapping.id)}>{learningMappingId === selectedMapping.id ? 'Move a MIDI control…' : 'Learn MIDI'}</button><button type="button" className="secondary-button" onClick={() => onUnassign(selectedMapping.id)}>Unassign</button></div>
        <div className="visual-assignment-readout"><small>MIDI</small><strong>{selectedMapping.source ? `CC ${selectedMapping.source.data1} · Channel ${selectedMapping.source.userChannel}` : 'Not assigned'}</strong></div>
        <label><span>SEARCH PARAMETER</span><input aria-label="Visual parameter search" type="search" value={parameterSearch} onChange={(event) => setParameterSearch(event.target.value)} placeholder="Volume, Filter Freq, Device On…" /></label>
        <label><span>TARGET PARAMETER</span><select aria-label="Visual target parameter" value={selectedMapping.targetParameterName || ''} onChange={(event) => onChooseParameter(selectedMapping, event.target.value)}><option value="">No parameter</option>{selectedMapping.targetParameterName && <option value={selectedMapping.targetParameterName}>{selectedMapping.targetParameterName}</option>}{parameterOptions.filter((parameter) => parameter.name !== selectedMapping.targetParameterName).map((parameter) => <option key={`${parameter.liveIndex}-${parameter.name}`} value={parameter.name}>{isButtonLikeParameter(parameter) ? '◼ ' : ''}{parameter.name}</option>)}</select></label>
        {selectedMapping.controlType === 'button' ? <label><span>BUTTON MODE</span><select aria-label="Visual button mode" value={selectedMapping.buttonMode || 'toggle_in_script'} onChange={(event) => onUpdateMapping(selectedMapping.id, { buttonMode: event.target.value })}><option value="momentary">Momentary</option><option value="toggle_from_input">Input toggle</option><option value="toggle_in_script">Script toggle</option><option value="trigger">Trigger</option></select><small>Script toggle is ideal for momentary buttons that should latch.</small></label> : <div className="visual-scaling-options"><label><span>SCALING</span><select aria-label="Visual scaling" value={selectedMapping.invert ? 'inverted_parameter_min_max' : 'parameter_min_max'} onChange={(event) => onUpdateMapping(selectedMapping.id, { invert: event.target.value === 'inverted_parameter_min_max', scaling: event.target.value })}><option value="parameter_min_max">parameter_min_max</option><option value="inverted_parameter_min_max">inverted_parameter_min_max</option></select></label><label className="invert-check"><input type="checkbox" checked={selectedMapping.invert === true} onChange={(event) => onUpdateMapping(selectedMapping.id, { invert: event.target.checked, scaling: event.target.checked ? 'inverted_parameter_min_max' : 'parameter_min_max' })}/> Invert MIDI</label></div>}
        <div className="visual-warning-stack">{controlWarnings(selectedMapping.id).map((warning) => <small key={`${warning.type}-${warning.message}`}>⚠ {warning.message}</small>)}</div>
        <button type="button" className="remove-visual-control" onClick={() => onRemoveControl(selectedControl.id)}>Remove control</button>
      </> : <div className="visual-editor-empty"><strong>Select a control</strong><p>Click any module on the faceplate to edit MIDI, target, label, and behavior.</p></div>}
    </aside>
  </div>
}
