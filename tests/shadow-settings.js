import Gio from 'gi://Gio';
import {migrateShadowSettings} from '../shadowSettings.js';
const settings = new Gio.Settings({schema_id: 'org.gnome.shell.extensions.app-grid-extended'});
const grid = 'icon-shadow-grid-enabled';
const dock = 'icon-shadow-dock-enabled';
const switcher = 'icon-shadow-switcher-enabled';
function reset() { for (const key of settings.settings_schema.list_keys()) settings.reset(key); }
function assert(value, message) { if (!value) throw new Error(message); }
reset();
migrateShadowSettings(settings);
assert(settings.get_boolean(grid) && settings.get_boolean(dock) && settings.get_boolean(switcher), 'New defaults');
settings.set_boolean('icon-shadow-enabled', false);
migrateShadowSettings(settings);
assert(!settings.get_boolean(grid) && !settings.get_boolean(dock) && !settings.get_boolean(switcher), 'Disabled legacy switch migrates');
settings.set_boolean(grid, true);
settings.set_boolean(switcher, true);
migrateShadowSettings(settings);
assert(settings.get_boolean(grid) && !settings.get_boolean(dock) && settings.get_boolean(switcher), 'Explicit independent choice survives migration');
reset();
settings.set_boolean(dock, false);
migrateShadowSettings(settings);
assert(settings.get_boolean(grid) && !settings.get_boolean(dock), 'No legacy value overwrites a choice');
print('Independent shadow settings and legacy migration: PASS');
