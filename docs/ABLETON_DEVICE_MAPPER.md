# Ableton Device Mapper

Ableton Device Mapper generates MIDI Remote Scripts for native Ableton Live instruments, audio effects, and MIDI effects. The browser application captures MIDI CC messages, uses a catalog to identify device parameters, and exports a ready-to-install ZIP.

## Difference from M4L Remote Mapper

- **Ableton Device Mapper** controls parameters exposed by native Live devices such as Operator, EQ Eight, or Arpeggiator.
- **M4L Remote Mapper** controls a specifically named Max for Live patch and its exposed parameters.

No Max for Live patch is generated or required by this project.

## Catalog contract

The included Live 12.4.5b6 catalog contains 83 devices and 2,746 parameters. Entries include the visible device name, Live class name, category, parameter name, `liveIndex`, Device-On-free `parameterIndex`, section, risk, and knob recommendation where available.

## Device discovery

Generated scripts search the selected track first, then regular tracks, return tracks, the master track, and nested rack chains. They safely compare aliases with `device.name`, `device.class_name`, and `device.class_display_name` when available.

## Parameter safety

Parameters resolve by exact alias and then normalized alias. Missing parameters produce an `available parameters` log. Advanced index fallback is disabled by default; when enabled, it excludes `Device On`, checks bounds, and rejects disabled parameters.

MIDI values are normalized from 0–127 and scaled to `parameter.min` / `parameter.max`.

## Presets

- 8 Knobs
- 8 Faders
- 16 Controls
- Operator Musical 8
- Auto Filter Basic
- EQ Eight Basic
- Blank Custom

Operator Musical 8 maps CC16–23 to Volume, Tone, Filter Freq, Filter Res, and oscillator A–D levels using catalog-validated indices.
