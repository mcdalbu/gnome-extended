"""Application-window lifecycle and stacking in the private compositor."""
from pathlib import Path
import subprocess
import time


def test_windows(evaluate, check, screenshot, results):
    client = subprocess.Popen(['gjs', '-m', str(Path(__file__).with_name('surface-windows.js'))],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            if evaluate('global.get_window_actors().filter(a=>a.meta_window.get_title()?.startsWith("Soft blur test")).length === 2'):
                break
            time.sleep(.1)
        else:
            raise AssertionError('Test application windows did not open')
        time.sleep(.8)
        evaluate("soft._settings.set_boolean('windows-ptyxis', true)")
        check('ptyxis-only-skips-unrelated-window-backdrops',
              'soft._windowSurfaces._windows.size === 0 && !soft._windowSurfaces._stopWindowDamage')
        evaluate("soft._settings.set_boolean('windows-ptyxis', false)")
        evaluate('''globalThis.testWindowActors = global.get_window_actors().filter(a=>a.meta_window.get_title()?.startsWith('Soft blur test'));
            globalThis.windowOriginalOpacities = testWindowActors.map(a=>a.opacity);
            soft._settings.set_boolean('windows-blur', true);''')
        time.sleep(.5)
        check('windows-content-stays-opaque', 'testWindowActors.every((a,i)=>a.opacity===windowOriginalOpacities[i])')
        check('windows-backdrop-stack', '''testWindowActors.every(a=>{
            const s=soft._windowSurfaces._windows.get(a), children=a.get_parent().get_children();
            return s.blur.visible && children.indexOf(s.blur)===children.indexOf(a)-1;
        })''')
        evaluate('testBackdrop.hide(); testWindowActors[0].meta_window.move_frame(false,100,160); testWindowActors[1].meta_window.move_frame(false,580,240)')
        time.sleep(.3)
        check('windows-geometry', '''testWindowActors.every(a=>{
            const s=soft._windowSurfaces._windows.get(a), r=a.meta_window.get_frame_rect();
            return s.blur.width===r.width && s.blur.height===r.height && Math.abs(s.blur.x-r.x)<1 && Math.abs(s.blur.y-r.y)<1;
        })''')
        evaluate('testWindowActors[1].meta_window.move_frame(false,950,240)')
        time.sleep(.4)
        evaluate('''globalThis.windowRepaints = [0, 0];
            globalThis.restoreWindowRepaints = testWindowActors.map((actor, i) => {
                const effect = soft._windowSurfaces._windows.get(actor).effect;
                const repaint = effect.queue_repaint;
                effect.queue_repaint = function () {
                    windowRepaints[i]++;
                    return repaint.call(this);
                };
                return () => { delete effect.queue_repaint; };
            });
            testWindowActors[0].emit('damaged');
            testWindowActors[0].emit('damaged');''')
        time.sleep(.2)
        check('windows-damage-batched-and-local', 'windowRepaints[0] === 1 && windowRepaints[1] === 0')
        evaluate('restoreWindowRepaints.forEach(restore => restore())')
        screenshot('application-windows')
        new_client = subprocess.Popen(['gjs', '-m', str(Path(__file__).with_name('surface-windows.js')),
                                       'local.SoftBlurNewTest'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                if evaluate('soft._windowSurfaces._windows.size===4'):
                    break
                time.sleep(.1)
            time.sleep(.6)
            check('windows-newly-opened', 'soft._windowSurfaces._windows.size===4 && [...soft._windowSurfaces._windows.values()].every(s=>s.actor.opacity===255 && s.blur?.visible)')
        finally:
            new_client.terminate()
            new_client.wait(timeout=5)
        time.sleep(.5)
        check('windows-closed-cleanup', 'soft._windowSurfaces._windows.size===2')
        time.sleep(.5)
        evaluate('globalThis.windowIdleFrames=0; globalThis.windowIdleSignal=global.stage.connect("after-paint",()=>windowIdleFrames++)')
        time.sleep(.5)
        evaluate('global.stage.disconnect(windowIdleSignal)')
        check('windows-no-idle-redraw-loop', 'windowIdleFrames < 8')
        evaluate('''globalThis.cleanWindowUpdates = 0;
            const surfaces = soft._windowSurfaces;
            const update = surfaces._updateWindow;
            surfaces._updateWindow = function (...args) {
                cleanWindowUpdates++;
                return update.apply(this, args);
            };
            global.stage.queue_redraw();''')
        time.sleep(.2)
        check('windows-clean-frame-skips-geometry', 'cleanWindowUpdates === 0')
        evaluate('delete soft._windowSurfaces._updateWindow')
        evaluate('''cleanWindowUpdates = 0;
            const surfaces = soft._windowSurfaces;
            const update = surfaces._updateWindow;
            surfaces._updateWindow = function (...args) {
                cleanWindowUpdates++;
                return update.apply(this, args);
            };
            global.display.emit('restacked');''')
        time.sleep(.2)
        check('unchanged-stacking-skips-window-geometry', 'cleanWindowUpdates === 0')
        evaluate('delete soft._windowSurfaces._updateWindow')
        evaluate('''globalThis.windowBlurValues = ['blur-radius', 'brightness'].map(key =>
                [key, soft._settings.get_int(key)]);
            soft._settings.set_int('blur-radius', 0);
            soft._settings.set_int('brightness', 100);''')
        time.sleep(.2)
        evaluate('''globalThis.neutralFrames = [];
            const {Clutter, Meta} = imports.gi;
            globalThis.neutralFrameId = global.stage.connect('before-update', () => {
                const [, flags] = typeof Clutter.get_debug_flags === 'function'
                    ? Clutter.get_debug_flags() : Meta.get_clutter_debug_flags();
                neutralFrames.push((flags & Clutter.DrawDebugFlag.DISABLE_CLIPPED_REDRAWS) !== 0);
            });
            global.stage.queue_redraw();''')
        time.sleep(.2)
        evaluate('global.stage.disconnect(neutralFrameId)')
        check('neutral-window-blur-preserves-clipped-redraws',
              'soft._settings.get_int("blur-radius") === 0 && neutralFrames.length > 0 && neutralFrames.every(flag => !flag)')
        evaluate('for (const [key, value] of windowBlurValues) soft._settings.set_int(key, value)')
        evaluate('testWindowActors[0].meta_window.make_fullscreen()')
        time.sleep(.5)
        check('windows-fullscreen-restored', 'testWindowActors[0].opacity===windowOriginalOpacities[0] && !soft._windowSurfaces._windows.get(testWindowActors[0]).blur.visible')
        evaluate('testWindowActors[0].meta_window.unmake_fullscreen()')
        time.sleep(.5)
        evaluate('testWindowActors[0].meta_window.minimize()')
        time.sleep(.4)
        check('windows-minimized-hidden', '!soft._windowSurfaces._windows.get(testWindowActors[0]).blur.visible')
        evaluate('testWindowActors[0].meta_window.unminimize()')
        time.sleep(.6)
        evaluate('Main.overview.show()')
        time.sleep(.5)
        check('windows-overview-restored', 'testWindowActors.every((a,i)=>a.opacity===windowOriginalOpacities[i] && !soft._windowSurfaces._windows.get(a).blur.visible)')
        evaluate('Main.overview.hide()')
        time.sleep(.5)
        evaluate("soft._settings.set_boolean('windows-blur',false)")
        check('windows-disable-restores', 'soft._windowSurfaces._windows.size===0 && testWindowActors.every((a,i)=>a.opacity===windowOriginalOpacities[i])')
        evaluate("soft._settings.set_boolean('windows-blur',true); soft._windowSurfaces.destroy()")
        check('windows-teardown-restores', 'soft._windowSurfaces._windows.size===0 && testWindowActors.every((a,i)=>a.opacity===windowOriginalOpacities[i])')
        evaluate("soft._settings.set_boolean('windows-blur',false); soft._windowSurfaces.start(); testBackdrop.show()")
    finally:
        client.terminate()
        client.wait(timeout=5)
