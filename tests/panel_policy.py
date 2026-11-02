"""Automatic panel opacity with real Meta.Windows in a private Shell session."""
import os
from pathlib import Path
import subprocess
import time


def test_panel_policy(evaluate, check, screenshot, results):
    def wait(code, timeout=7):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if evaluate(code):
                return
            time.sleep(0.05)
        raise AssertionError(f'Timed out: {code}')

    def settle():
        time.sleep(0.35)
        evaluate('global.stage.queue_redraw();')
        time.sleep(0.1)

    def panel_pixel(name):
        image = screenshot(name)
        data = image.get_pixels()
        y = int(evaluate('Main.panel.height/2'))
        offset = y * image.get_rowstride() + 300 * image.get_n_channels()
        return sum(data[offset:offset+3]) / 3

    evaluate('globalThis.policyInterface=imports.gi.Gio.Settings.new("org.gnome.desktop.interface"); '
             'globalThis.originalPolicyScheme=policyInterface.get_string("color-scheme"); '
             'policyInterface.set_string("color-scheme","prefer-dark"); '
             'soft._settings.set_boolean("panel-opaque-dark",true); '
             'soft._settings.set_boolean("panel-opaque-light",false); '
             'globalThis.policyPanel=()=>findSoft("top-panel");')
    wait('imports.gi.St.Settings.get().color_scheme===imports.gi.St.SystemColorScheme.PREFER_DARK')
    evaluate('globalThis.policyColorIs=(r,g,b,a)=>{const c=policyPanel()._panelTint.get_theme_node().get_background_color();return c.red===r && c.green===g && c.blue===b && Math.abs(c.alpha-a)<=1;};')
    evaluate('globalThis.policyStrip=new imports.gi.St.Widget({x:0,y:0,width:1440,height:Main.panel.height,style:"background-color:#b0b0b0;"});testBackdrop.add_child(policyStrip);')
    settle()
    check('panel-color-dark-transparent-gray', 'policyColorIs(46,46,50,140)')
    initial = panel_pixel('panel-fade-gray-start')
    evaluate('soft._settings.set_int("opacity",100);')
    time.sleep(0.05)
    entering = panel_pixel('panel-fade-toward-black')
    settle()
    black = panel_pixel('panel-fade-black-settled')
    check('panel-color-dark-manual-opaque-black', 'policyColorIs(0,0,0,255)')
    assert black + 3 < entering < initial - 3, f'Opaque fade jumped: {initial}, {entering}, {black}'
    results['panel-tint-fade-to-black'] = {'start':initial,'middle':entering,'end':black}
    evaluate('soft._settings.set_int("opacity",55);')
    time.sleep(0.05)
    leaving = panel_pixel('panel-fade-toward-gray')
    settle()
    gray = panel_pixel('panel-fade-gray-settled')
    check('panel-color-dark-manual-transparency-restores-gray', 'policyColorIs(46,46,50,140)')
    assert black + 3 < leaving < gray - 3, f'Transparent fade jumped: {black}, {leaving}, {gray}'
    results['panel-tint-fade-to-gray'] = {'start':black,'middle':leaving,'end':gray}
    evaluate('soft._settings.set_int("opacity",100);')
    time.sleep(0.08)
    evaluate('soft._settings.set_int("opacity",55);')
    settle()
    check('panel-tint-interrupted-fade-restores-gray', 'policyColorIs(46,46,50,140) && policyPanel()._blur.mapped')
    env = dict(os.environ, WAYLAND_DISPLAY='wayland-0', GDK_BACKEND='wayland')
    process = subprocess.Popen(['gjs', '-m', str(Path(__file__).with_name('surface-windows.js'))],
                               env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait('global.get_window_actors().some(a=>a.get_meta_window()?.get_title()==="Soft blur test — one")')
        evaluate('globalThis.policyWindow=global.get_window_actors().map(a=>a.get_meta_window()).find(w=>w.get_title()==="Soft blur test — one");')
        settle()
        check('panel-policy-normal-transparent', '!policyPanel()._panelPolicy.opaque && policyPanel()._panelAlpha===0.55 && policyPanel()._blur.mapped')
        evaluate('policyWindow.maximize();')
        wait('policyPanel()._panelPolicy.opaque')
        settle()
        check('panel-policy-dark-maximized-opaque', 'policyPanel()._panelTint.get_theme_node().get_background_color().alpha===255 && !policyPanel()._blur.mapped && policyPanel()._windows.size===0')
        check('panel-color-dark-maximized-black', 'policyColorIs(0,0,0,255)')
        screenshot('panel-policy-dark-maximized')
        evaluate('policyInterface.set_string("color-scheme","prefer-light");')
        wait('imports.gi.St.Settings.get().color_scheme===imports.gi.St.SystemColorScheme.PREFER_LIGHT && !policyPanel()._panelPolicy.opaque')
        settle()
        check('panel-policy-light-keeps-blur', 'policyPanel()._panelAlpha===0.55 && policyPanel()._blur.mapped && policyPanel()._panelPolicy._windows.size===0')
        screenshot('panel-policy-light-maximized')
        evaluate('soft._settings.set_boolean("panel-opaque-light",true);')
        wait('policyPanel()._panelPolicy.opaque')
        check('panel-policy-light-option-independent', 'policyPanel()._panelAlpha===1')
        check('panel-color-light-opaque-keeps-theme', 'policyColorIs(...policyPanel()._panelColor,255)')
        evaluate('soft._settings.set_boolean("panel-opaque-dark",false);policyInterface.set_string("color-scheme","prefer-dark");')
        wait('imports.gi.St.Settings.get().color_scheme===imports.gi.St.SystemColorScheme.PREFER_DARK && !policyPanel()._panelPolicy.opaque')
        check('panel-policy-dark-can-stay-transparent', 'policyPanel()._panelAlpha===0.55')
        evaluate('soft._settings.set_boolean("panel-opaque-dark",true);soft._settings.set_boolean("panel-opaque-light",false);policyWindow.unmaximize();')
        wait('!policyPanel()._panelPolicy.opaque')
        check('panel-policy-unmaximize-restores-alpha', 'policyPanel()._panelAlpha===0.55')
        check('panel-color-unmaximize-restores-gray', 'policyColorIs(46,46,50,140)')
        evaluate('policyWindow.make_fullscreen();')
        wait('policyPanel()._panelPolicy.opaque')
        check('panel-policy-fullscreen-opaque', 'policyPanel()._panelAlpha===1')
        check('panel-color-fullscreen-black', 'policyColorIs(0,0,0,255)')
        evaluate('policyWindow.unmake_fullscreen();')
        wait('!policyPanel()._panelPolicy.opaque')
        evaluate('policyWindow.maximize();')
        wait('policyPanel()._panelPolicy.opaque')
        evaluate('Main.overview.show();')
        time.sleep(0.6)
        check('panel-policy-overview-fade-preserved', 'policyPanel()._panelPolicy.opaque && policyPanel()._panelFade.value===0 && !policyPanel()._group.visible')
        evaluate('Main.overview.hide();')
        time.sleep(0.6)
        check('panel-policy-overview-exit-opaque', 'policyPanel()._panelAlpha===1 && policyPanel()._group.visible')
        evaluate('policyWindow.minimize();')
        wait('!policyPanel()._panelPolicy.opaque')
        check('panel-policy-minimize-restores-alpha', 'policyPanel()._panelAlpha===0.55')
        check('panel-color-minimize-restores-gray', 'policyColorIs(46,46,50,140)')
        evaluate('policyWindow.unminimize();')
        wait('policyPanel()._panelPolicy.opaque')
        evaluate('globalThis.originalPolicyWorkspace=global.workspace_manager.get_active_workspace(); '
                 'if(global.workspace_manager.n_workspaces<2)global.workspace_manager.append_new_workspace(false,global.get_current_time()); '
                 'globalThis.otherPolicyWorkspace=global.workspace_manager.get_workspace_by_index(1); '
                 'policyWindow.change_workspace(otherPolicyWorkspace);')
        wait('!policyPanel()._panelPolicy.opaque')
        check('panel-policy-other-workspace-ignored', 'policyPanel()._panelAlpha===0.55')
        evaluate('otherPolicyWorkspace.activate(global.get_current_time());')
        wait('policyPanel()._panelPolicy.opaque')
        check('panel-policy-workspace-switch-updates', 'policyPanel()._panelAlpha===1')
        evaluate('originalPolicyWorkspace.activate(global.get_current_time());policyWindow.change_workspace(originalPolicyWorkspace);')
        wait('policyPanel()._panelPolicy.opaque')
        # Logical monitor mismatch: the predicate must ignore an otherwise
        # qualifying window on another monitor, without changing physical outputs.
        check('panel-policy-other-monitor-ignored', '!policyPanel()._panelPolicy._qualifies(policyWindow,originalPolicyWorkspace,policyWindow.get_monitor()+1)')
    finally:
        process.terminate()
        process.wait(timeout=5)
    wait('!policyPanel()._panelPolicy.opaque')
    check('panel-policy-window-close-restores-alpha', 'policyPanel()._panelAlpha===0.55')
    check('panel-color-window-close-restores-gray', 'policyColorIs(46,46,50,140)')
    evaluate('soft._settings.set_boolean("panel-opaque-dark",false);soft._settings.set_boolean("panel-opaque-light",false); '
             'policyInterface.set_string("color-scheme",originalPolicyScheme);')
    check('panel-policy-disabled-releases-window-signals', 'policyPanel()._panelPolicy._windows.size===0')
    evaluate('policyStrip.destroy();')
