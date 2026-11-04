"""Test the external actor contract with three independently built dock fixtures."""
import time


def test_docks(evaluate, check, results):
    evaluate('''(() => {
        const St = imports.gi.St;
        globalThis.fixtureDocks = [];
        for (let i = 0; i < 3; i++) {
            const root = new St.BoxLayout({name:i ? 'independent-fork' : 'dashtodockContainer',
                style_class:i === 1 ? 'dash-to-dock' : '', x:60+i*500, y:800, width:420, height:70});
            Main.uiGroup.add_child(root);
            const box = new St.Widget({style_class:'dash-background', width:420, height:70,
                style:'background-color: rgb(45,45,45); border-radius: 18px;'});
            root.add_child(box);
            const icons = new St.BoxLayout({style_class:'overview-icon'});
            icons.add_child(new St.Icon({icon_name:'folder-symbolic'}));
            root.add_child(icons);
            fixtureDocks.push({root, box, icon:icons.get_first_child(), original:box.get_style()});
        }
    })()''')
    time.sleep(0.5)
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
    evaluate('fixtureDocks[0].root.show(); soft._settings.set_boolean("docks", false);')
    check('dock-toggle-off', 'fixtureDocks.every(d => !soft._docks._records.get(d.root).surface && d.box.get_style() === d.original)')
    evaluate('soft._settings.set_boolean("docks", true);')
    time.sleep(0.2)
    check('dock-toggle-on', 'fixtureDocks.every(d => soft._docks._records.get(d.root).surface._blur.mapped)')
    evaluate('fixtureDocks[1].box.destroy();')
    time.sleep(0.2)
    check('dock-background-destroyed', '!soft._docks._records.get(fixtureDocks[1].root).surface')
    evaluate('fixtureDocks.forEach(d => d.root.destroy()); soft._settings.set_int("blur-rate", 0);')
    time.sleep(0.1)
    check('dock-fixture-cleanup', 'soft._docks._records.size === 0')
    results['generic-dock-contract'] = 'Upstream name, fork marker and anonymous structural match; no dock code imports'
