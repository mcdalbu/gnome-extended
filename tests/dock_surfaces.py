"""Test the external actor contract with three independently built dock fixtures."""
import time


def test_docks(evaluate, check, results, screenshot):
    check('dock-overview-default-enabled', 'soft._settings.get_boolean("dock-transparent-in-overview")')
    evaluate('soft._settings.set_boolean("dock-transparent-in-overview", false);')
    evaluate('''(() => {
        const St = imports.gi.St;
        globalThis.fixtureDocks = [];
        for (let i = 0; i < 3; i++) {
            const root = new St.BoxLayout({name:i ? 'independent-fork' : 'dashtodockContainer',
                style_class:i === 1 ? 'dash-to-dock' : '', x:60+i*500, y:800, width:420, height:70});
            Main.uiGroup.add_child(root);
            const box = new St.Widget({style_class:'dash-background', width:420, height:70,
                style:'background-color: rgb(45,45,45); border-radius: 18px; border: 2px solid red; box-shadow: 0 2px 6px 2px black;'});
            root.add_child(box);
            const icons = new St.BoxLayout({style_class:'overview-icon'});
            icons.add_child(new St.Icon({icon_name:'folder-symbolic'}));
            root.add_child(icons);
            fixtureDocks.push({root, box, icon:icons.get_first_child(), original:box.get_style()});
        }
    })()''')
    time.sleep(0.8)
    check('generic-dock-discovery', 'fixtureDocks.every(d => soft._docks._records.get(d.root)?.surface?._blur.mapped)')
    check('dock-shared-opacity', 'fixtureDocks.every(d => Math.abs(d.box.get_theme_node().get_background_color().alpha - 140) <= 1)')
    check('dock-marker', 'fixtureDocks.every(d => d.root.has_style_class_name("gnome-extended-dock"))')
    evaluate('''(() => {
        const St = imports.gi.St;
        globalThis.fixtureGrid = new St.BoxLayout({style_class:'apps-scroll-view', x:40, y:100});
        const cell = new St.BoxLayout({style_class:'overview-icon'});
        globalThis.fixtureGridIcon = new St.Icon({icon_name:'folder-symbolic'});
        cell.add_child(fixtureGridIcon); fixtureGrid.add_child(cell); Main.uiGroup.add_child(fixtureGrid);
    })()''')
    for grid in [False, True]:
        for dock in [False, True]:
            evaluate(f'soft._appGrid._settings.set_boolean("icon-shadow-grid-enabled", {str(grid).lower()}); '
                     f'soft._appGrid._settings.set_boolean("icon-shadow-dock-enabled", {str(dock).lower()});')
            check(f'independent-shadows-{grid}-{dock}',
                  f'!!fixtureGridIcon.get_theme_node().get_shadow("icon-shadow") === {str(grid).lower()} && '
                  f'fixtureDocks.every(d => !!d.icon.get_theme_node().get_shadow("icon-shadow") === {str(dock).lower()})')
    evaluate('fixtureGrid.destroy();')
    evaluate('soft._settings.set_int("blur-rate", 2); fixtureDocks[0].root.translation_y = -60;')
    time.sleep(0.2)
    check('dock-motion-alignment', '''fixtureDocks.every(d => {
        const b=soft._docks._records.get(d.root).surface._blur;
        const a=[...d.box.get_transformed_position(),...d.box.get_transformed_size()];
        const c=[...b.get_transformed_position(),...b.get_transformed_size()];
        return a.every((v,i)=>Math.abs(v-c[i])<1);
    })''')
    evaluate('fixtureDocks[0].root.hide();')
    check('dock-hide', '!soft._docks._records.get(fixtureDocks[0].root).surface._group.visible')
    sharp = screenshot('dock-hidden-reference')
    evaluate('''globalThis.dockProbe = imports.gi.FrameProbe;
        globalThis.dockPaintPixels = [];
        globalThis.dockProbeId = global.stage.connect('after-paint', (_stage, view) => {
            const layout = view.layout, scale = view.get_scale();
            dockPaintPixels = Array.from(dockProbe.read(view.get_framebuffer(),
                Math.round((100-layout.x)*scale), Math.round((755-layout.y)*scale), 80, 35).get_data());
        }); testBackdrop.queue_redraw();''')
    time.sleep(.2)
    reference = evaluate('dockPaintPixels')
    evaluate('''fixtureDocks[0].root.show(); fixtureDocks[0].root.ease({translation_y:100,
        duration:400, onComplete:()=>fixtureDocks[0].root.set_clip(0,0,0,0)});''')
    time.sleep(.8)
    painted = evaluate('dockPaintPixels')
    evaluate('global.stage.disconnect(dockProbeId); fixtureDocks[0].root.translation_y=-60;')
    assert reference and len(reference) == len(painted)
    error = sum(abs(a-b) for a,b in zip(reference,painted))/len(reference)
    results['dock-autohide-framebuffer-error'] = error
    assert error < 1, f'Blur left in displayed framebuffer after autohide: {error}'
    evaluate('fixtureDocks[0].root.show(); fixtureDocks[0].root.set_clip(0, 0, 0, 0);')
    time.sleep(.2)
    check('dock-clipped-still-mapped', 'fixtureDocks[0].box.mapped')
    hidden = screenshot('dock-zero-clip')
    check('dock-zero-clip-hides-layer', '!soft._docks._records.get(fixtureDocks[0].root).surface._group.visible')
    evaluate('fixtureDocks[0].root.set_clip(0, 0, 150, 70);')
    time.sleep(.2)
    partial = screenshot('dock-partial-clip')
    evaluate('fixtureDocks[0].root.remove_clip();')
    time.sleep(.2)
    restored = screenshot('dock-clip-restored')
    def difference(picture, left, right):
        a, b = sharp.get_pixels(), picture.get_pixels()
        stride, channels = sharp.get_rowstride(), sharp.get_n_channels()
        values = [abs(a[y*stride+x*channels+c]-b[y*stride+x*channels+c])
                  for y in range(755, 790) for x in range(left, right) for c in range(3)]
        return sum(values)/len(values)
    errors = [difference(hidden, 100, 400), difference(partial, 300, 400)]
    results['dock-clipped-pixel-errors'] = errors
    assert max(errors) < 1, f'Blur escaped the dock clip: {errors}'
    assert difference(partial, 100, 190) > 1, 'Partially visible dock lost its backdrop'
    assert difference(restored, 100, 400) > 1, 'Dock did not reappear after unclipping'
    evaluate('fixtureDocks[0].box.hide();')
    check('dock-background-hide', '!soft._docks._records.get(fixtureDocks[0].root).surface._group.visible')
    evaluate('fixtureDocks[0].box.show();')
    check('dock-background-show', 'soft._docks._records.get(fixtureDocks[0].root).surface._group.visible')
    evaluate('fixtureDocks[0].root.show(); soft._settings.set_boolean("docks", false);')
    check('dock-toggle-off', 'fixtureDocks.every(d => !soft._docks._records.get(d.root).surface && d.box.get_style() === d.original)')
    evaluate('soft._settings.set_boolean("docks", true);')
    time.sleep(0.2)
    check('dock-toggle-on', 'fixtureDocks.every(d => soft._docks._records.get(d.root).surface._blur.mapped)')
    evaluate('Main.overview.show();')
    time.sleep(0.8)
    check('dock-overview-opt-out-unchanged', 'fixtureDocks.every(d => soft._docks._records.get(d.root).surface._blur.mapped && d.box.get_theme_node().get_background_color().alpha > 0)')
    evaluate('''globalThis.dockFadeSamples = [];
        globalThis.dockFadeId = global.stage.connect('before-paint', () => {
            const s = soft._docks._records.get(fixtureDocks[0].root).surface;
            dockFadeSamples.push({opacity: fixtureDocks[0].box.opacity,
                radius: s._effect[s._radiusProperty], brightness: s._effect.brightness,
                icon: fixtureDocks[0].icon.get_paint_opacity()});
        }); soft._settings.set_boolean("dock-transparent-in-overview", true);''')
    time.sleep(0.4)
    evaluate('global.stage.disconnect(dockFadeId);')
    check('dock-fade-out-intermediate', 'dockFadeSamples.some(s => s.opacity > 0 && s.opacity < 255 && s.radius > 0 && s.brightness > 0.85 && s.brightness < 1) && dockFadeSamples.every(s => s.icon === 255)')
    results['dock-fade-out-frames'] = evaluate('dockFadeSamples')
    check('dock-overview-transparent', '''fixtureDocks.every(d => {
        return d.box.get_paint_opacity() === 0 && d.icon.get_paint_opacity() === 255 &&
            !soft._docks._records.get(d.root).surface._group.visible;
    })''')
    evaluate('soft._settings.set_int("opacity", 100);')
    check('dock-overview-overrides-opaque', 'fixtureDocks.every(d => d.box.get_paint_opacity() === 0 && !soft._docks._records.get(d.root).surface._blur.mapped)')
    evaluate('soft._settings.set_boolean("dock-transparent-in-overview", false);')
    time.sleep(0.4)
    check('dock-overview-toggle-restores-border', 'fixtureDocks.every(d => d.box.get_theme_node().get_background_color().alpha === 255 && d.box.get_theme_node().get_border_color(0).alpha === 255 && !!d.box.get_theme_node().get_shadow("box-shadow"))')
    evaluate('soft._settings.set_int("opacity", 55); soft._settings.set_boolean("dock-transparent-in-overview", true);')
    time.sleep(0.35)
    evaluate('''globalThis.dockFadeSamples = [];
        globalThis.dockFadeId = global.stage.connect('before-paint', () => {
            const s = soft._docks._records.get(fixtureDocks[0].root).surface;
            dockFadeSamples.push({opacity: fixtureDocks[0].box.opacity,
                radius: s._effect[s._radiusProperty], icon: fixtureDocks[0].icon.get_paint_opacity()});
        }); Main.overview.hide();''')
    time.sleep(0.8)
    evaluate('global.stage.disconnect(dockFadeId);')
    check('dock-fade-in-intermediate', 'dockFadeSamples.some(s => s.opacity > 0 && s.opacity < 255 && s.radius > 0) && dockFadeSamples.every(s => s.icon === 255)')
    results['dock-fade-in-frames'] = evaluate('dockFadeSamples')
    check('dock-overview-close-restores', 'fixtureDocks.every(d => soft._docks._records.get(d.root).surface._blur.mapped && Math.abs(d.box.get_theme_node().get_background_color().alpha - 140) <= 1 && d.box.get_theme_node().get_border_color(0).alpha === 255)')
    evaluate('soft._settings.set_boolean("docks", false); Main.overview.show();')
    time.sleep(0.8)
    check('dock-overview-without-normal-blur', 'fixtureDocks.every(d => d.box.get_paint_opacity() === 0 && !soft._docks._records.get(d.root).surface._group.visible)')
    evaluate('Main.overview.hide();')
    time.sleep(0.8)
    check('dock-overview-restores-original-without-blur', 'fixtureDocks.every(d => d.box.opacity === 255 && !soft._docks._records.get(d.root).surface._group.visible && d.box.get_style() === d.original)')
    evaluate('soft._settings.set_boolean("docks", true); Main.overview.show();')
    time.sleep(0.8)
    evaluate('soft._docks.destroy();')
    check('dock-overview-disable-cleans-up', 'fixtureDocks.every(d => d.box.get_style() === d.original && !d.root.has_style_class_name("gnome-extended-dock"))')
    evaluate('''(async () => {
        const {DockSurfaces} = await import(soft.dir.get_uri() + '/dockSurfaces.js');
        soft._docks = new DockSurfaces(soft._settings); soft._docks.start();
    })()''')
    time.sleep(0.3)
    check('dock-overview-reenable-transparent', 'fixtureDocks.every(d => d.box.get_paint_opacity() === 0 && !soft._docks._records.get(d.root).surface._group.visible)')
    evaluate('Main.overview.hide(); soft._settings.set_boolean("dock-transparent-in-overview", false);')
    time.sleep(0.8)
    evaluate('fixtureDocks[1].box.destroy();')
    time.sleep(0.2)
    check('dock-background-destroyed', '!soft._docks._records.get(fixtureDocks[1].root).surface')
    evaluate('fixtureDocks.forEach(d => d.root.destroy()); soft._settings.set_int("blur-rate", 0); soft._settings.reset("dock-transparent-in-overview");')
    time.sleep(0.1)
    check('dock-fixture-cleanup', 'soft._docks._records.size === 0')
    results['generic-dock-contract'] = 'Upstream name, fork marker and anonymous structural match; no dock code imports'
