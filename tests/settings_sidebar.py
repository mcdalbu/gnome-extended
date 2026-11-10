"""Real Settings app in the private GNOME session."""
import os
import signal
from pathlib import Path
import subprocess
import time


def test_settings_sidebar(evaluate, check, screenshot, results):
    config=Path(os.environ['XDG_CONFIG_HOME'])/'gtk-4.0'
    config.mkdir(parents=True,exist_ok=True)
    original='/* personal test rules */\n'
    (config/'gtk.css').write_text(original)
    evaluate('''globalThis.sharedBeforeSettings=Object.fromEntries(['opacity','blur-radius','brightness'].map(k=>[k,soft._settings.get_int(k)]));
        soft._settings.set_int('opacity',45);
        soft._settings.set_boolean('windows-settings-sidebar',true);
        soft._settings.set_boolean('windows-blur',true);''')
    service=Path(os.environ['XDG_DATA_HOME'])/'dbus-1/services/org.gnome.Settings.service'
    assert service.exists(),'Scoped Settings launcher must be installed'
    from gi.repository import Gio, GLib
    bus=Gio.bus_get_sync(Gio.BusType.SESSION,None)
    env={'XDG_CURRENT_DESKTOP':'GNOME','ADW_DISABLE_PORTAL':'1','ADW_DEBUG_COLOR_SCHEME':'prefer-light' if os.environ.get('SOFT_TEST_LIGHT') else 'prefer-dark'}
    bus.call_sync('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','UpdateActivationEnvironment',GLib.Variant('(a{ss})',(env,)),None,Gio.DBusCallFlags.NONE,5000,None)
    bus.call_sync('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','StartServiceByName',GLib.Variant('(su)',('org.gnome.Settings',0)),None,Gio.DBusCallFlags.NONE,10000,None)
    pid=bus.call_sync('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','GetConnectionUnixProcessID',GLib.Variant('(s)',('org.gnome.Settings',)),None,Gio.DBusCallFlags.NONE,5000,None).unpack()[0]
    subprocess.run(['gnome-control-center','multitasking'],env=dict(os.environ,**env),stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=10,check=True)
    try:
        for _ in range(100):
            if evaluate('global.get_window_actors().some(a=>a.meta_window.get_gtk_application_id()==="org.gnome.Settings")'):
                break
            time.sleep(.1)
        else:
            raise AssertionError('Settings app did not open')
        time.sleep(1)
        evaluate('''globalThis.settingsActor=global.get_window_actors().find(a=>a.meta_window.get_gtk_application_id()==='org.gnome.Settings');
            Main.overview.hide();settingsActor.meta_window.move_resize_frame(false,120,100,1120,820);
            testBackdrop.get_parent().remove_child(testBackdrop);global.window_group.insert_child_below(testBackdrop,settingsActor);
            soft._windowSurfaces.sync();''')
        time.sleep(.5)
        first=screenshot('settings-sidebar')
        check('settings-actor-opaque','settingsActor.opacity===255')
        rect=evaluate('(()=>{const r=settingsActor.meta_window.get_frame_rect();return [r.x,r.y,r.width,r.height]})()')
        evaluate('soft._settings.set_boolean("windows-blur",false)')
        time.sleep(.2)
        corner_reference=screenshot('settings-corner-reference')
        a,b=first.get_pixels(),corner_reference.get_pixels();stride,channels=first.get_rowstride(),first.get_n_channels()
        errors=[]
        for x,y in [(rect[0]+1,rect[1]+1),(rect[0]+rect[2]-2,rect[1]+1),(rect[0]+1,rect[1]+rect[3]-2),(rect[0]+rect[2]-2,rect[1]+rect[3]-2)]:
            errors.append(max(abs(a[y*stride+x*channels+c]-b[y*stride+x*channels+c]) for c in range(3)))
        results['settings-corner-pixel-errors']=errors
        assert max(errors)<=1,'Blur must remain inside rounded Settings corners'
        evaluate('soft._settings.set_boolean("windows-blur",true);soft._settings.set_int("opacity",71)')
        assert (config/'gtk.css').read_text().count('71%')==2,'Settings must follow the general opacity'
        evaluate('soft._settings.set_int("opacity",45)')
        time.sleep(.2)
        evaluate('testBackdrop.hide()')
        time.sleep(.3)
        second=screenshot('settings-sidebar-wallpaper')
        rect=evaluate('(()=>{const r=settingsActor.meta_window.get_frame_rect();return [r.x,r.y,r.width,r.height]})()')
        a,b=first.get_pixels(),second.get_pixels();stride,channels=first.get_rowstride(),first.get_n_channels()
        def difference(x,y):
            return sum(abs(a[yy*stride+xx*channels+c]-b[yy*stride+xx*channels+c]) for yy in range(y,y+10) for xx in range(x,x+10) for c in range(3))/300
        sidebar=difference(rect[0]+20,rect[1]+rect[3]-35)
        content=difference(rect[0]+rect[2]-30,rect[1]+rect[3]-35)
        results['settings-sidebar-pixels']={'sidebarChange':sidebar,'contentChange':content}
        assert sidebar>5,'Settings sidebar must reveal the scene'
        assert content<1,'Settings content must remain opaque'
    finally:
        try: os.kill(pid,signal.SIGTERM)
        except ProcessLookupError: pass
        evaluate('''testBackdrop.show();testBackdrop.get_parent().remove_child(testBackdrop);Main.uiGroup.insert_child_above(testBackdrop,global.window_group);
            soft._settings.set_boolean('windows-settings-sidebar',false);soft._settings.set_boolean('windows-blur',false);
            for(const [key,value] of Object.entries(sharedBeforeSettings))soft._settings.set_int(key,value);''')
        assert (config/'gtk.css').read_text().strip()==original.strip()
        assert not service.exists(),'Disable must remove the generated launcher'
        custom='[D-BUS Service]\nName=org.gnome.Settings\nExec=/usr/bin/env GE_SETTINGS_TEST=1 /usr/bin/gnome-control-center --gapplication-service\n# custom launcher preserved\n'
        service.write_text(custom)
        evaluate('soft._settings.set_boolean("windows-settings-sidebar",true)')
        assert 'GE_SETTINGS_TEST=1' in service.read_text(),'Custom launcher command must be preserved while enabled'
        evaluate('soft._settings.set_boolean("windows-settings-sidebar",false)')
        assert service.read_text()==custom,'Existing launcher must be restored byte for byte'
        evaluate('soft._settings.set_boolean("windows-settings-sidebar",true)')
        edited=service.read_text()+'# manual change\n'
        service.write_text(edited)
        evaluate('soft._settings.set_boolean("windows-settings-sidebar",false)')
        assert service.read_text()==edited,'Manual launcher changes must be preserved'
        service.unlink()
        time.sleep(.8)
        results['settings-launcher-restoration']=True
