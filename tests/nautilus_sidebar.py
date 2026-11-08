"""Real Nautilus rendering in the private Wayland session."""
import os
from pathlib import Path
import subprocess
import time


def test_sidebar(evaluate, check, screenshot, results):
    config = Path(os.environ['XDG_CONFIG_HOME']) / 'gtk-4.0'
    config.mkdir(parents=True, exist_ok=True)
    original = '/* Test personal rules: preserve this exactly. */\n'
    (config / 'gtk.css').write_text(original)
    evaluate("globalThis.sharedBeforeSidebar = Object.fromEntries(['opacity','blur-radius','brightness'].map(k=>[k,soft._settings.get_int(k)]))")
    evaluate('''soft._settings.set_int('opacity',45);
        soft._settings.set_int('blur-radius',42);
        soft._settings.set_int('brightness',70);
        soft._settings.set_boolean('windows-nautilus-sidebar',true);
        soft._settings.set_boolean('windows-app-menus',true);
        soft._settings.set_boolean('windows-blur',true);''')
    assert (config / 'gtk.css').read_text().startswith(original)
    subprocess.run(['gsettings', 'set', 'org.gnome.desktop.interface', 'color-scheme', 'prefer-dark'], check=True)
    client = subprocess.Popen(['nautilus', '--new-window', '/tmp'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                              env=dict(os.environ, ADW_DISABLE_PORTAL='1', ADW_DEBUG_COLOR_SCHEME='prefer-light' if os.environ.get('SOFT_TEST_LIGHT') else 'prefer-dark'))
    try:
        for _ in range(100):
            if evaluate('global.get_window_actors().some(a=>a.meta_window.get_gtk_application_id()==="org.gnome.Nautilus")'):
                break
            time.sleep(.1)
        else:
            raise AssertionError('Nautilus window did not open')
        time.sleep(1)
        evaluate('''globalThis.nautilusActor=global.get_window_actors().find(a=>a.meta_window.get_gtk_application_id()==='org.gnome.Nautilus');
            nautilusActor.meta_window.move_resize_frame(false,120,120,1050,720);
            testBackdrop.get_parent().remove_child(testBackdrop);
            global.window_group.insert_child_below(testBackdrop,nautilusActor);''')
        time.sleep(.6)
        evaluate('''globalThis.menuPointer=global.stage.get_context().get_backend().get_default_seat().create_virtual_device(imports.gi.Clutter.InputDeviceType.POINTER_DEVICE);
            menuPointer.notify_absolute_motion(imports.gi.GLib.get_monotonic_time(),1100,790);''')
        time.sleep(.2)
        evaluate('Main.overview.hide(); nautilusActor.meta_window.activate(global.get_current_time()); menuPointer.notify_absolute_motion(imports.gi.GLib.get_monotonic_time(),1100,790)')
        time.sleep(.6)
        evaluate('menuPointer.notify_button(imports.gi.GLib.get_monotonic_time(),3,imports.gi.Clutter.ButtonState.PRESSED)')
        evaluate('menuPointer.notify_button(imports.gi.GLib.get_monotonic_time(),3,imports.gi.Clutter.ButtonState.RELEASED)')
        time.sleep(.6)
        results['menu-pointer'] = evaluate('({pointer:global.get_pointer(),overview:Main.overview.visible})')
        results['menu-actors'] = evaluate('global.get_window_actors().map(a=>({title:a.meta_window.get_title(),type:a.meta_window.get_window_type(),parent:a.get_parent()?.toString(),rect:[a.x,a.y,a.width,a.height],tracked:soft._windowSurfaces._windows.get(a)?.menu,blur:soft._windowSurfaces._windows.get(a)?.blur?.visible}))')
        check('gtk-menu-has-blur', '[...soft._windowSurfaces._windows.values()].some(s=>s.menu && s.actor.opacity===255 && s.blur?.visible)')
        evaluate('global.window_group.set_child_below_sibling(testBackdrop,nautilusActor); soft._windowSurfaces._update()')
        time.sleep(.2)
        check('shared-blur-parameters', '[...soft._windowSurfaces._windows.values()].filter(s=>s.blur?.visible).every(s=>Math.abs(s.effect.brightness-.7)<.001 && (s.effect.radius===42 || s.effect.sigma===21))')
        check('rounded-menu-backdrop', '[...soft._windowSurfaces._windows.values()].filter(s=>s.menu).every(s=>s.cornerRadius===12 && (s.clip?.radius===12 || s.effect.corner_radius===12))')
        menu_image = screenshot('nautilus-context-menu')
        menu_rect = evaluate('(()=>{const s=[...soft._windowSurfaces._windows.values()].find(s=>s.menu && s.blur?.visible); const r=s.window.get_frame_rect();return [r.x,r.y,r.width,r.height]})()')
        evaluate('soft._settings.set_boolean("windows-app-menus",false)')
        time.sleep(.2)
        menu_reference = screenshot('menu-corner-reference')
        a,b=menu_image.get_pixels(),menu_reference.get_pixels()
        stride,channels=menu_image.get_rowstride(),menu_image.get_n_channels()
        errors=[]
        for x,y in [(menu_rect[0]+1,menu_rect[1]+1), (menu_rect[0]+menu_rect[2]-2,menu_rect[1]+1),
                    (menu_rect[0]+1,menu_rect[1]+menu_rect[3]-2), (menu_rect[0]+menu_rect[2]-2,menu_rect[1]+menu_rect[3]-2)]:
            errors.append(max(abs(a[y*stride+x*channels+c]-b[y*stride+x*channels+c]) for c in range(3)))
        results['menu-corner-pixel-errors']=errors
        assert max(errors)<=1, 'Blur must never paint outside rounded menu corners'
        evaluate('soft._settings.set_boolean("windows-app-menus",true)')
        css=(config/'gtk.css').read_text()
        assert css.count('45%')==3, 'Sidebar, backdrop sidebar and menu must share the general opacity'
        evaluate('soft._settings.set_int("opacity",72)')
        assert (config/'gtk.css').read_text().count('72%')==3, 'General opacity must update both managed styles'
        evaluate('soft._settings.set_int("opacity",45)')
        evaluate('menuPointer.notify_absolute_motion(imports.gi.GLib.get_monotonic_time(),1200,900); menuPointer.notify_button(imports.gi.GLib.get_monotonic_time(),1,imports.gi.Clutter.ButtonState.PRESSED)')
        evaluate('menuPointer.notify_button(imports.gi.GLib.get_monotonic_time(),1,imports.gi.Clutter.ButtonState.RELEASED)')
        time.sleep(.4)
        evaluate('global.window_group.set_child_below_sibling(testBackdrop,nautilusActor); soft._windowSurfaces._update()')
        time.sleep(.2)
        for theme in ['light' if os.environ.get('SOFT_TEST_LIGHT') else 'dark']:
            if theme == 'light':
                subprocess.run(['gsettings', 'set', 'org.gnome.desktop.interface', 'color-scheme', 'prefer-light'], check=True)
                time.sleep(.7)
            pattern = screenshot('nautilus-sidebar-' + theme)
            check('nautilus-actor-opaque-' + theme, 'nautilusActor.opacity===255')
            rect = evaluate('(()=>{const r=nautilusActor.meta_window.get_frame_rect(); return [r.x,r.y,r.width,r.height]})()')
            evaluate('soft._settings.set_boolean("windows-blur",false)')
            time.sleep(.2)
            without_blur = screenshot('nautilus-corner-reference-' + theme)
            first, second = pattern.get_pixels(), without_blur.get_pixels()
            stride, channels = pattern.get_rowstride(), pattern.get_n_channels()
            corner_errors = []
            for px,py in [(rect[0]+1,rect[1]+1), (rect[0]+rect[2]-2,rect[1]+1),
                          (rect[0]+1,rect[1]+rect[3]-2), (rect[0]+rect[2]-2,rect[1]+rect[3]-2)]:
                corner_errors.append(max(abs(first[py*stride+px*channels+c]-second[py*stride+px*channels+c]) for c in range(3)))
            results['corner-pixel-errors-'+theme] = corner_errors
            assert max(corner_errors) <= 1, 'Blur must never alter pixels outside rounded window corners'
            evaluate('soft._settings.set_boolean("windows-blur",true)')
            time.sleep(.2)
            evaluate('testBackdrop.hide()')
            time.sleep(.3)
            wallpaper = screenshot('nautilus-sidebar-wallpaper-' + theme)
            rect = evaluate('(()=>{const r=nautilusActor.meta_window.get_frame_rect(); return [r.x,r.y,r.width,r.height]})()')
            def difference(x, y):
                first, second = pattern.get_pixels(), wallpaper.get_pixels()
                stride, channels = pattern.get_rowstride(), pattern.get_n_channels()
                return sum(abs(first[yy*stride+xx*channels+c]-second[yy*stride+xx*channels+c])
                           for yy in range(y,y+12) for xx in range(x,x+12) for c in range(3))/(12*12*3)
            sidebar_delta = difference(rect[0]+25, rect[1]+rect[3]-50)
            content_delta = difference(rect[0]+rect[2]-35, rect[1]+rect[3]-50)
            results['sidebar-pixels-' + theme] = {'sidebarChange':sidebar_delta, 'contentChange':content_delta}
            assert sidebar_delta > 5, 'Sidebar must reveal changes behind the window'
            assert content_delta < 2, 'File content must remain opaque'
            evaluate('testBackdrop.show()')
            time.sleep(.2)
    finally:
        subprocess.run(['nautilus', '--quit'], capture_output=True, timeout=5)
        client.wait(timeout=5)
        evaluate('''testBackdrop.get_parent().remove_child(testBackdrop);
            Main.uiGroup.insert_child_above(testBackdrop,global.window_group);
            soft._settings.set_boolean('windows-blur',false);
            soft._settings.set_boolean('windows-app-menus',false);
            soft._settings.set_boolean('windows-nautilus-sidebar',false);
            for (const [key,value] of Object.entries(sharedBeforeSidebar)) soft._settings.set_int(key,value);''')
        assert (config / 'gtk.css').read_text().strip() == original.strip()
        subprocess.run(['gsettings', 'set', 'org.gnome.desktop.interface', 'color-scheme', 'default'], check=True)
    results['sidebar-style-removal-preserves-user-css'] = True
