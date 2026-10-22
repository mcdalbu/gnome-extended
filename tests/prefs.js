// Run under the isolated headless display; see headless.py.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
const root = ARGV[0];
const {default: Preferences} = await import(`file://${root}/prefs.js`);
const [, data] = GLib.file_get_contents(`${root}/metadata.json`);
const metadata = JSON.parse(new TextDecoder().decode(data));
metadata.path = root;
metadata.dir = Gio.File.new_for_path(root);

Adw.init();
const prefs = new Preferences(metadata);
const window = new Adw.PreferencesWindow();
prefs.fillPreferencesWindow(window);
const settings = prefs.getSettings();
const spins = [];
const switches = [];
let reset;
function visit(widget) {
    if (widget instanceof Adw.SpinRow)
        spins.push(widget);
    if (widget instanceof Adw.SwitchRow)
        switches.push(widget);
    if (widget instanceof Gtk.Button && widget.get_label() === 'Restaurar')
        reset = widget;
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        visit(child);
}
visit(window);
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
assert(spins.length === 4 && switches.length === 2, 'All controls exist');
const keys = ['blur-radius', 'opacity', 'brightness', 'corner-radius'];
for (const [index, key] of keys.entries()) {
    const row = spins[index];
    assert(row.value === settings.get_int(key), `${key}: default binding`);
    row.value = 42;
    assert(settings.get_int(key) === 42, `${key}: UI writes settings`);
    settings.set_int(key, 64);
    assert(row.value === 64, `${key}: settings update UI`);
}
switches[0].active = false;
assert(!settings.get_boolean('notifications'), 'Notification switch binding');
reset.emit('clicked');
assert(settings.get_int('opacity') === 55 && settings.get_boolean('notifications'), 'Reset defaults');
window.destroy();
print('Preferences: controls, defaults, bidirectional bindings and reset passed');
