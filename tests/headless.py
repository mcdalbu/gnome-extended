#!/usr/bin/python3
"""Integration test in a private D-Bus/Wayland session; never changes the desktop.

Run with /usr/bin/python3 tests/headless.py. Requires GNOME Shell 50, PyGObject
and a usable renderer. The temporary helper enables Eval only on the test bus.
"""
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
UUID = 'gnome-shell-soft@local'


def stage():
    with tempfile.TemporaryDirectory(prefix='gnome-shell-soft-test-', ignore_cleanup_errors=True) as temporary:
        base = Path(temporary)
        extension = base / 'data/gnome-shell/extensions' / UUID
        shutil.copytree(ROOT, extension, ignore=shutil.ignore_patterns('*.zip', '.git', '*@local_v*', 'validation', 'tests'))
        if os.environ.get('SOFT_TEST_NATIVE'):
            backend = extension / 'blurBackend.js'
            backend.write_text(backend.read_text().replace('gi://Blur', 'gi://SoftTestMissingBlur'))
        helper = extension.parent / 'soft-test-helper@local'
        helper.mkdir()
        (helper / 'metadata.json').write_text(json.dumps({
            'uuid': helper.name, 'name': 'Isolated test helper',
            'description': 'Private test session only', 'shell-version': ['50'],
        }))
        (helper / 'extension.js').write_text('''
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
export default class Helper extends Extension {
    enable() { global.context.unsafe_mode = true; }
    disable() { global.context.unsafe_mode = false; }
}
''')
        runtime = base / 'runtime'
        runtime.mkdir(mode=0o700)
        env = dict(os.environ, SOFT_TEST_CHILD='1', XDG_DATA_HOME=str(base / 'data'),
                   XDG_CONFIG_HOME=str(base / 'config'), XDG_CACHE_HOME=str(base / 'cache'),
                   XDG_STATE_HOME=str(base / 'state'), XDG_RUNTIME_DIR=str(runtime))
        env.pop('WAYLAND_DISPLAY', None)
        env.pop('DISPLAY', None)
        try:
            return subprocess.call(['dbus-run-session', '--', '/usr/bin/python3', __file__], env=env)
        finally:
            # GTK can activate the document portal, which creates a FUSE mount
            # in this test's private runtime. Remove only that temporary mount.
            document_mount = runtime / 'doc'
            if os.path.ismount(document_mount):
                unmount = subprocess.run(['fusermount3', '-u', str(document_mount)], capture_output=True)
                # The portal may unmount itself between ismount() and fusermount.
                if unmount.returncode and os.path.ismount(document_mount):
                    unmount.check_returncode()
            time.sleep(0.3)


def test():
    import gi
    gi.require_version('Gio', '2.0')
    gi.require_version('GdkPixbuf', '2.0')
    from gi.repository import Gio, GLib, GdkPixbuf

    shell_settings = Gio.Settings.new('org.gnome.shell')
    shell_settings.set_strv('enabled-extensions', ['soft-test-helper@local', UUID])
    shell_settings.set_boolean('disable-user-extensions', False)
    shell_settings.set_string('welcome-dialog-last-shown-version', '999')
    Gio.Settings.new('org.gnome.desktop.notifications').set_boolean('show-banners', False)
    Gio.Settings.new('org.gnome.desktop.search-providers').set_boolean('disable-external', True)
    Gio.Settings.sync()
    output = ROOT / 'validation'
    output.mkdir(exist_ok=True)
    variant = 'gnome50-native' if os.environ.get('SOFT_TEST_NATIVE') else 'gnome50'
    if os.environ.get('SOFT_TEST_SURFACES'):
        variant += '-surfaces'
    if os.environ.get('SOFT_TEST_REMAINING'):
        variant += '-remaining'
    log = (output / f'{variant}-session.log').open('w')
    shell = subprocess.Popen(['gnome-shell', '--headless', '--wayland', '--no-x11',
                              '--virtual-monitor=1440x1000'], stdout=log, stderr=log)
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)

    def evaluate(code):
        result = bus.call_sync('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell',
                               'Eval', GLib.Variant('(s)', (code,)),
                               GLib.VariantType.new('(bs)'), Gio.DBusCallFlags.NONE, 15000, None)
        ok, value = result.unpack()
        if not ok:
            raise RuntimeError(value or 'Eval is not ready')
        return json.loads(value) if value else None

    results = {}

    def check(name, code):
        value = evaluate(code)
        results[name] = value
        if not value:
            raise AssertionError(name)

    def screenshot(name):
        path = output / f'{variant}-{name}.png'
        evaluate('globalThis.captureDone=false; '
                 f'(async()=>{{const stream=Gio.File.new_for_path({json.dumps(str(path))}).replace(null,false, '
                 'Gio.FileCreateFlags.REPLACE_DESTINATION,null);await new Shell.Screenshot().screenshot(false,stream);'
                 'stream.close(null);globalThis.captureDone=true;})()')
        deadline = time.monotonic() + 5
        while not evaluate('captureDone'):
            if time.monotonic() > deadline:
                raise RuntimeError('Screenshot timed out')
            time.sleep(0.03)
        return GdkPixbuf.Pixbuf.new_from_file(str(path))

    try:
        for _ in range(100):
            if shell.poll() is not None:
                raise RuntimeError('Headless Shell exited; see validation/gnome50-session.log')
            try:
                if evaluate('Main.extensionManager.lookup("gnome-shell-soft@local")?.state === 1'):
                    break
            except Exception:
                pass
            time.sleep(0.2)
        else:
            raise RuntimeError('Extension did not enable; see validation/gnome50-session.log')

        evaluate('globalThis.soft = Main.extensionManager.lookup("gnome-shell-soft@local").stateObj; Main.overview.hide();')
        evaluate('(async () => { globalThis.popupAnimation = '
                 '(await import("resource:///org/gnome/shell/ui/boxpointer.js")).PopupAnimation; })()')
        time.sleep(1)
        evaluate('''(() => {
            const St = imports.gi.St;
            globalThis.testBackdrop = new St.Widget({width:1440, height:1000, reactive:false});
            const colors = ['#9569b8', '#328c9c', '#bc9451', '#496eb0', '#8c597a'];
            for (let x = 0; x < 1440; x += 80)
                testBackdrop.add_child(new St.Widget({x, y:32, width:80, height:968,
                    style:`background-color: ${colors[(x/80)%colors.length]};`}));
            for (let y = 120; y < 1000; y += 180)
                testBackdrop.add_child(new St.Label({x:60, y, text:'Gnome Shell Soft  •  Blur dinâmico',
                    style:'font-size: 38px; font-weight: bold; color: white;'}));
            Main.uiGroup.insert_child_above(testBackdrop, global.window_group);
        })()''')
        if os.environ.get('SOFT_TEST_SURFACES'):
            from shell_surfaces import test_surfaces
            test_surfaces(evaluate, check, screenshot, results)
        if os.environ.get('SOFT_TEST_REMAINING'):
            from remaining_surfaces import test_remaining
            test_remaining(evaluate, check, screenshot, results)
        check('two-surfaces', 'soft._surfaces.size === 2')
        results['backend'] = evaluate('(() => { const s = soft._surfaces.get("quick-settings"); '
                                      'return {type: s._effect.constructor.name, corners: s._hasCorners, '
                                      'radiusProperty: s._radiusProperty}; })()')
        for key in ['notifications', 'quick-settings']:
            evaluate(f'globalThis.surface = soft._surfaces.get("{key}"); '
                     'globalThis.openFrames = []; '
                     'globalThis.openFrameId = global.stage.connect("before-paint", () => { '
                     'if (!surface.menu.isOpen || !surface.menu.box.mapped || '
                     'surface.menu.actor.get_paint_opacity() === 0) return; '
                     'const a=[...surface.menu.box.get_transformed_position(),...surface.menu.box.get_transformed_size()]; '
                     'const b=[...surface._blur.get_transformed_position(),...surface._blur.get_transformed_size()]; '
                     'openFrames.push({mapped:surface._blur.mapped, '
                     'aligned:a.every((v,i)=>Math.abs(v-b[i])<1), opacity:surface._group.opacity}); '
                     '}); surface.menu.open();')
            time.sleep(0.6)
            evaluate('global.stage.disconnect(openFrameId);')
            results[f'{key}-opening-frames'] = evaluate('openFrames')
            assert results[f'{key}-opening-frames'], 'No opening frames observed'
            assert all(frame['mapped'] and frame['aligned']
                       for frame in results[f'{key}-opening-frames']), 'Blur missed an opening frame'
            check(f'{key}-mapped', 'surface._blur.mapped && surface._blur.width > 100 && surface._blur.height > 100')
            check(f'{key}-geometry', '''(() => {
                const [x,y] = surface.menu.box.get_transformed_position();
                const [w,h] = surface.menu.box.get_transformed_size();
                const [bx,by] = surface._blur.get_transformed_position();
                const [bw,bh] = surface._blur.get_transformed_size();
                return [x-bx,y-by,w-bw,h-bh].every(v => Math.abs(v) < 1);
            })()''')
            check(f'{key}-sharp-content', 'surface.menu.box.opacity === 255 && surface.menu.actor.get_effect("gnome-shell-soft-blur") === null')
            check(f'{key}-stacking', '(() => { const children = surface.menu.actor.get_parent().get_children(); '
                  'return children.indexOf(surface._group) === children.indexOf(surface.menu.actor) - 1; })()')
            check(f'{key}-layout-style', 'surface.menu.actor.get_style().includes("max-height") && '
                  'surface.menu.actor.get_style().includes("-arrow-background-color: transparent")')
            results[f'{key}-paint'] = evaluate('''(() => {
                const color = surface.menu.box.get_theme_node().get_background_color();
                return {alpha:color.alpha, red:color.red, green:color.green, blue:color.blue,
                    style:surface.menu.box.get_style(), menuStyle:surface.menu.actor.get_style(),
                    blurSize:[surface._blur.width,surface._blur.height],
                    groupPosition:[surface._group.x,surface._group.y],
                    brightness:surface._effect.brightness};
            })()''')
            check(f'{key}-actual-alpha', 'Math.abs(surface.menu.box.get_theme_node().get_background_color().alpha - 140) <= 1')
            check(f'{key}-actual-corners', 'surface.menu.box.get_theme_node().get_border_radius(0) === '
                  '30 * surface._context.scale_factor')
            screenshot_path = json.dumps(str(output / f'{variant}-{key}.png'))
            evaluate(f'''(async () => {{
                const stream = Gio.File.new_for_path({screenshot_path}).replace(
                    null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                await new Shell.Screenshot().screenshot(false, stream);
                stream.close(null);
                return true;
            }})()''')
            evaluate('globalThis.previousEffect = surface._effect; surface.menu.close();')
            time.sleep(0.4)
            check(f'{key}-hidden', '!surface._group.visible && !surface._blur.mapped')
            check(f'{key}-hidden-no-window-signals', 'surface._windows.size === 0')
            evaluate('surface.menu.open();')
            time.sleep(0.4)
            check(f'{key}-recreated', 'surface._effect !== previousEffect')
            evaluate('surface.menu.close();')
            time.sleep(0.4)

            # Panel menus normally use FULL/FADE transitions. Waiting until the
            # actor unmaps misses a lingering backdrop during their exit.
            evaluate('globalThis.closeFrames = []; '
                     'globalThis.closeFrameId = global.stage.connect("before-paint", () => '
                     'closeFrames.push({open:surface.menu.isOpen, menuMapped:surface.menu.actor.mapped, '
                     'blurMapped:surface._blur.mapped, blurVisible:surface._group.visible})); '
                     'surface.menu.open(popupAnimation.FULL);')
            time.sleep(0.3)
            for animation in ['FULL', 'FADE', 'NONE']:
                evaluate(f'surface.menu.close(popupAnimation.{animation});')
                check(f'{key}-{animation.lower()}-close-immediate',
                      '!surface.menu.isOpen && !surface._group.visible && '
                      '!surface._blur.mapped && surface._later === 0')
                time.sleep(0.25)
                evaluate('surface.menu.open(popupAnimation.FULL);')
                time.sleep(0.3)
            evaluate('surface.menu.close(popupAnimation.FULL); surface.menu.open(popupAnimation.FULL);')
            check(f'{key}-interrupted-close-reopen', 'surface.menu.isOpen && surface._group.visible')
            time.sleep(0.3)
            evaluate('surface.menu.close(popupAnimation.FULL);')
            time.sleep(0.03)
            evaluate('surface.menu.open(popupAnimation.FULL);')
            time.sleep(0.03)
            evaluate('surface.menu.close(popupAnimation.FULL);')
            check(f'{key}-interrupted-open-close', '!surface._group.visible && !surface._blur.mapped')
            time.sleep(0.3)
            evaluate('global.stage.disconnect(closeFrameId);')
            results[f'{key}-closing-frames'] = evaluate('closeFrames')
            assert any(not frame['open'] for frame in results[f'{key}-closing-frames'])
            assert all(frame['open'] or not frame['blurMapped']
                       for frame in results[f'{key}-closing-frames']), 'Blur remains after menu close'

        evaluate('soft._settings.set_int("opacity", 35); soft._settings.set_int("blur-radius", 47); '
                 'soft._settings.set_int("corner-radius", 24); soft._settings.set_int("brightness", 75);')
        time.sleep(0.3)
        check('live-settings', 'Array.from(soft._surfaces.values()).every(s => '
              's.menu.box.get_style().includes("0.35") && Math.abs(s._effect.brightness - 0.75) < 0.001 && '
              's._effect[s._radiusProperty] === (s._radiusProperty === "radius" ? 47 : 23.5) * s._context.scale_factor)')
        evaluate('surface = soft._surfaces.get("quick-settings"); '
                 'surface.menu.actor.set_style(surface.menu.actor.get_style() + " min-width: 200px;"); '
                 'surface.menu.box.set_style(surface.menu.box.get_style() + " padding: 20px;");')
        check('external-styles-preserved', 'surface.menu.actor.get_style().includes("min-width: 200px") && '
              'surface.menu.box.get_style().includes("padding: 20px") && '
              'Math.abs(surface.menu.box.get_theme_node().get_background_color().alpha - 89) <= 1 && '
              '!surface._originalBoxStyle.includes("rgba")')

        evaluate('surface = soft._surfaces.get("quick-settings"); surface.menu.open();')
        time.sleep(0.5)
        evaluate('surface.menu.actor.translation_x = -24; surface.menu.actor.scale_x = 0.9;')
        time.sleep(0.4)
        check('animated-geometry', '''(() => {
            const [x,y] = surface.menu.box.get_transformed_position();
            const [w,h] = surface.menu.box.get_transformed_size();
            const [bx,by] = surface._blur.get_transformed_position();
            const [bw,bh] = surface._blur.get_transformed_size();
            return [x-bx,y-by,w-bw,h-bh].every(v => Math.abs(v) < 1);
        })()''')
        evaluate('surface.menu.actor.translation_x = 0; surface.menu.actor.scale_x = 1; '
                 'previousEffect = surface._effect; surface._sleeping = true; surface._recover();')
        check('sleep-hidden', '!surface._group.visible')
        evaluate('surface._sleeping = false; surface._recover();')
        check('resume-recreated', 'surface._group.visible && surface._effect !== previousEffect')
        time.sleep(1)
        evaluate('globalThis.frames = 0; globalThis.frameId = global.stage.connect("after-paint", () => frames++);')
        time.sleep(1.5)
        results['idle-frames-open'] = evaluate('frames')
        evaluate('global.stage.disconnect(frameId);')
        if results['idle-frames-open'] > 2:
            raise AssertionError('Blur drives idle repaints')

        # Window events outside the backdrop must not invalidate its capture.
        # A real Clutter actor exercises transformed geometry and GObject signals.
        evaluate('''(() => {
            globalThis.probeWindow = new imports.gi.St.Widget({x:2000, y:100, width:120, height:120});
            probeWindow.get_meta_window = () => null;
            Main.uiGroup.insert_child_below(probeWindow, surface._group);
            surface._trackWindow(probeWindow);
        })()''')
        time.sleep(0.3)
        check('distant-window-no-repaint', 'probeWindow.translation_x = 20; surface._later === 0')
        check('damage-burst-shares-bounds', """(() => {
            surface._blurBounds = null;
            const first = surface._getBlurBounds();
            for (let i=0; i<20; i++) surface._windowIntersectsBlur(probeWindow);
            return surface._getBlurBounds() === first;
        })()""")
        check('geometry-invalidates-bounds', """(() => {
            const previous = surface._getBlurBounds();
            surface._syncGeometry();
            return surface._getBlurBounds() !== previous;
        })()""")
        check('window-entering-repaints', '''(() => {
            const [x,y] = surface._blur.get_transformed_position();
            probeWindow.translation_x = x - probeWindow.x;
            probeWindow.translation_y = y - probeWindow.y;
            return surface._later !== 0;
        })()''')
        time.sleep(0.3)
        check('window-leaving-repaints', 'probeWindow.translation_x = 2000; surface._later !== 0')
        time.sleep(0.3)
        check('distant-window-removal-no-repaint', 'probeWindow.destroy(); surface._later === 0 && '
              '!surface._windows.has(probeWindow)')

        # Native Shell.BlurEffect lacks rounded clipping, so use square corners
        # there: culling must never remove blur still visible around the fill.
        evaluate('soft._settings.set_int("opacity",100); '
                 'if (!surface._hasCorners) soft._settings.set_int("corner-radius",0);')
        time.sleep(0.8)
        evaluate('global.stage.queue_redraw();')
        time.sleep(0.2)
        check('opaque-blur-hidden', '!surface._group.visible && !surface._blur.mapped && surface._later === 0')
        check('opaque-no-window-signals', 'surface._windows.size === 0')
        # Compare the actual menu pixels with and without the covered effect.
        evaluate('surface._opaqueUntil=GLib.get_monotonic_time()+5000000; '
                 'surface._syncVisibility(); surface._queueRepaint();')
        time.sleep(0.2)
        with_blur = screenshot('opaque-with-blur')
        evaluate('surface._opaqueUntil=0; global.stage.queue_redraw();')
        time.sleep(0.2)
        without_blur = screenshot('opaque-without-blur')
        box = evaluate('[...surface.menu.box.get_transformed_position(), '
                       '...surface.menu.box.get_transformed_size()]')
        pixels = [image.get_pixels() for image in [with_blur, without_blur]]
        channels = with_blur.get_n_channels()
        stride = with_blur.get_rowstride()
        radius = evaluate('surface.menu.box.get_theme_node().get_border_radius(0)')
        deltas = []
        interior_changes = 0
        for y in range(max(0, int(box[1])), min(with_blur.get_height(), int(box[1] + box[3]))):
            for x in range(max(0, int(box[0])), min(with_blur.get_width(), int(box[0] + box[2]))):
                offset = y * stride + x * channels
                delta = max(abs(pixels[0][offset + c] - pixels[1][offset + c]) for c in range(3))
                deltas.append(delta)
                if delta:
                    # Removing a second rounded layer can change antialiasing
                    # at the contour. No pixels away from that edge may change.
                    qx = abs(x + 0.5 - box[0] - box[2] / 2) - (box[2] / 2 - radius)
                    qy = abs(y + 0.5 - box[1] - box[3] / 2) - (box[3] / 2 - radius)
                    edge_distance = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - radius
                    if abs(edge_distance) > 2:
                        interior_changes += 1
        results['opaque-culling-pixels'] = {'changed': sum(delta > 0 for delta in deltas),
                                           'max-channel-delta': max(deltas),
                                           'changes-away-from-edge': interior_changes}
        assert interior_changes == 0, 'Opaque culling changed pixels away from the antialiased contour'
        check('opaque-no-redraw-guard', '''(() => {
            const Clutter = imports.gi.Clutter;
            const flags = Clutter.get_debug_flags()[1];
            return (flags & Clutter.DrawDebugFlag.DISABLE_CLIPPED_REDRAWS) === 0;
        })()''')
        evaluate('globalThis.frames = 0; frameId = global.stage.connect("after-paint", () => frames++);')
        time.sleep(1.5)
        results['idle-frames-opaque'] = evaluate('frames')
        evaluate('global.stage.disconnect(frameId);')
        assert results['idle-frames-opaque'] <= 2
        evaluate('soft._settings.set_int("opacity",35);')
        time.sleep(0.4)
        check('transparent-blur-restored', 'surface._group.visible && surface._blur.mapped')
        if not evaluate('surface._hasCorners'):
            evaluate('soft._settings.set_int("corner-radius",24); soft._settings.set_int("opacity",100);')
            time.sleep(0.8)
            evaluate('global.stage.queue_redraw();')
            time.sleep(0.2)
            check('native-uncovered-corners-kept', 'surface._blur.mapped')
            evaluate('soft._settings.set_int("opacity",35);')

        evaluate('surface.menu.close(); soft._settings.set_boolean("notifications", false);')
        time.sleep(0.4)
        check('independent-toggle', 'soft._surfaces.size === 1 && soft._surfaces.has("quick-settings")')
        evaluate('soft._settings.set_boolean("notifications", true);')
        time.sleep(0.3)
        check('toggle-reenable', 'soft._surfaces.size === 2')
        evaluate('globalThis.originals = Array.from(soft._surfaces.values()).map(s => '
                 '({box:s.menu.box, actor:s.menu.actor, boxStyle:s._originalBoxStyle, '
                 'menuStyle:s._originalMenuStyle, group:s._group})); soft.disable();')
        check('styles-restored', 'originals.every(s => s.box.get_style() === s.boxStyle && '
              's.actor.get_style() === s.menuStyle)')
        check('layers-removed', '!Main.uiGroup.get_children().some(a => a.name?.startsWith("soft-"))')
        evaluate('soft.enable();')
        check('extension-reenable', 'soft._surfaces.size === 2')
        display_env = dict(os.environ, WAYLAND_DISPLAY='wayland-0', GDK_BACKEND='wayland', GSETTINGS_BACKEND='memory',
                           GI_TYPELIB_PATH='/usr/lib64/gnome-shell/girepository-1.0:/usr/lib64/gnome-shell')
        prefs = subprocess.run(['gjs', '-m', str(ROOT / 'tests/prefs.js'), str(ROOT)],
                               env=display_env, capture_output=True, text=True, timeout=15)
        results['preferences'] = {'passed': prefs.returncode == 0, 'output': prefs.stdout.strip()}
        if prefs.returncode:
            raise RuntimeError(prefs.stderr)
        results['passed'] = True
        print(json.dumps(results, indent=2))
    finally:
        (output / f'{variant}-results.json').write_text(json.dumps(results, indent=2) + '\n')
        shell.terminate()
        try:
            shell.wait(timeout=10)
        except subprocess.TimeoutExpired:
            shell.kill()
            shell.wait()
        log.close()


if __name__ == '__main__':
    if os.environ.get('SOFT_TEST_CHILD'):
        test()
    else:
        sys.exit(stage())
