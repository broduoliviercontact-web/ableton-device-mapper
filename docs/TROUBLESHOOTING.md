# Troubleshooting

## Device not found

- Confirm that the native device exists in the current Set.
- Select the track containing it before moving a control.
- Check whether the device was renamed.
- Inspect the device aliases logged by the script.

## Parameter not found

- Compare the target name with `profile.json`.
- Read `available parameters` in Log.txt.
- Try another recommended catalog parameter.
- Use Advanced index fallback only when name matching cannot work.

## Wrong parameter moves

- Keep index fallback disabled.
- Remove duplicate or old Remote Script folders.
- Remove `__pycache__` and restart Live.
- Check `BUILD_ID` to identify the script Live actually loaded.

## Nothing moves

- Check the selected Control Surface and MIDI Input.
- Keep Output set to `None`.
- Restart Live after replacing a script.
- Run `INSTALL_CHECK.command`.

## Focused macOS log command

Adjust the Live version directory if needed:

```bash
grep -R "Ableton Device Mapper\|BUILD_ID\|device not found\|target device found\|parameter found\|parameter missing\|available parameters\|parameter updated" \
"$HOME/Library/Preferences/Ableton/Live 12.4.5b6/Log.txt" \
| tail -n 180
```
