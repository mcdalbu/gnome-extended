"""Check rendered blur, not just actor opacity, over a fixed striped backdrop."""
import time


def test_panel_blur_fade(evaluate, check, screenshot, results):
    evaluate('''(() => {
        const St = imports.gi.St;
        globalThis.fadeSurface = [...soft._shellSurfaces._records.values()]
            .find(r => r.key === 'top-panel').surface;
        globalThis.fadeSettings = ['opacity', 'brightness', 'blur-radius']
            .map(k => [k, soft._settings.get_int(k)]);
        soft._settings.set_int('opacity', 0);
        soft._settings.set_int('brightness', 100);
        soft._settings.set_int('blur-radius', 48);
        globalThis.fadeStrip = new St.Widget({width:1440, height:Main.panel.height});
        for (let x=0; x<1440; x+=32)
            fadeStrip.add_child(new St.Widget({x, width:32, height:Main.panel.height,
                style:`background-color: ${x%64 ? '#ffffff' : '#000000'};`}));
        testBackdrop.add_child(fadeStrip);
    })()''')
    time.sleep(0.4)
    samples = []
    try:
        # Hold Shell's progress still so screenshots compare identical content.
        # Reversals must produce the same pixels at the same progress.
        for fade in [0, 0.1, 0.35, 0.7, 1, 0.35, 0]:
            evaluate(f'Main.overview._overview.controls._stateAdjustment.value={1-fade}; '
                     'global.stage.queue_redraw();')
            time.sleep(0.1)
            image = screenshot(f'panel-blur-progress-{len(samples)}')
            data = image.get_pixels()
            y = int(evaluate('Main.panel.height/2'))
            start = y * image.get_rowstride()
            colors = [sum(data[start+x*image.get_n_channels():start+x*image.get_n_channels()+3])/3
                      for x in range(320, 960)]
            mean = sum(colors)/len(colors)
            contrast = (sum((c-mean)**2 for c in colors)/len(colors))**0.5
            samples.append({'fade': fade, 'contrast': contrast})
        results['panel-blur-rendered-progress'] = samples
        values = [s['contrast'] for s in samples[:5]]
        assert values[0] > values[1] + 1, samples
        assert values[1] > values[2] + 3, samples
        assert values[2] > values[3] + 3, samples
        assert values[3] > values[4] + 1, samples
        assert abs(samples[2]['contrast']-samples[5]['contrast']) < 2, samples
        assert abs(samples[0]['contrast']-samples[6]['contrast']) < 2, samples
        check('panel-blur-pixels-transition-smoothly', 'true')
    finally:
        evaluate('Main.overview._overview.controls._stateAdjustment.value=0; '
                 'fadeStrip.destroy(); '
                 'for (const [key,value] of fadeSettings) soft._settings.set_int(key,value);')
