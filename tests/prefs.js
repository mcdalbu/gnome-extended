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
const icons = prefs.getSettings('org.gnome.shell.extensions.app-grid-extended');
const controls = new Map();
const pages = new Map();
let reset;
let backendLink;
function visit(widget) {
    if (widget.name?.startsWith('setting-')) controls.set(widget.name.slice(8), widget);
    if (widget instanceof Adw.PreferencesPage) pages.set(widget.name, widget);
    if (widget instanceof Gtk.LinkButton) backendLink = widget;
    if (widget instanceof Gtk.Button && widget.label === 'Restaurar') reset = widget;
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) visit(child);
}
visit(window);
function assert(value, message) { if (!value) throw new Error(message); }
for (const name of ['elements', 'windows', 'dock', 'panel', 'blur', 'icons']) assert(pages.has(name), `Page ${name}`);
for (const [source, key] of [
    ...settings.settings_schema.list_keys().map(k => [settings, k]),
    ...icons.settings_schema.list_keys().filter(k => k !== 'icon-shadow-enabled').map(k => [icons, k]),
]) {
    const control = controls.get(key);
    assert(control, `Control ${key}`);
    const type = source.get_value(key).get_type_string();
    if (type === 'b') {
        assert(control.active === source.get_boolean(key), `${key}: defaults`);
        control.active = !control.active;
        assert(control.active === source.get_boolean(key), `${key}: UI write`);
        source.set_boolean(key, !control.active);
        assert(control.active === source.get_boolean(key), `${key}: setting read`);
    } else if (key === 'blur-rate') {
        for (const rate of [1, 2, 0]) {
            control.selected = rate;
            assert(source.get_int(key) === rate, 'Rate writes');
        }
        source.set_int(key, 2);
        assert(control.selected === 2, 'Rate reads');
    } else {
        assert(control.value === source.get_int(key), `${key}: defaults`);
        control.value = 12;
        assert(source.get_int(key) === 12, `${key}: UI write`);
        const readValue = Math.max(8, control.adjustment.lower);
        source.set_int(key, readValue);
        assert(control.value === readValue, `${key}: setting read`);
    }
}
function pageOf(widget) { return widget.get_ancestor(Adw.PreferencesPage)?.name; }
for (const key of ['windows-settings-sidebar', 'windows-ptyxis', 'windows-app-menus', 'windows-nautilus-sidebar', 'windows-blur'])
    assert(pageOf(controls.get(key)) === 'windows', `Windows owns ${key}`);
for (const key of ['docks', 'dock-transparent-in-overview'])
    assert(pageOf(controls.get(key)) === 'dock', `Dock owns ${key}`);
for (const key of ['top-panel', 'panel-extend-bottom', 'panel-enabled-dark', 'panel-enabled-light', 'panel-opaque-dark', 'panel-opaque-light'])
    assert(pageOf(controls.get(key)) === 'panel', `Panel owns ${key}`);
for (const key of ['blur-radius', 'opacity', 'brightness', 'blur-rate'])
    assert(pageOf(controls.get(key)) === 'blur', `Blur owns ${key}`);
assert(backendLink?.uri === 'https://github.com/kancko/gnome-rounded-blur', 'Backend GitHub link');
assert(pageOf(backendLink) === 'blur', 'Backend link on blur page');
reset.emit('clicked');
for (const source of [settings, icons]) {
    for (const key of source.settings_schema.list_keys())
        assert(source.get_value(key).equal(source.get_default_value(key)), `${key}: reset`);
}
const captureDir = GLib.getenv('SOFT_PREFS_CAPTURE');
if (captureDir) {
    window.set_default_size(950, 760);
    window.present();
    const loop = new GLib.MainLoop(null, false);
    let current = '';
    GLib.timeout_add(0, 80, () => {
        const [ok, data] = GLib.file_get_contents(`${captureDir}/command`);
        if (!ok) return true;
        const name = new TextDecoder().decode(data).trim();
        if (name === 'done') { loop.quit(); return false; }
        if (name === current) return true;
        current = name;
        window.set_visible_page_name(name);
        GLib.timeout_add(0, 400, () => {
            GLib.file_set_contents(`${captureDir}/ready`, name);
            return false;
        });
        return true;
    });
    GLib.timeout_add_seconds(0, 20, () => { loop.quit(); return false; });
    loop.run();
}
window.destroy();
print('Preferences: six pages, control placement, all bindings, reset and backend GitHub link passed');
