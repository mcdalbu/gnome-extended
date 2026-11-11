"""Check extension identity, schema defaults and distributable inputs."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
metadata = json.loads((root / 'metadata.json').read_text())
assert metadata['uuid'] == 'gnome-extended@local'
assert metadata['name'] == 'Gnome Extended'
schema = ET.parse(root / 'schemas' / f"{metadata['settings-schema']}.gschema.xml").getroot()[0]
assert schema.attrib['id'] == metadata['settings-schema']
assert schema.attrib['path'] == '/org/gnome/shell/extensions/gnome-shell-soft/'
keys = {key.attrib['name']: key for key in schema}
assert set(keys) == {'windows-settings-sidebar', 'windows-ptyxis', 'windows-app-menus', 'windows-nautilus-sidebar', 'windows-blur', 'docks', 'dock-transparent-in-overview', 'blur-rate', 'notifications', 'quick-settings', 'blur-radius', 'opacity', 'brightness', 'system-dialogs', 'notification-banners', 'app-folders', 'top-panel', 'window-switcher', 'osd-windows', 'workspace-switcher', 'screenshot-ui', 'popup-menus', 'overview-background', 'lock-screen', 'panel-opaque-dark', 'panel-opaque-light', 'panel-enabled-dark', 'panel-enabled-light'}
assert keys["dock-transparent-in-overview"].findtext("default") == "true"
for key in ['windows-blur']:
    assert keys[key].findtext('default') == 'false'
for module in ['backdropCapture.js', 'windowSurfaces.js', 'windowDamage.js']:
    assert module in (root / 'Makefile').read_text()
for key in keys.values():
    bounds = key.find('range')
    if bounds is not None:
        assert int(bounds.attrib['min']) <= int(key.findtext('default')) <= int(bounds.attrib['max'])
for filename in ['settingsLauncher.js', 'ptyxisOpacity.js', 'roundedClip.js', 'sidebarStyle.js', 'windowSurfaces.js', 'windowDamage.js', 'extension.js', 'frameSignals.js', 'appGrid.js', 'shadowSettings.js', 'dockSurfaces.js', 'prefs.js', 'softSurface.js', 'shellSurfaces.js', 'shellBackgrounds.js', 'panelOpacity.js', 'signals.js', 'blurBackend.js',
                 'blurRedrawGuard.js', 'COPYING', 'README.md']:
    assert (root / filename).is_file(), filename
print('Package identity, schema ranges and required files: OK')

grid = ET.parse(root / "schemas/org.gnome.shell.extensions.app-grid-extended.gschema.xml").getroot()[0]
assert grid.attrib["path"] == "/org/gnome/shell/extensions/app-grid-soft/"
assert len(grid.findall("key")) == 8
