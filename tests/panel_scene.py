"""Regress the framebuffer input switch at the end of a real overview exit."""
import json
import time
from pathlib import Path


def test_panel_scene(evaluate, check, screenshot, results):
    pattern = Path(evaluate('imports.gi.GLib.get_user_runtime_dir()')) / 'panel-scene-wallpaper.svg'
    pattern.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1000">'
                       '<defs><pattern id="p" width="128" height="128" patternUnits="userSpaceOnUse">'
                       '<rect width="128" height="128" fill="#fff"/>'
                       '<rect width="64" height="128" fill="#000"/>'
                       '</pattern></defs><rect width="1440" height="1000" fill="url(#p)"/></svg>')
    evaluate('''globalThis.sceneBackground = imports.gi.Gio.Settings.new('org.gnome.desktop.background');
        globalThis.sceneUris = ['picture-uri','picture-uri-dark'].map(k=>[k,sceneBackground.get_string(k)]);
        globalThis.sceneSlow = imports.gi.St.Settings.get().slow_down_factor;
        globalThis.sceneSurface = [...soft._shellSurfaces._records.values()].find(r=>r.key==='top-panel').surface;
        testBackdrop.hide();
        imports.gi.St.Settings.get().slow_down_factor=5;''')
    evaluate(f'for (const key of ["picture-uri","picture-uri-dark"]) '
             f'sceneBackground.set_string(key,{json.dumps(pattern.as_uri())});')
    time.sleep(1)
    frames = []
    try:
        screenshot('panel-scene-desktop')
        evaluate('Main.overview.show();')
        time.sleep(1.6)
        screenshot('panel-scene-overview')
        evaluate('Main.overview.hide();')
        for i in range(20):
            time.sleep(0.12)
            info = evaluate('''({fade:sceneSurface._panelFade.value,
                radius:sceneSurface._effect[sceneSurface._radiusProperty],
                groupOpacity:sceneSurface._group.opacity,
                reveal:sceneSurface._panelReveal?.value ?? 1,
                overviewVisible:Main.layoutManager.overviewGroup.visible,
                panelAlpha:Main.panel.get_theme_node().get_background_color().alpha,
                tintAlpha:sceneSurface._panelTint.get_theme_node().get_background_color().alpha})''')
            image = screenshot(f'panel-scene-exit-{i}')
            y = int(evaluate('Main.panel.height/2'))
            data = image.get_pixels()
            row = y*image.get_rowstride()
            colors = [sum(data[row+x*image.get_n_channels():row+x*image.get_n_channels()+3])/3
                      for x in range(260,580)]
            mean=sum(colors)/len(colors)
            info['contrast']=(sum((c-mean)**2 for c in colors)/len(colors))**0.5
            info['mean']=mean
            frames.append(info)
        results['panel-scene-exit'] = frames
        hidden = [f for f in frames if not f['overviewVisible']]
        shown = [f for f in frames if f['overviewVisible']]
        assert len(hidden) > 3 and hidden[-1]['reveal'] == 1, frames
        assert hidden[0]['contrast'] < hidden[-1]['contrast'] - 5, frames
        assert any(2 < f['contrast'] < hidden[-1]['contrast'] - 3 for f in hidden), frames
        assert abs(shown[-1]['mean'] - hidden[0]['mean']) < 15, frames
        check('panel-real-overview-input-crossfades', 'true')
    finally:
        evaluate('imports.gi.St.Settings.get().slow_down_factor=sceneSlow; '
                 'for (const [key,value] of sceneUris) sceneBackground.set_string(key,value); '
                 'testBackdrop.show();')
