"""Observe actual on-screen frames during a real Ptyxis pointer drag."""
from pathlib import Path
import os
import subprocess
import time


def test_terminal_motion(evaluate, check, screenshot, results):
    source = subprocess.Popen(['gjs', '-m', str(Path(__file__).with_name('text-background.js'))],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            if evaluate('global.get_window_actors().some(a=>a.meta_window.get_title()==="Text backdrop test")'):
                break
            time.sleep(.1)
        else:
            raise AssertionError('Text backdrop did not open')
        time.sleep(.7)
        evaluate('globalThis.motionMixed = ' + ('true' if os.environ.get('SOFT_TEST_MONITORS') else 'false'))
        evaluate('''globalThis.textSource = global.get_window_actors().find(a=>a.meta_window.get_title()==='Text backdrop test');
            globalThis.dragStartX = motionMixed ? 1160 : 140;
            textSource.meta_window.move_resize_frame(false,Math.max(20,dragStartX-120),40,1380,900);
            ptyxisActor.meta_window.move_frame(false,dragStartX,150);
            textSource.meta_window.lower();
            ptyxisActor.meta_window.raise();
            ptyxisActor.meta_window.activate(global.get_current_time());
            testBackdrop.hide();
            soft._settings.set_int('blur-radius',30);
            soft._settings.set_int('brightness',85);
            soft._settings.set_int('opacity',55);''')
        time.sleep(.7)
        check('unblurred-foreground-window-has-no-backdrop', '!soft._windowSurfaces._windows.has(textSource)')
        screenshot('terminal-before-drag')
        results['terminal-pre-drag'] = evaluate('({pointer:global.get_pointer(), terminal:ptyxisActor.meta_window.get_frame_rect(), source:textSource.meta_window.get_frame_rect(),focus:global.display.focus_window?.get_title()})')
        evaluate('''globalThis.probe = imports.gi.FrameProbe;
            globalThis.dragFrames = [];
            globalThis.dragReference = null;
            globalThis.dragPointer = global.stage.get_context().get_backend().get_default_seat()
                .create_virtual_device(imports.gi.Clutter.InputDeviceType.POINTER_DEVICE);
            dragPointer.notify_absolute_motion(imports.gi.GLib.get_monotonic_time(),dragStartX+200,168);
            globalThis.dragSample = global.stage.connect('after-paint', (_stage, view) => {
                const scale=view.get_scale(), layout=view.layout;
                const sampleX=dragStartX+360, sampleY=400;
                if(sampleX<layout.x || sampleX>=layout.x+layout.width || sampleY<layout.y || sampleY>=layout.y+layout.height) return;
                const pixels = probe.read(view.get_framebuffer(),Math.round((sampleX-layout.x)*scale),Math.round((sampleY-layout.y)*scale),80,80).get_data();
                if (!dragReference) dragReference = new Uint8Array(pixels);
                let total=0, max=0, sum=0, squares=0;
                for(let i=0;i<pixels.length;i++) {
                    if(i%4===3) continue;
                    const delta=Math.abs(pixels[i]-dragReference[i]); total+=delta; max=Math.max(max,delta);
                    sum+=pixels[i]; squares+=pixels[i]*pixels[i];
                }
                const state=soft._windowSurfaces._windows.get(ptyxisActor);
                const rect=ptyxisActor.meta_window.get_frame_rect();
                const [bx,by]=state.blur.get_transformed_position();
                const [cx,cy]=state.captures.get(view).actor.get_transformed_position();
                dragFrames.push({x:rect.x,y:rect.y,bx,by,cx,cy,mean:total/(80*80*3),max,contrast:Math.sqrt(Math.max(0,squares/(80*80*3)-(sum/(80*80*3))**2)),overview:Main.overview.visible,scale,captures:state.captures.size});
            });
            global.stage.queue_redraw();''')
        time.sleep(.15)
        evaluate('dragPointer.notify_absolute_motion(imports.gi.GLib.get_monotonic_time(),dragStartX+200,168)')
        time.sleep(.15)
        evaluate('''dragPointer.notify_button(imports.gi.GLib.get_monotonic_time(),1,imports.gi.Clutter.ButtonState.PRESSED);''')
        time.sleep(.15)
        evaluate('''globalThis.dragStep=0; globalThis.dragDone=false;
            globalThis.dragTimer=imports.gi.GLib.timeout_add(imports.gi.GLib.PRIORITY_DEFAULT,17,()=>{
                dragStep++;
                dragPointer.notify_absolute_motion(imports.gi.GLib.get_monotonic_time(),dragStartX+200+dragStep,168+Math.floor(dragStep/4));
                if(dragStep<64) return imports.gi.GLib.SOURCE_CONTINUE;
                dragPointer.notify_button(imports.gi.GLib.get_monotonic_time(),1,imports.gi.Clutter.ButtonState.RELEASED);
                dragDone=true; return imports.gi.GLib.SOURCE_REMOVE;
            });''')
        for _ in range(100):
            if evaluate('dragDone'):
                break
            time.sleep(.05)
        time.sleep(.2)
        evaluate('global.stage.disconnect(dragSample)')
        evaluate('''globalThis.motionCaptureChanges=[];
            globalThis.motionOriginalSync=soft._windowSurfaces._syncCapture;
            soft._windowSurfaces._syncCapture=function(state,view) {
                const previous=view ? state.captures.get(view)?.geometry : null;
                const result=motionOriginalSync.call(this,state,view);
                if(view && previous !== state.captures.get(view)?.geometry)
                    motionCaptureChanges.push({previous,next:state.captures.get(view)?.geometry});
                return result;
            };''')
        time.sleep(1)
        evaluate('globalThis.motionIdleFrames=0; globalThis.motionIdleSignal=global.stage.connect("after-paint",()=>motionIdleFrames++)')
        time.sleep(.5)
        evaluate('global.stage.disconnect(motionIdleSignal); delete soft._windowSurfaces._syncCapture')
        results['terminal-drag-idle-frames'] = evaluate('motionIdleFrames')
        results['terminal-idle-capture-changes'] = evaluate('motionCaptureChanges')
        frames = evaluate('dragFrames')
        results['terminal-drag-frames'] = frames
        assert max(f['contrast'] for f in frames) < 5, 'Backdrop text was not actually blurred'
        assert not results['terminal-idle-capture-changes'], 'Stationary capture geometry changed'
        assert results['terminal-drag-idle-frames'] < 8, 'Capture caused an idle redraw loop'
        assert len({(f['x'],f['y']) for f in frames}) > 10, 'Terminal did not drag'
        assert max(f['mean'] for f in frames) < .05, f"Text shimmer in drag frames: {max(f['mean'] for f in frames)}"
        # Mutter can rearrange injected siblings without changing the order
        # of WindowActors. Repair the pair even when cached indices match.
        evaluate('''textSource.meta_window.raise(); textSource.meta_window.activate(global.get_current_time());''')
        time.sleep(.15)
        evaluate('''const state=soft._windowSurfaces._windows.get(ptyxisActor);
            ptyxisActor.get_parent().set_child_above_sibling(state.blur,textSource);
            global.display.emit('restacked');''')
        time.sleep(.15)
        check('terminal-focus-repairs-orphan-with-unchanged-window-order',
              'ptyxisActor.get_previous_sibling()===soft._windowSurfaces._windows.get(ptyxisActor).blur')
        for _ in range(4):
            for window in ['ptyxisActor', 'textSource']:
                evaluate(f'{window}.meta_window.raise(); {window}.meta_window.activate(global.get_current_time())')
                time.sleep(.12)
                check('terminal-focus-keeps-backdrop-paired',
                      'ptyxisActor.get_previous_sibling()===soft._windowSurfaces._windows.get(ptyxisActor).blur')
        # Hide the owner after BEFORE_REDRAW, reproducing a late visibility
        # change. The current frame must show sharp background text, not a
        # detached blur which only disappears in the following frame.
        evaluate('''ptyxisActor.meta_window.raise(); ptyxisActor.meta_window.activate(global.get_current_time());''')
        time.sleep(.15)
        evaluate('''globalThis.hiddenOwnerSample=null;
            globalThis.hideOwnerSignal=global.stage.connect('before-paint',()=>{
                global.stage.disconnect(hideOwnerSignal); ptyxisActor.hide();
            });
            globalThis.hiddenOwnerSignal=global.stage.connect('after-paint',(_stage,view)=>{
                const layout=view.layout, scale=view.get_scale(), sampleX=dragStartX+360;
                if(sampleX<layout.x || sampleX>=layout.x+layout.width || 400<layout.y || 400>=layout.y+layout.height) return;
                const pixels=probe.read(view.get_framebuffer(),Math.round((sampleX-layout.x)*scale),Math.round((400-layout.y)*scale),80,80).get_data();
                let sum=0,squares=0;
                for(let i=0;i<pixels.length;i++) { if(i%4===3) continue; sum+=pixels[i]; squares+=pixels[i]*pixels[i]; }
                hiddenOwnerSample=Math.sqrt(Math.max(0,squares/(80*80*3)-(sum/(80*80*3))**2));
                global.stage.disconnect(hiddenOwnerSignal);
            });
            global.stage.queue_redraw();''')
        for _ in range(100):
            if evaluate('hiddenOwnerSample!==null'):
                break
            time.sleep(.03)
        results['terminal-hidden-owner-text-contrast'] = evaluate('hiddenOwnerSample')
        assert results['terminal-hidden-owner-text-contrast'] > 20, 'Hidden terminal left blur over background text'
        evaluate('ptyxisActor.show()')
        time.sleep(.2)
        check('terminal-backdrop-restored-after-show',
              'soft._windowSurfaces._windows.get(ptyxisActor).blur.mapped && ptyxisActor.get_previous_sibling()===soft._windowSurfaces._windows.get(ptyxisActor).blur')
        if os.environ.get('SOFT_TEST_RESCALE'):
            from gi.repository import Gio, GLib
            bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
            results['terminal-live-rescale'] = []
            for requested in [1.25, 2.0]:
                state = bus.call_sync('org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig',
                                      'org.gnome.Mutter.DisplayConfig', 'GetCurrentState', None, None,
                                      Gio.DBusCallFlags.NONE, 5000, None).unpack()
                serial, monitors, logical, properties = state
                mode = next(mode for mode in monitors[0][1] if mode[-1].get('is-current'))
                scale = min(mode[5], key=lambda value: abs(value-requested))
                bus.call_sync('org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig',
                              'org.gnome.Mutter.DisplayConfig', 'ApplyMonitorsConfig',
                              GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})',
                                           (serial, 1, [(0, 0, scale, 0, True, [(monitors[0][0][0], mode[0], {})])],
                                            {'layout-mode': GLib.Variant('u', 1)})),
                              None, Gio.DBusCallFlags.NONE, 5000, None)
                time.sleep(.7)
                captures = evaluate('''(()=>{
                    const state=soft._windowSurfaces._windows.get(ptyxisActor);
                    return [...state.captures.values()].map(c=>({scale:c.view.get_scale(),
                        radius:('radius' in c.effect) ? c.effect.radius : c.effect.sigma*2,
                        mapped:c.actor.mapped, current:state.blur.peek_stage_views().includes(c.view)}));
                })()''')
                results['terminal-live-rescale'].append(captures)
                assert len(captures) == 1 and captures[0]['mapped'] and captures[0]['current']
                assert abs(captures[0]['scale']-scale) < .0001
                assert abs(captures[0]['radius']-round(30*scale)) < .001
    finally:
        source.terminate()
        source.wait(timeout=5)
