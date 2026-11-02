"""Additional surfaces; runs only in the private D-Bus/Wayland test session."""
import time

KEYS = ['osd-windows', 'workspace-switcher', 'screenshot-ui', 'popup-menus',
        'overview-background', 'lock-screen']


def test_remaining(evaluate, check, screenshot, results):
    def wait(code, timeout=7):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if evaluate(code):
                return
            time.sleep(0.05)
        raise AssertionError(f'Timed out: {code}')

    def load(name, variable):
        evaluate(f'(async()=>{{globalThis.{variable}=await import("resource:///org/gnome/shell/ui/{name}.js");}})()')
        wait(f'typeof {variable}!=="undefined"')

    def toggle(key):
        evaluate(f'globalThis.extraBox=findSoft("{key}").menu.box; '
                 f'globalThis.extraStyle=findSoft("{key}")._originalBoxStyle; '
                 f'soft._settings.set_boolean("{key}",false);')
        check(f'{key}-disable-restores-style', f'!findSoft("{key}") && extraBox.get_style()===extraStyle')
        evaluate('globalThis.nativeRadii=[0,1,2,3].map(c=>extraBox.get_theme_node().get_border_radius(c));')
        evaluate(f'soft._settings.set_boolean("{key}",true);')
        wait(f'alignedSoft(findSoft("{key}"))')
        check(f'{key}-native-corners-preserved', '(() => {const s=findSoft("__KEY__");return !s._boxSuffix.includes("border-radius") && [0,1,2,3].every(c=>s.menu.box.get_theme_node().get_border_radius(c)===nativeRadii[c]);})()'.replace('__KEY__', key))
        results[f'{key}-native-radii'] = evaluate('nativeRadii')
        check(f'{key}-blur-corners-follow-theme', '(() => {const s=findSoft("__KEY__");if(!s._hasCorners)return true; const b=s.menu.box; const a=s._blur; const scale=Math.min(a.width/b.width,a.height/b.height);return s._effect.corner_radius===Math.round(Math.min(Math.max(...nativeRadii)*scale,a.width/2,a.height/2));})()'.replace('__KEY__', key))

    check('remaining-options-default-off', '!["osd-windows","workspace-switcher","screenshot-ui","popup-menus","overview-background","lock-screen"].some(k=>soft._settings.get_boolean(k))')
    evaluate('["osd-windows","workspace-switcher","screenshot-ui","popup-menus"].forEach(k=>soft._settings.set_boolean(k,true));')
    # OSD contains a level bar and icon, with the native visibility timer intact.
    evaluate('Main.osdWindowManager._showOsdWindow(0,new imports.gi.Gio.ThemedIcon({name:"audio-volume-high-symbolic"}),"Soft beta",0.65,1);')
    wait('alignedSoft(findSoft("osd-windows"))')
    screenshot('remaining-osd')
    check('osd-foreground-sharp', 'findSoft("osd-windows").menu.box.opacity===255')
    toggle('osd-windows')
    evaluate('Main.osdWindowManager.hideAll();')
    time.sleep(0.3)
    check('osd-close-hides-blur', '!findSoft("osd-windows")._blur.mapped')

    load('workspaceSwitcherPopup', 'SoftWorkspace')
    evaluate('globalThis.extraWorkspace=new SoftWorkspace.WorkspaceSwitcherPopup();extraWorkspace.display(0);')
    wait('alignedSoft(findSoft("workspace-switcher"))')
    check('workspace-all-visible-monitors-aligned', '[...soft._shellSurfaces._records.values()].filter(r=>r.key==="workspace-switcher").every(r=>alignedSoft(r.surface))')
    screenshot('remaining-workspaces')
    toggle('workspace-switcher')
    evaluate('extraWorkspace.destroy();')
    check('workspace-destroy-cleanup', '![...soft._shellSurfaces._records.values()].some(r=>r.key==="workspace-switcher")')

    load('popupMenu', 'SoftPopup')
    evaluate('globalThis.extraMenu=new SoftPopup.PopupMenu(Main.panel,0.5,imports.gi.St.Side.TOP); '
             'extraMenu.addMenuItem(new SoftPopup.PopupMenuItem("Menu do Shell — blur")); '
             'Main.uiGroup.add_child(extraMenu.actor);extraMenu.open();')
    wait('alignedSoft(findSoft("popup-menus"))')
    check('popup-main-menus-not-duplicated', '![...soft._shellSurfaces._records.values()].some(r=>r.key==="popup-menus" && (r.actor===Main.panel.statusArea.dateMenu.menu.actor || r.actor===Main.panel.statusArea.quickSettings.menu.actor))')
    screenshot('remaining-popup')
    toggle('popup-menus')
    evaluate('extraMenu.close();')
    check('popup-close-hides-blur', '!findSoft("popup-menus")._group.visible')
    evaluate('extraMenu.destroy();')
    check('popup-destroy-cleanup', '!soft._shellSurfaces._records.has(extraMenu.actor)')

    # Open the real capture UI, but do not take a picture or start a recording.
    evaluate('(async()=>{await Main.screenshotUI.open();globalThis.extraCaptureOpened=true;})()')
    wait('typeof extraCaptureOpened!=="undefined" && alignedSoft(findSoft("screenshot-ui"))')
    evaluate('globalThis.captureContent=Main.screenshotUI._stageScreenshot.get_content();')
    screenshot('remaining-screenshot-ui')
    toggle('screenshot-ui')
    check('screenshot-source-unmodified', 'captureContent===Main.screenshotUI._stageScreenshot.get_content()')
    evaluate('Main.screenshotUI.close(true);')
    check('screenshot-close-hides-blur', '!findSoft("screenshot-ui")._blur.mapped')

    evaluate('soft._settings.set_boolean("overview-background",true);Main.overview.show();')
    time.sleep(0.7)
    check('overview-wallpaper-mapped', 'soft._backgrounds._overviewGroup.mapped && soft._backgrounds._overviewGroup.opacity===255')
    check('overview-native-actor-blur', 'soft._backgrounds._overviewEffects.length===Main.layoutManager.monitors.length && soft._backgrounds._overviewEffects.every(e=>e.mode===imports.gi.Shell.BlurMode.ACTOR)')
    check('overview-foreground-sharp', 'Main.overview._overview.get_effect("soft-overview-blur")===null && Main.overview._overview.opacity===255')
    screenshot('remaining-overview')
    evaluate('Main.overview.searchEntry.set_text("settings");')
    time.sleep(0.5)
    check('search-wallpaper-mapped', 'soft._backgrounds._overviewGroup.mapped && Main.overview.searchEntry.opacity===255')
    screenshot('remaining-search')
    evaluate('Main.overview.searchEntry.set_text("");soft._settings.set_boolean("overview-background",false);')
    check('overview-disable-cleanup', '!soft._backgrounds._overviewGroup && soft._backgrounds._overviewManagers.length===0')
    evaluate('Main.overview.hide();')
    time.sleep(0.5)

    # Construct the real unlock actor in the hidden shield container. Never call
    # lock(), activate(), open(), or request an authentication prompt.
    load('unlockDialog', 'SoftUnlock')
    evaluate('globalThis.extraUnlock=new SoftUnlock.UnlockDialog(Main.screenShield._lockDialogGroup); '
             'globalThis.lockWidget=extraUnlock._backgroundGroup.get_children()[0]; '
             'globalThis.nativeLockEffect=lockWidget.get_effect("blur"); '
             'globalThis.nativeLockValues={enabled:nativeLockEffect.enabled, brightness:nativeLockEffect.brightness, radius:nativeLockEffect.radius??nativeLockEffect.sigma}; '
             'soft._settings.set_boolean("lock-screen",true);')
    check('lock-custom-effect-attached', '!nativeLockEffect.enabled && !!lockWidget.get_effect("soft-lock-screen-blur")')
    evaluate('soft._settings.set_int("blur-radius",42);soft._settings.set_int("brightness",73);')
    check('lock-custom-values', '(() => {const e=lockWidget.get_effect("soft-lock-screen-blur");const scale=imports.gi.St.ThemeContext.get_for_stage(global.stage).scale_factor;return Math.abs(e.brightness-0.73)<0.001 && (e.radius??e.sigma*2)===42*scale;})()')
    check('lock-native-values-preserved', 'nativeLockEffect.brightness===nativeLockValues.brightness && (nativeLockEffect.radius??nativeLockEffect.sigma)===nativeLockValues.radius')
    # Eval is intentionally unavailable while in unlock mode. Schedule the
    # observations and return to user mode in the same private Shell call.
    evaluate('imports.gi.GLib.timeout_add_once(imports.gi.GLib.PRIORITY_DEFAULT,400,()=>{try {'
             'globalThis.unlockChecks={enabled:Main.extensionManager.lookup("gnome-shell-soft@local").state===1 && !!soft._backgrounds,'
             'hidden:[...soft._shellSurfaces._records.values()].every(r=>!r.surface || !r.surface._group.visible)};'
             '}finally{Main.sessionMode.popMode("unlock-dialog");}});Main.sessionMode.pushMode("unlock-dialog");')
    time.sleep(0.9)
    check('extension-active-in-unlock-mode', 'unlockChecks.enabled')
    check('regular-surfaces-hidden-in-unlock-mode', 'unlockChecks.hidden')
    evaluate('soft._settings.set_boolean("lock-screen",false);')
    check('lock-disable-restores-native', '!lockWidget.get_effect("soft-lock-screen-blur") && nativeLockEffect.enabled===nativeLockValues.enabled')
    evaluate('extraUnlock.destroy();soft._settings.set_int("blur-radius",30);soft._settings.set_int("brightness",85);')
    check('lock-destroy-cleanup', 'soft._backgrounds._locks.size===0')

    for key in KEYS:
        evaluate(f'soft._settings.set_boolean("{key}",false);')
    time.sleep(1)
    evaluate('globalThis.extraFrames=0;globalThis.extraFrameId=global.stage.connect("after-paint",()=>extraFrames++);')
    time.sleep(1.5)
    results['remaining-idle-frames'] = evaluate('extraFrames')
    evaluate('global.stage.disconnect(extraFrameId);')
    assert results['remaining-idle-frames'] <= 2
