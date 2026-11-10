// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {PtyxisOpacity} from './ptyxisOpacity.js';
import {syncSettingsLauncher} from './settingsLauncher.js';
import {saveSidebarStyle} from './sidebarStyle.js';
import {WindowSurfaces} from './windowSurfaces.js';
import {DockSurfaces} from './dockSurfaces.js';
import {AppGrid} from './appGrid.js';
import {SoftSurface} from './softSurface.js';
import {Signals} from './signals.js';
import {ShellSurfaces} from './shellSurfaces.js';
import {ShellBackgrounds} from './shellBackgrounds.js';

export default class GnomeExtended extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._opacityWriteId = 0;
        this._signals = new Signals();
        this._surfaces = new Map();
        this._shellSurfaces = new ShellSurfaces(this._settings);
        this._backgrounds = new ShellBackgrounds(this._settings);
        this._docks = new DockSurfaces(this._settings);
        this._ptyxisOpacity = new PtyxisOpacity(this._settings);
        this._windowSurfaces = new WindowSurfaces(this._settings);
        this._signals.connect(this._settings, 'changed', (_settings, key) => this._sync(key));
        this._signals.connect(Main.layoutManager, 'startup-complete', () => this._sync());
        try {
            this._shellSurfaces.start();
            this._backgrounds.start();
            this._docks.start();
            this._windowSurfaces.start();
            this._ptyxisOpacity.start();
            this._appGrid = new AppGrid(this.getSettings('org.gnome.shell.extensions.app-grid-extended'));
            this._appGrid.start();
            this._sync();
        } catch (error) {
            this.disable();
            throw error;
        }
    }

    _sync(key) {
        const changed = (...keys) => !key || keys.includes(key);
        const effectOnly = ['blur-radius', 'brightness', 'blur-rate'].includes(key);
        const appearance = changed('opacity', 'blur-radius', 'brightness', 'blur-rate');
        if (changed('windows-settings-sidebar')) {
            try {
                syncSettingsLauncher(this._settings);
            } catch (error) {
                logError(error, 'GNOME Extended: lançador do Configurações');
            }
        }
        if (changed('windows-settings-sidebar', 'windows-nautilus-sidebar', 'windows-app-menus'))
            this._saveGtkStyle();
        if (key === 'windows-ptyxis')
            this._savePtyxisOpacity();
        if (key === 'opacity')
            this._queueOpacityWrites();
        if (appearance || changed('top-panel', 'panel-enabled-dark', 'panel-enabled-light',
            'panel-opaque-dark', 'panel-opaque-light', 'system-dialogs', 'notification-banners',
            'app-folders', 'window-switcher', 'osd-windows', 'workspace-switcher',
            'screenshot-ui', 'popup-menus'))
            this._shellSurfaces.sync(effectOnly);
        if (changed('overview-background', 'lock-screen', 'blur-radius', 'brightness'))
            this._backgrounds.sync();
        if (appearance || changed('docks', 'dock-transparent-in-overview'))
            this._docks.sync(effectOnly);
        if (effectOnly || changed('windows-blur', 'windows-ptyxis', 'windows-app-menus'))
            this._windowSurfaces.sync(effectOnly);

        const targets = [
            ['notifications', Main.panel.statusArea.dateMenu?.menu],
            ['quick-settings', Main.panel.statusArea.quickSettings?.menu],
        ];
        for (const [target, menu] of targets) {
            if (!appearance && !changed(target))
                continue;
            const current = this._surfaces.get(target);
            const enabled = this._settings.get_boolean(target) && menu?.actor && menu?.box;
            if (current && (!enabled || current.menu !== menu)) {
                current.destroy();
                this._surfaces.delete(target);
            }
            if (!enabled)
                continue;
            if (!this._surfaces.has(target)) {
                const surface = new SoftSurface(menu, this._settings, target,
                    () => this._surfaces.delete(target));
                this._surfaces.set(target, surface);
            } else {
                current.update(effectOnly);
            }
        }
    }

    _gtkStyleEnabled() {
        return ['windows-settings-sidebar', 'windows-nautilus-sidebar', 'windows-app-menus']
            .some(key => this._settings.get_boolean(key));
    }

    _queueOpacityWrites() {
        if (!this._gtkStyleEnabled() && !this._settings.get_boolean('windows-ptyxis'))
            return;
        if (this._opacityWriteId)
            GLib.Source.remove(this._opacityWriteId);
        this._opacityWriteId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            this._opacityWriteId = 0;
            this._writeOpacity();
            return GLib.SOURCE_REMOVE;
        });
    }

    _writeOpacity() {
        if (this._gtkStyleEnabled())
            this._saveGtkStyle();
        if (this._settings.get_boolean('windows-ptyxis'))
            this._savePtyxisOpacity();
    }

    _saveGtkStyle() {
        try {
            saveSidebarStyle(this._settings);
        } catch (error) {
            logError(error, 'GNOME Extended: estilos GTK');
        }
    }

    _savePtyxisOpacity() {
        try {
            this._ptyxisOpacity.sync();
        } catch (error) {
            logError(error, 'GNOME Extended: opacidade do Ptyxis');
        }
    }

    disable() {
        if (this._opacityWriteId) {
            GLib.Source.remove(this._opacityWriteId);
            this._opacityWriteId = 0;
            this._writeOpacity();
        }
        this._ptyxisOpacity?.destroy();
        this._ptyxisOpacity = null;
        this._windowSurfaces?.destroy();
        this._windowSurfaces = null;
        this._docks?.destroy();
        this._docks = null;
        this._appGrid?.destroy();
        this._appGrid = null;
        this._signals?.clear();
        this._backgrounds?.destroy();
        this._backgrounds = null;
        this._shellSurfaces?.destroy();
        this._shellSurfaces = null;
        for (const surface of this._surfaces?.values() ?? [])
            surface.destroy();
        this._surfaces?.clear();
        this._signals = null;
        this._surfaces = null;
        this._settings = null;
    }
}
