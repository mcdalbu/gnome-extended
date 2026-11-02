"""Check extension identity, schema defaults and distributable inputs."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
metadata = json.loads((root / 'metadata.json').read_text())
assert metadata['uuid'] == 'gnome-shell-soft@local'
assert metadata['name'] == 'Gnome Shell Soft'
schema = ET.parse(root / 'schemas' / f"{metadata['settings-schema']}.gschema.xml").getroot()[0]
assert schema.attrib['id'] == metadata['settings-schema']
assert schema.attrib['path'] == '/org/gnome/shell/extensions/gnome-shell-soft/'
keys = {key.attrib['name']: key for key in schema}
assert set(keys) == {'notifications', 'quick-settings', 'blur-radius', 'opacity', 'brightness', 'system-dialogs', 'notification-banners', 'app-folders', 'top-panel', 'window-switcher', 'osd-windows', 'workspace-switcher', 'screenshot-ui', 'popup-menus', 'overview-background', 'lock-screen', 'panel-opaque-dark', 'panel-opaque-light', 'panel-enabled-dark', 'panel-enabled-light'}
for key in keys.values():
    bounds = key.find('range')
    if bounds is not None:
        assert int(bounds.attrib['min']) <= int(key.findtext('default')) <= int(bounds.attrib['max'])
for filename in ['extension.js', 'prefs.js', 'softSurface.js', 'shellSurfaces.js', 'shellBackgrounds.js', 'panelOpacity.js', 'signals.js', 'blurBackend.js',
                 'blurRedrawGuard.js', 'COPYING', 'README.md']:
    assert (root / filename).is_file(), filename
print('Package identity, schema ranges and required files: OK')
