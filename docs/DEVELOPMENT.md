# Development

Ableton Device Mapper is a static React/Vite application. MIDI capture, catalog lookup, Python generation, and ZIP assembly happen locally in the browser.

## Install

```bash
npm --prefix client install
```

## Run

```bash
npm run dev
```

## Validate

```bash
npm test
npm --prefix client run build
git diff --check
```

Generator changes must preserve `EncoderElement`, `MIDI_CC_TYPE`, `add_value_listener`, retained `self._controls`, safe `_log`, `BUILD_ID`, alias-first resolution, min/max scaling, and opt-in-only index fallback. Generated scripts must not use `receive_midi`, `self.log_message`, `DeviceComponent`, or `set_device_component`.

The test suite compiles generated Python with `python3 -m py_compile` and inspects ZIP contents.
