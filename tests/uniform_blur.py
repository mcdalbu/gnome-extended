"""Compare the window and Shell render paths over exactly the same backdrop."""
import time


def test_uniform_blur(evaluate, check, screenshot, results):
    saved = evaluate("['blur-radius','opacity','brightness'].map(k=>soft._settings.get_int(k))")
    try:
        evaluate('''globalThis.uniformMenu = {
                actor: new imports.gi.St.Widget({x:100,y:160,width:600,height:300,
                    style:'background-color:transparent;transition-duration:0ms;'}),
                isOpen:true, connect(){return 0;}, disconnect(){}
            };
            uniformMenu.box = uniformMenu.actor;
            Main.uiGroup.add_child(uniformMenu.actor);
            soft._settings.set_int('opacity',0);
            globalThis.uniformSurface = new ([...soft._surfaces.values()][0].constructor)(
                uniformMenu,soft._settings,'uniform-test',()=>{},{plain:true});
            globalThis.uniformOwner = new imports.gi.St.Widget({x:100,y:160,width:600,height:300});
            globalThis.uniformState = {actor:uniformOwner,
                blur:new imports.gi.St.Widget({x:100,y:160,width:600,height:300}),captures:new Map()};
            uniformState.blur.set_clip(0,0,600,300);
            Main.uiGroup.add_child(uniformState.blur);
            Main.uiGroup.add_child(uniformOwner);
            uniformOwner.hide();uniformState.blur.hide();''')
        evaluate('uniformMenu.actor.hide();uniformSurface._syncVisibility()')
        time.sleep(.15)
        sharp = screenshot('uniform-sharp-reference')
        sharp_pixels = sharp.get_pixels()
        blur_changes = []
        errors = []
        parameters = []
        for radius in [10, 30, 60]:
            evaluate(f"soft._settings.set_int('blur-radius',{radius});uniformSurface.update(true);")
            for height in [24, 300]:
                evaluate(f'''uniformMenu.actor.height={height};uniformMenu.actor.show();
                    uniformSurface._syncVisibility();uniformSurface._syncGeometry();''')
                time.sleep(.25)
                shell = screenshot(f'uniform-shell-{radius}-{height}')
                evaluate(f'''uniformMenu.actor.hide();uniformSurface._syncVisibility();
                    uniformOwner.height={height};uniformState.blur.height={height};
                    uniformState.blur.set_clip(0,0,600,{height});
                    uniformOwner.show();uniformState.blur.show();''')
                time.sleep(.1)
                evaluate('soft._windowSurfaces._syncCapture(uniformState)')
                time.sleep(.15)
                window = screenshot(f'uniform-window-{radius}-{height}')
                a, b = shell.get_pixels(), window.get_pixels()
                stride, channels = shell.get_rowstride(), shell.get_n_channels()
                delta = [abs(a[y*stride+x*channels+c]-b[y*stride+x*channels+c])
                         for y in range(165,160+height-5) for x in range(130,670) for c in range(3)]
                errors.append(sum(delta)/len(delta))
                changes = [abs(a[y*stride+x*channels+c]-sharp_pixels[y*stride+x*channels+c])
                           for y in range(165,160+height-5) for x in range(130,670) for c in range(3)]
                blur_changes.append(sum(changes)/len(changes))
                parameters.append(evaluate('[uniformSurface._effect[uniformSurface._radiusProperty],uniformState.effect.radius??uniformState.effect.sigma*2,uniformSurface._captureState.captures.size]'))
                evaluate('uniformOwner.hide();uniformState.blur.hide()')
        results['uniform-blur-changes-from-sharp'] = blur_changes
        assert min(blur_changes)>1, f'Blur was not rendered: {blur_changes}'
        results['uniform-blur-parameters'] = parameters
        results['uniform-window-shell-pixel-errors'] = errors
        assert max(errors) < .1, f'Window and Shell blur differ: {errors}'
        check('uniform-capture-per-view', '''uniformSurface._captureState.captures.size>0 &&
            [...uniformSurface._captureState.captures.values()].every(c=>
                c.effect[uniformSurface._radiusProperty]===Math.round(60*c.view.get_scale())/
                    (uniformSurface._radiusProperty==='sigma'?2:1))''')
    finally:
        evaluate('uniformSurface?.destroy();uniformMenu?.actor.destroy();uniformState?.blur.destroy();uniformOwner?.destroy()')
        for key, value in zip(['blur-radius','opacity','brightness'], saved):
            evaluate(f'soft._settings.set_int("{key}",{value})')
