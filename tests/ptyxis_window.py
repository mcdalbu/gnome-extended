"""Ptyxis integration in the isolated compositor; never touches live terminals."""
import os
from pathlib import Path
import subprocess
import time


def test_ptyxis(evaluate, check, screenshot, results):
    from gi.repository import Gio
    profile_uuid = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    root = Gio.Settings.new('org.gnome.Ptyxis')
    root.set_strv('profile-uuids', [profile_uuid])
    root.set_string('default-profile-uuid', profile_uuid)
    profile = Gio.Settings.new_with_path('org.gnome.Ptyxis.Profile', '/org/gnome/Ptyxis/Profiles/'+profile_uuid+'/')
    profile.set_double('opacity', .82)
    Gio.Settings.sync()
    evaluate('''globalThis.sharedBeforePtyxis=Object.fromEntries(['opacity','blur-radius','brightness'].map(k=>[k,soft._settings.get_int(k)]));
        soft._settings.set_int('opacity',45);
        soft._settings.set_int('blur-radius',42);
        soft._settings.set_int('brightness',70);
        soft._settings.set_boolean('windows-blur',false);
        soft._settings.set_boolean('windows-ptyxis',true);''')
    check('ptyxis-profile-opacity', 'new imports.gi.Gio.Settings({schema_id:"org.gnome.Ptyxis.Profile",path:"/org/gnome/Ptyxis/Profiles/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"}).get_double("opacity")===.45')
    # Scope management is not present on the private test bus. Bypass only
    # systemd-run in this child environment; the real Ptyxis/VTE still execute
    # the test command and render their normal UI.
    bin_dir=Path(os.environ['XDG_CACHE_HOME'])/'ptyxis-test-bin'
    bin_dir.mkdir(parents=True,exist_ok=True)
    shim=bin_dir/'systemd-run'
    shim.write_text('#!/usr/bin/python3\nimport os,sys\nargs=sys.argv[1:]\ni=args.index("--")\nos.execvp(args[i+1],args[i+1:])\n')
    shim.chmod(0o755)
    client = subprocess.Popen(['ptyxis','--standalone','--title','GNOME Extended Ptyxis test','--',
                               '/usr/bin/bash','--noprofile','--norc','-c',
                               "printf 'GNOME Extended — terminal test\\nText stays opaque\\n'; read -r test_line"],
                              env=dict(os.environ,ADW_DEBUG_COLOR_SCHEME='prefer-light' if os.environ.get('SOFT_TEST_LIGHT') else 'prefer-dark',ADW_DISABLE_PORTAL='1',PATH=str(bin_dir)+':'+os.environ['PATH']),
                              stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            if evaluate('global.get_window_actors().some(a=>a.meta_window.get_wm_class()?.includes("Ptyxis"))'):
                break
            time.sleep(.1)
        else:
            raise AssertionError('Ptyxis window did not open')
        time.sleep(.8)
        evaluate('''globalThis.ptyxisActor=global.get_window_actors().find(a=>a.meta_window.get_wm_class()?.includes('Ptyxis'));
            Main.overview.hide();
            ptyxisActor.meta_window.move_resize_frame(false,140,150,1000,640);
            testBackdrop.get_parent().remove_child(testBackdrop);
            global.window_group.insert_child_below(testBackdrop,ptyxisActor);
            soft._windowSurfaces.sync();''')
        time.sleep(.6)
        results['ptyxis-window-info']=evaluate('({app:ptyxisActor.meta_window.get_gtk_application_id(),wmclass:ptyxisActor.meta_window.get_wm_class(),frame:(()=>{const r=ptyxisActor.meta_window.get_frame_rect();return [r.x,r.y,r.width,r.height]})()})')
        first=screenshot('ptyxis-terminal')
        check('ptyxis-titlebar-and-text-opaque', 'ptyxisActor.opacity===255')
        check('ptyxis-has-independent-blur', 'soft._windowSurfaces._windows.get(ptyxisActor)?.blur?.visible && !soft._settings.get_boolean("windows-blur")')
        evaluate('testBackdrop.hide()')
        time.sleep(.3)
        second=screenshot('ptyxis-wallpaper')
        rect=results['ptyxis-window-info']['frame']
        a,b=first.get_pixels(),second.get_pixels()
        stride,channels=first.get_rowstride(),first.get_n_channels()
        def difference(x,y):
            return sum(abs(a[yy*stride+xx*channels+c]-b[yy*stride+xx*channels+c])
                       for yy in range(y,y+10) for xx in range(x,x+10) for c in range(3))/300
        terminal_delta=difference(rect[0]+rect[2]-90,rect[1]+rect[3]-90)
        title_delta=difference(rect[0]+180,rect[1]+18)
        results['ptyxis-pixels']={'terminalChange':terminal_delta,'titlebarChange':title_delta}
        assert terminal_delta>5, 'Terminal background must reveal the scene'
        assert title_delta<1, 'Titlebar must remain opaque'
        evaluate('testBackdrop.show();soft._settings.set_int("opacity",72)')
        check('ptyxis-shares-general-opacity', 'new imports.gi.Gio.Settings({schema_id:"org.gnome.Ptyxis.Profile",path:"/org/gnome/Ptyxis/Profiles/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"}).get_double("opacity")===.72')
        evaluate('soft._settings.set_boolean("windows-ptyxis",false)')
        check('ptyxis-restores-previous-opacity', 'new imports.gi.Gio.Settings({schema_id:"org.gnome.Ptyxis.Profile",path:"/org/gnome/Ptyxis/Profiles/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"}).get_double("opacity")===.82')
        check('ptyxis-disables-backdrop', '!soft._windowSurfaces._windows.size')
    finally:
        client.terminate()
        try: client.wait(timeout=5)
        except subprocess.TimeoutExpired:
            client.kill(); client.wait()
        evaluate('testBackdrop.show();testBackdrop.get_parent().remove_child(testBackdrop);Main.uiGroup.insert_child_above(testBackdrop,global.window_group);soft._settings.set_boolean("windows-blur",false);soft._settings.set_boolean("windows-ptyxis",false);for(const [key,value] of Object.entries(sharedBeforePtyxis))soft._settings.set_int(key,value)')
