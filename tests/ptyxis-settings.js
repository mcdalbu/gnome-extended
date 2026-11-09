// Uses memory GSettings and a private config directory; optional Ptyxis schema.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {PtyxisOpacity, syncPtyxisOpacity} from '../ptyxisOpacity.js';
const source = Gio.SettingsSchemaSource.get_default();
if (!source.lookup('org.gnome.Ptyxis.Profile', true)) {
    print('Ptyxis profile integration: SKIP (optional schema absent)');
} else {
    function assert(value, message) { if (!value) throw new Error(message); }
    const settings = new Gio.Settings({schema_id:'org.gnome.shell.extensions.gnome-extended'});
    const root = new Gio.Settings({schema_id:'org.gnome.Ptyxis'});
    const ids = ['a','b','c'].map(c=>c.repeat(32));
    const profiles = ids.map(id=>new Gio.Settings({schema_id:'org.gnome.Ptyxis.Profile',path:`/org/gnome/Ptyxis/Profiles/${id}/`}));
    root.set_strv('profile-uuids',ids.slice(0,2));
    root.set_string('default-profile-uuid',ids[0]);
    profiles[0].set_double('opacity',.83);
    settings.set_int('opacity',55);
    settings.set_boolean('windows-ptyxis',true);
    let manager = new PtyxisOpacity(settings);
    manager.start();
    assert(profiles.slice(0,2).every(p=>p.get_double('opacity')===.55),'Apply all existing profiles');
    root.set_strv('profile-uuids',ids);
    assert(profiles[2].get_double('opacity')===.55,'New profiles follow while enabled');
    settings.set_int('opacity',72);
    manager.sync();
    assert(profiles.every(p=>p.get_double('opacity')===.72),'General opacity updates all profiles');
    manager.destroy();
    manager = new PtyxisOpacity(settings);
    manager.start();
    profiles[2].set_double('opacity',.31);
    settings.set_boolean('windows-ptyxis',false);
    manager.sync();
    assert(profiles[0].get_double('opacity')===.83,'Original value survives restart');
    assert(profiles[1].get_user_value('opacity')===null,'Unset default is restored');
    assert(profiles[2].get_double('opacity')===.31,'External manual edit is preserved');
    manager.destroy();
    const file = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_config_dir(),'gnome-extended','ptyxis-opacity.json']));
    file.replace_contents('{broken backup',null,false,Gio.FileCreateFlags.NONE,null);
    settings.set_boolean('windows-ptyxis',true);
    let rejected=false;
    try { syncPtyxisOpacity(settings); } catch { rejected=true; }
    assert(rejected && profiles[0].get_double('opacity')===.83,'Corrupt backup never changes profiles');
    print('Ptyxis profiles, shared opacity, new profiles, restart, restoration and manual edits: PASS');
}
