"""Real Shell actors in the private session created by headless.py."""
import os
from pathlib import Path
import subprocess
import time


def test_surfaces(evaluate, check, screenshot, results):
    def wait(code, timeout=6):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if evaluate(code):
                return
            time.sleep(0.05)
        raise AssertionError(f'Timed out: {code}')

    def load(name, variable):
        evaluate(f'(async()=>{{globalThis.{variable}=await import("resource:///org/gnome/shell/ui/{name}.js");}})()')
        wait(f'typeof {variable} !== "undefined"')

    def toggle(key):
        evaluate(f'globalThis.toggleBox=findSoft("{key}").menu.box; '
                 f'globalThis.toggleStyle=findSoft("{key}")._originalBoxStyle; '
                 f'soft._settings.set_boolean("{key}",false);')
        check(f'{key}-toggle-restores-style',
              f'!findSoft("{key}") && toggleBox.get_style()===toggleStyle')
        evaluate(f'soft._settings.set_boolean("{key}",true);')
        wait(f'alignedSoft(findSoft("{key}"))')

    evaluate('globalThis.findSoft = key => [...soft._shellSurfaces._records.values()]'
             '.find(r=>r.key===key && r.surface)?.surface; '
             'globalThis.alignedSoft = s => {if(!s?._blur.mapped)return false; '
             'const a=[...s.menu.box.get_transformed_position(),...s.menu.box.get_transformed_size()];'
             'const b=[...s._blur.get_transformed_position(),...s._blur.get_transformed_size()];'
             'return a.every((v,i)=>Math.abs(v-b[i])<1);};')
    wait('!!findSoft("top-panel")')
    check('panel-blur-aligned', 'alignedSoft(findSoft("top-panel"))')
    check('panel-square-and-sharp', 'findSoft("top-panel")._cornerRadius()===0 && Main.panel.opacity===255')
    screenshot('surfaces-panel')
    check('panel-adwaita-dark-gray', '(() => {const c=findSoft("top-panel")._panelTint.get_theme_node().get_background_color(); return c.red===46 && c.green===46 && c.blue===50;})()')
    # Observe rendered frames in both directions, including interrupted opens.
    evaluate('globalThis.panelFrames=[]; globalThis.panelFrameId=global.stage.connect("after-paint",()=>{'
             'const s=findSoft("top-panel"); panelFrames.push({fade:s._panelFade.value, '
             'tint:s._panelTint.get_paint_opacity(), blur:s._blur.get_paint_opacity(), '
             'group:s._group.opacity, mapped:s._blur.mapped, panel:Main.panel.opacity});}); Main.overview.show();')
    time.sleep(0.6)
    check('panel-overview-fully-transparent', 'findSoft("top-panel")._panelFade.value===0 && !findSoft("top-panel")._group.visible && !findSoft("top-panel")._blur.mapped && Main.panel.get_theme_node().get_background_color().alpha===0')
    check('panel-overview-no-window-signals', 'findSoft("top-panel")._windows.size===0')
    screenshot('panel-overview-transparent')
    evaluate('soft._settings.set_boolean("top-panel",false); soft._settings.set_boolean("top-panel",true);')
    check('panel-enabled-in-overview-stays-transparent', 'findSoft("top-panel")._panelFade.value===0 && !findSoft("top-panel")._group.visible')
    evaluate('global.stage.disconnect(panelFrameId);')
    results['panel-overview-entry-frames'] = evaluate('panelFrames')
    entry = results['panel-overview-entry-frames']
    assert any(0 < f['group'] < 255 for f in entry), 'Entry must animate, not jump'
    assert all(f['tint'] == f['blur'] and f['panel'] == 255 for f in entry if f['mapped'])
    evaluate('panelFrames=[]; panelFrameId=global.stage.connect("after-paint",()=>{'
             'const s=findSoft("top-panel"); panelFrames.push({fade:s._panelFade.value, '
             'tint:s._panelTint.get_paint_opacity(), blur:s._blur.get_paint_opacity(), '
             'group:s._group.opacity, mapped:s._blur.mapped, panel:Main.panel.opacity});}); Main.overview.hide();')
    time.sleep(0.6)
    evaluate('global.stage.disconnect(panelFrameId);')
    results['panel-overview-exit-frames'] = evaluate('panelFrames')
    exit_frames = results['panel-overview-exit-frames']
    assert any(0 < f['group'] < 255 for f in exit_frames), 'Exit must animate, not jump'
    assert all(f['tint'] == f['blur'] and f['panel'] == 255 for f in exit_frames if f['mapped'])
    check('panel-overview-exit-restored', 'findSoft("top-panel")._panelFade.value===1 && alignedSoft(findSoft("top-panel"))')
    evaluate('Main.overview.show();')
    time.sleep(0.08)
    evaluate('Main.overview.hide();')
    time.sleep(0.7)
    check('panel-overview-interrupted-restored', 'findSoft("top-panel")._panelFade.value===1 && alignedSoft(findSoft("top-panel"))')
    evaluate('soft._settings.set_int("opacity",100);')
    time.sleep(0.4)
    check('panel-opaque-keeps-tint-only', 'findSoft("top-panel")._group.visible && findSoft("top-panel")._panelTint.mapped && !findSoft("top-panel")._blur.mapped && findSoft("top-panel")._windows.size===0')
    evaluate('soft._settings.set_int("opacity",55);')
    time.sleep(0.3)

    evaluate('globalThis.originalPanelStyle=findSoft("top-panel")._originalBoxStyle; '
             'soft._settings.set_boolean("top-panel",false);')
    check('panel-toggle-restores-style', '!findSoft("top-panel") && Main.panel.get_style()===originalPanelStyle')
    evaluate('soft._settings.set_boolean("top-panel",true);')
    time.sleep(0.3)

    load('modalDialog', 'SoftModal')
    evaluate('globalThis.testDialog=new SoftModal.ModalDialog({destroyOnClose:false}); '
             'testDialog.contentLayout.add_child(new imports.gi.St.Label({text:"Diálogo do sistema — beta"})); '
             'testDialog.addButton({label:"Fechar", action:()=>testDialog.close()}); testDialog.open();')
    time.sleep(0.3)
    check('dialog-discovered-and-aligned', 'alignedSoft(findSoft("system-dialogs"))')
    check('dialog-styles-visible-surface', 'findSoft("system-dialogs").menu.box.has_style_class_name("modal-dialog") && Math.abs(findSoft("system-dialogs").menu.box.get_theme_node().get_background_color().alpha-140)<=1')
    check('dialog-content-sharp', 'testDialog.contentLayout.opacity===255')
    screenshot('surfaces-dialog')
    toggle('system-dialogs')
    evaluate('testDialog.close();')
    check('dialog-close-hides-blur-immediately', '!findSoft("system-dialogs")._group.visible')
    time.sleep(0.2)
    evaluate('testDialog.open();')
    time.sleep(0.2)
    check('dialog-reopen-aligned', 'alignedSoft(findSoft("system-dialogs"))')
    evaluate('testDialog.close();')
    time.sleep(0.2)
    evaluate('testDialog.destroy();')
    check('dialog-destroy-cleanup', '!soft._shellSurfaces._records.has(testDialog)')

    load('messageTray', 'SoftTray')
    evaluate('imports.gi.Gio.Settings.new("org.gnome.desktop.notifications").set_boolean("show-banners",true); '
             'globalThis.testSource=new SoftTray.Source({title:"Soft beta"}); Main.messageTray.add(testSource); '
             'globalThis.testNotification=new SoftTray.Notification({source:testSource, title:"Notificação com blur", '
             'body:"Texto nítido sobre o fundo translúcido", urgency:SoftTray.Urgency.CRITICAL}); '
             'testSource.addNotification(testNotification);')
    wait('!!findSoft("notification-banners")')
    time.sleep(0.35)
    check('banner-discovered-and-aligned', 'alignedSoft(findSoft("notification-banners"))')
    check('banner-input-preserved', 'Main.messageTray._banner.reactive && Main.messageTray._banner.opacity===255')
    screenshot('surfaces-banner')
    toggle('notification-banners')
    evaluate('testNotification.destroy();')
    time.sleep(0.5)
    check('banner-destroy-cleanup', '![...soft._shellSurfaces._records.values()].some(r=>r.key==="notification-banners")')
    evaluate('imports.gi.Gio.Settings.new("org.gnome.desktop.notifications").set_boolean("show-banners",false);')

    # Configure one real app folder in the test session's private dconf.
    evaluate('globalThis.folderSettings=imports.gi.Gio.Settings.new("org.gnome.desktop.app-folders"); '
             'globalThis.previousFolders=folderSettings.get_strv("folder-children"); '
             'globalThis.betaFolder=new imports.gi.Gio.Settings({schema_id:"org.gnome.desktop.app-folders.folder", '
             'path:"/org/gnome/desktop/app-folders/folders/SoftBeta/"}); '
             'betaFolder.set_string("name","Soft beta"); '
             'betaFolder.set_strv("apps",imports.gi.Shell.AppSystem.get_default().get_installed().slice(0,4).map(a=>a.get_id())); '
             'folderSettings.set_strv("folder-children",["SoftBeta"]); Main.overview.showApps();')
    time.sleep(1)
    evaluate('globalThis.folderFrames=[]; globalThis.folderFrameId=global.stage.connect("after-paint",()=>{const s=findSoft("app-folders");if(s?.menu.isOpen && s.menu.box.get_paint_opacity()>0)folderFrames.push(alignedSoft(s));}); '
             'globalThis.appDisplay=Main.overview._overview.controls._appDisplay; '
             'globalThis.folderIcon=appDisplay._folderIcons.find(i=>i.id==="SoftBeta") ?? appDisplay._folderIcons[0]; '
             'folderIcon.open();')
    time.sleep(0.5)
    evaluate('global.stage.disconnect(folderFrameId);')
    results['folder-opening-frames-aligned'] = evaluate('folderFrames')
    assert results['folder-opening-frames-aligned'] and all(results['folder-opening-frames-aligned'])
    check('folder-discovered-and-aligned', 'alignedSoft(findSoft("app-folders"))')
    screenshot('surfaces-folder')
    toggle('app-folders')
    evaluate('folderIcon._dialog.popdown();')
    check('folder-close-hides-blur-immediately', '!findSoft("app-folders")._group.visible')
    time.sleep(0.3)
    evaluate('Main.overview.hide(); folderSettings.set_strv("folder-children",previousFolders);')
    time.sleep(0.5)

    load('altTab', 'SoftAltTab')
    env = dict(os.environ, WAYLAND_DISPLAY='wayland-0', GDK_BACKEND='wayland')
    windows = subprocess.Popen(['gjs', '-m', str(Path(__file__).with_name('surface-windows.js'))],
                               env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait('global.get_window_actors().length>=2')
        for class_name in ['WindowSwitcherPopup', 'AppSwitcherPopup']:
            evaluate(f'globalThis.testSwitcher=new SoftAltTab.{class_name}(); '
                     'testSwitcher.show(false,"switch-windows",0);')
            time.sleep(0.3)
            check(f'{class_name}-discovered-and-aligned', 'alignedSoft(findSoft("window-switcher"))')
            check(f'{class_name}-sharp-content', 'testSwitcher._switcherList.opacity===255')
            screenshot(f'surfaces-{class_name}')
            toggle('window-switcher')
            evaluate('testSwitcher.fadeAndDestroy();')
            time.sleep(0.3)
            check(f'{class_name}-destroy-cleanup', '![...soft._shellSurfaces._records.values()].some(r=>r.key==="window-switcher")')
    finally:
        windows.terminate()
        windows.wait(timeout=5)

    # Independent switches, resource recovery, and no frame-driving timer.
    evaluate('globalThis.panelEffect=findSoft("top-panel")._effect; '
             'findSoft("top-panel")._sleeping=true; findSoft("top-panel")._recover();')
    check('panel-sleep-hidden', '!findSoft("top-panel")._group.visible')
    evaluate('findSoft("top-panel")._sleeping=false; findSoft("top-panel")._recover();')
    check('panel-resume-recreated', 'findSoft("top-panel")._effect!==panelEffect')
    time.sleep(1)
    evaluate('globalThis.surfaceFrames=0; globalThis.surfaceFrameId=global.stage.connect("after-paint",()=>surfaceFrames++);')
    time.sleep(1.5)
    results['surfaces-idle-frames'] = evaluate('surfaceFrames')
    evaluate('global.stage.disconnect(surfaceFrameId);')
    assert results['surfaces-idle-frames'] <= 2
