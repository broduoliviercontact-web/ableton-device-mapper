# Ableton installation

## 1. Export and unzip

Build at least one mapping, choose a descriptive Script name, download the ZIP, and unzip `Ableton_Device_Mapper_Pack`. Do not copy the whole pack into Ableton.

The readable name is converted to an Ableton-safe folder and Python filename. For example, `Operator NanoKontrol Remote` becomes `Operator_NanoKontrol_Remote`. This safe name is the generated Control Surface entry.

## 2. Copy the Remote Script

Quit Ableton Live. Copy only:

```text
1_COPY_THIS_FOLDER_TO_REMOTE_SCRIPTS/<scriptSlug>/
```

to:

```text
~/Music/Ableton/User Library/Remote Scripts/
```

The installed folder must directly contain `__init__.py`, `<scriptSlug>.py`, and `profile.json`. If a folder with the same name already exists, remove it before installing the new version. Remove any `__pycache__` as well.

## 3. Configure Live

Restart Live, then open **Settings → Link, Tempo & MIDI**:

| Setting | Value |
| --- | --- |
| Control Surface | Generated `<scriptSlug>` |
| Input | Your controller's MIDI input |
| Output | `None` |

## 4. Load the native device

Add the configured native device to the Set. Selecting its track makes discovery deterministic. No Max for Live patch is needed.

Move a mapped control. If nothing responds, run `INSTALL_CHECK.command` and follow [Troubleshooting](TROUBLESHOOTING.md).
