import JSZip from 'jszip'
import { generateAbletonDeviceRemoteScriptFiles } from './abletonDeviceRemoteScriptGenerator.js'

export function generateAbletonDeviceInstallCheck(scriptSlug) {
  return `#!/bin/bash
SCRIPT_SLUG="${scriptSlug}"
SCRIPT_DIR="$HOME/Music/Ableton/User Library/Remote Scripts/$SCRIPT_SLUG"
PY_FILE="$SCRIPT_DIR/$SCRIPT_SLUG.py"
FAILURES=0
pass() { printf "✅ %s\\n" "$1"; }
fail() { printf "❌ %s\\n" "$1"; FAILURES=$((FAILURES + 1)); }
warn() { printf "⚠️  %s\\n" "$1"; }

printf "Ableton Device Mapper — installation check\\n"
printf "Checking: %s\\n\\n" "$SCRIPT_DIR"
[ -d "$SCRIPT_DIR" ] && pass "Remote Script folder exists" || fail "Remote Script folder is missing"
for file in "__init__.py" "$SCRIPT_SLUG.py" "profile.json"; do
  [ -f "$SCRIPT_DIR/$file" ] && pass "$file exists" || fail "$file is missing"
done
for marker in "EncoderElement" "add_value_listener" "BUILD_ID" "parameter_aliases" "_find_target_device"; do
  grep -Fq "$marker" "$PY_FILE" 2>/dev/null && pass "$marker is present" || fail "$marker is missing"
done
grep -Fq '"allow_index_fallback": False' "$PY_FILE" 2>/dev/null && pass "Index fallback is disabled by default" || fail "Default fallback marker is missing"
grep -Fq "def receive_midi(" "$PY_FILE" 2>/dev/null && fail "Legacy receive_midi handler found" || pass "Legacy receive_midi handler is absent"
grep -Fq "self.log_message(" "$PY_FILE" 2>/dev/null && fail "Unsafe self.log_message call found" || pass "No unsafe self.log_message call"
find "$SCRIPT_DIR" -type d -name "__pycache__" -print -quit 2>/dev/null | grep -q . && warn "__pycache__ found — remove it before restarting Live" || pass "No __pycache__ folder"
printf "\\n"
[ "$FAILURES" -eq 0 ] && printf "✅ Installation looks ready. Restart Ableton now.\\n" || printf "❌ %s check(s) failed.\\n" "$FAILURES"
printf "\\nPress Return to close..."
read -r
exit "$FAILURES"
`
}

export function generateAbletonDeviceTroubleshooting({ scriptSlug, scriptDisplayName, deviceName }) {
  return `# Troubleshooting — ${deviceName}

Control Surface: **${scriptDisplayName}** (safe folder: \`${scriptSlug}\`)

## Device not found

- Verify that **${deviceName}** exists in the current Live Set.
- Select the track containing the device before moving a control; selected track is searched first.
- Check whether the device was renamed. The script also tries its catalog class name.
- Inspect the \`device not found\` aliases in Log.txt.

## Parameter not found

- Verify the parameter name in \`profile.json\`.
- Read the \`available parameters\` line in Log.txt.
- Try another recommended parameter from the catalog.
- Enable index fallback only in Advanced and only when name matching cannot work.

## Wrong parameter moves

- Keep index fallback disabled and use name matching first.
- Delete old \`${scriptSlug}*\` folders and \`__pycache__\`.
- Check the startup \`BUILD_ID\` to confirm which script Live loaded.

## Nothing moves

- Select **${scriptSlug}** as Control Surface and the controller as MIDI Input.
- Set Output to **None** and restart Ableton after replacing the script.
- Confirm that the target device exists in the Set.
- Run \`INSTALL_CHECK.command\` and inspect Log.txt.
`
}

export function generateAbletonDeviceReadMeFirst({ scriptSlug, scriptDisplayName, deviceName, inputName = 'your MIDI controller', mappingWarnings = [] }) {
  const warningSection = mappingWarnings.length
    ? `\n## Layout warnings\n\n${mappingWarnings.map((warning) => `- ${warning.message}`).join('\n')}\n`
    : '\n## Layout health\n\nNo mapping conflicts were detected when this pack was exported.\n'
  return `# Read me first

This pack controls a native Ableton Live device. No Max for Live target is required.

1. Quit Ableton Live.
2. Copy only \`1_COPY_THIS_FOLDER_TO_REMOTE_SCRIPTS/${scriptSlug}/\` into \`~/Music/Ableton/User Library/Remote Scripts/\`.
3. If a folder with the same name already exists in Remote Scripts, remove it before installing this new version. Also remove any \`__pycache__\`.
4. Restart Live.
5. In Settings → Link, Tempo & MIDI, select **${scriptSlug}** as Control Surface.
6. Select **${inputName}** as Input and **None** as Output.
7. Load **${deviceName}** in the Live Set. Selecting its track makes discovery faster.
8. Move a mapped MIDI control and check Log.txt if nothing responds.

Parameter names are matched first. Index fallback is disabled by default because device parameter order can change.

- Requested script name: **${scriptDisplayName}**
- Ableton-safe Control Surface name: **${scriptSlug}**
${warningSection}
`
}

export function buildAbletonDeviceMapperPack({ device, mappings, inputName, scriptDisplayName, layoutStack = [], controlPool = [], customLayouts = [], mappingWarnings = [] }) {
  const files = generateAbletonDeviceRemoteScriptFiles({ device, mappings, scriptDisplayName, controllerName: inputName, layoutStack, controlPool, customLayouts, mappingWarnings })
  const zip = new JSZip()
  const root = zip.folder('Ableton_Device_Mapper_Pack')
  const scriptFolder = root.folder(`1_COPY_THIS_FOLDER_TO_REMOTE_SCRIPTS/${files.scriptSlug}`)
  scriptFolder.file('__init__.py', files['__init__.py'])
  scriptFolder.file(`${files.scriptSlug}.py`, files[`${files.scriptSlug}.py`])
  scriptFolder.file('profile.json', files['profile.json'])
  root.file('2_READ_ME_FIRST.md', generateAbletonDeviceReadMeFirst({ scriptSlug: files.scriptSlug, scriptDisplayName: files.scriptDisplayName, deviceName: device.deviceName, inputName, mappingWarnings }))
  root.file('INSTALL_CHECK.command', generateAbletonDeviceInstallCheck(files.scriptSlug), { unixPermissions: 0o755 })
  root.file('TROUBLESHOOTING.md', generateAbletonDeviceTroubleshooting({ scriptSlug: files.scriptSlug, scriptDisplayName: files.scriptDisplayName, deviceName: device.deviceName }))
  return { zip, scriptSlug: files.scriptSlug, scriptDisplayName: files.scriptDisplayName, pythonClassName: files.pythonClassName, files }
}

export function createAbletonDeviceTerminalCommands(scriptSlug) {
  const directory = `$HOME/Music/Ableton/User Library/Remote Scripts/${scriptSlug}`
  return [
    ['Remove old script', `rm -rf "${directory}"`],
    ['Clear Python cache', `find "${directory}" \\\n+-name "__pycache__" -type d -prune -exec rm -rf {} +`],
    ['Read useful Live logs', `grep -R "Ableton Device Mapper\\|BUILD_ID\\|device not found\\|target device found\\|parameter found\\|parameter missing\\|available parameters\\|parameter updated" \\\n+"$HOME/Library/Preferences/Ableton/Live 12.4.5b6/Log.txt" | tail -n 180`],
  ]
}
