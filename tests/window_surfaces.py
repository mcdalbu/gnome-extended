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
        # Check every painted animation frame, not just settled geometry.
        evaluate('''globalThis.movingBlurFrames = [];
            globalThis.movingBlurSignal = global.stage.connect('after-paint', () => {
                const actor = testWindowActors[0];
                const state = soft._windowSurfaces._windows.get(actor);
                const frame = actor.meta_window.get_frame_rect();
                const buffer = actor.meta_window.get_buffer_rect();
                const x = actor.x + actor.translation_x + (frame.x - buffer.x) * actor.scale_x;
                const y = actor.y + actor.translation_y + (frame.y - buffer.y) * actor.scale_y;
                movingBlurFrames.push(Math.abs(state.blur.x - x) < .01 &&
                    Math.abs(state.blur.y - y) < .01);
            });
            testWindowActors[0].ease({translation_x: 180, translation_y: 70,
                duration: 500, mode: imports.gi.Clutter.AnimationMode.LINEAR});''')
        time.sleep(.8)
        evaluate('global.stage.disconnect(movingBlurSignal)')
        check('windows-moving-blur-aligned-every-frame',
              'movingBlurFrames.length > 5 && movingBlurFrames.every(Boolean)')
        evaluate('testWindowActors[0].translation_x = 0; testWindowActors[0].translation_y = 0')
        time.sleep(.2)
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
        # An opaque part of the owner must not cull pixels sampled by the
        # blur under its translucent sidebar. Compare against uncullable paint.
        evaluate('''globalThis.UnculledWindow = imports.gi.GObject.registerClass(
            class UnculledWindow extends imports.gi.Clutter.Effect {
                vfunc_paint(_node, context, _flags) {
                    this.get_actor().continue_paint(context);
                }
            });''')
        capture_errors = []
        for offset in [0, 19, 41]:
            evaluate(f'testWindowActors[0].meta_window.move_frame(false,{100 + offset},160)')
            time.sleep(.12)
            actual = screenshot(f'moving-window-{offset}')
            evaluate('''globalThis.unculledWindow = new UnculledWindow();
                testWindowActors[0].add_effect(unculledWindow);''')
            time.sleep(.12)
            reference = screenshot(f'moving-window-reference-{offset}')
            rect = evaluate('(()=>{const r=testWindowActors[0].meta_window.get_frame_rect();return [r.x,r.y]})()')
            first, second = actual.get_pixels(), reference.get_pixels()
            stride, channels = actual.get_rowstride(), actual.get_n_channels()
            # Read the translucent side near the opaque content boundary.
            errors = [abs(first[y*stride+x*channels+c]-second[y*stride+x*channels+c])
                      for y in range(rect[1]+80, rect[1]+180)
                      for x in range(rect[0]+115, rect[0]+148) for c in range(3)]
            capture_errors.append(sum(errors)/len(errors))
            evaluate('testWindowActors[0].remove_effect(unculledWindow)')
        results['moving-window-capture-errors'] = capture_errors
        assert max(capture_errors) < 1, f'Incomplete blur backdrop: {capture_errors}'
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
        evaluate('''globalThis.contentGeometryReads = 0;
            const actor = testWindowActors[0];
            const position = actor.get_transformed_position;
            actor.get_transformed_position = function () {
                contentGeometryReads++; return position.call(this);
            };''')
        for _ in range(3):
            evaluate("testWindowActors[0].emit('damaged')")
            time.sleep(.12)
        check('stationary-content-reuses-window-bounds', 'contentGeometryReads === 0')
        evaluate('delete testWindowActors[0].get_transformed_position')
        evaluate('''(async () => {
            globalThis.damageObserver = (await import(soft.dir.get_uri() + '/windowDamage.js')).windowDamage;
        })()''')
        evaluate('''globalThis.windowGroupTranslation = global.window_group.translation_x;
            global.window_group.translation_x += 17;''')
        try:
            time.sleep(.2)
            check('ancestor-motion-invalidates-window-bounds', '''(() => {
                const actor = testWindowActors[0];
                const bounds = damageObserver.boundsFor(actor);
                const [x, y] = actor.get_transformed_position();
                return Math.abs(bounds.x - x) < .01 && Math.abs(bounds.y - y) < .01;
            })()''')
        finally:
            evaluate('global.window_group.translation_x = windowGroupTranslation')
            time.sleep(.2)
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
