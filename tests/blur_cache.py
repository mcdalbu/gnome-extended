"""Cache regression checks against the optional backend in a private Shell."""
import time


def test_blur_cache(evaluate, check, results):
    evaluate('''(() => {
        const St = imports.gi.St;
        const Blur = imports.gi.Blur;
        globalThis.cacheActor = new St.Widget({x: 100, y: 100, width: 160, height: 100,
            style: 'background-color: red;'});
        globalThis.cacheEffect = new Blur.BlurEffect({mode: Blur.BlurMode.ACTOR,
            radius: 20, brightness: 0.8});
        cacheActor.add_effect(cacheEffect);
        Main.uiGroup.add_child(cacheActor);
    })()''')
    try:
        time.sleep(0.4)
        evaluate('globalThis.cacheBefore = cacheEffect.capture_count; cacheEffect.brightness = 0.6;')
        time.sleep(0.2)
        check('brightness-reuses-blur', 'cacheEffect.capture_count === cacheBefore && cacheEffect.cached_count > 0')
        evaluate('cacheEffect.corner_radius = 16;')
        time.sleep(0.2)
        check('corners-reuse-blur', 'cacheEffect.capture_count === cacheBefore')
        evaluate('cacheEffect.radius = 25;')
        time.sleep(0.2)
        check('radius-invalidates-blur', 'cacheEffect.capture_count > cacheBefore')
        evaluate('''(() => {
            cacheEffect.mode = imports.gi.Blur.BlurMode.BACKGROUND;
            cacheEffect.frame_divisor = 4;
            globalThis.skippedCapture = null;
            const cached = cacheEffect.cached_count;
            globalThis.cachePaintId = global.stage.connect('after-paint', () => {
                if (cacheEffect.cached_count > cached) {
                    skippedCapture = cacheEffect.capture_count;
                    global.stage.disconnect(cachePaintId);
                    cachePaintId = 0;
                } else {
                    cacheEffect.queue_repaint();
                }
            });
        })()''')
        time.sleep(0.5)
        check('trailing-capture-after-skip', 'skippedCapture !== null && cacheEffect.capture_count > skippedCapture')
        evaluate('globalThis.idleCounts = [cacheEffect.capture_count, cacheEffect.cached_count];')
        time.sleep(0.5)
        check('trailing-capture-settles', '[cacheEffect.capture_count, cacheEffect.cached_count].every((n, i) => n === idleCounts[i])')
        results['blur-cache-counts'] = evaluate('idleCounts')
        evaluate('''(() => {
            globalThis.secondCacheActor = new imports.gi.St.Widget({x: 300, y: 100,
                width: 160, height: 100});
            globalThis.secondCacheEffect = new imports.gi.Blur.BlurEffect({
                mode: imports.gi.Blur.BlurMode.BACKGROUND, radius: 20, frame_divisor: 2});
            secondCacheActor.add_effect(secondCacheEffect);
            Main.uiGroup.add_child(secondCacheActor);
            cacheEffect.queue_repaint();
        })()''')
        time.sleep(0.5)
        evaluate('globalThis.multiCounts = [cacheEffect.capture_count, secondCacheEffect.capture_count];')
        time.sleep(0.5)
        check('multiple-blurs-settle', '[cacheEffect.capture_count, secondCacheEffect.capture_count].every((n, i) => n === multiCounts[i])')
    finally:
        evaluate('if (globalThis.cachePaintId) global.stage.disconnect(cachePaintId); '
                 'globalThis.secondCacheActor?.destroy(); cacheActor.destroy();')
