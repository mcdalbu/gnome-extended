// SPDX-License-Identifier: GPL-2.0-or-later
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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
        this._signals = new Signals();
        this._surfaces = new Map();
        this._shellSurfaces = new ShellSurfaces(this._settings);
        this._backgrounds = new ShellBackgrounds(this._settings);
        this._docks = new DockSurfaces(this._settings);
        this._windowSurfaces = new WindowSurfaces(this._settings);
        this._signals.connect(this._settings, 'changed', () => this._sync());
        this._signals.connect(Main.layoutManager, 'startup-complete', () => this._sync());
        try {
            this._shellSurfaces.start();
            this._backgrounds.start();
            this._docks.start();
            this._windowSurfaces.start();
            this._appGrid = new AppGrid(this.getSettings('org.gnome.shell.extensions.app-grid-extended'));
            this._appGrid.start();
            this._sync();
        } catch (error) {
            this.disable();
            throw error;
        }
    }

    _sync() {
        try {
            saveSidebarStyle(this._settings);
        } catch (error) {
            logError(error, 'GNOME Extended: estilo da barra lateral do Arquivos');
        }
        this._shellSurfaces.sync();
        this._backgrounds.sync();
        this._docks.sync();
        this._windowSurfaces.sync();
        const targets = [
            ['notifications', Main.panel.statusArea.dateMenu?.menu],
            ['quick-settings', Main.panel.statusArea.quickSettings?.menu],
        ];
        for (const [key, menu] of targets) {
            const current = this._surfaces.get(key);
            const enabled = this._settings.get_boolean(key) && menu?.actor && menu?.box;
            if (current && (!enabled || current.menu !== menu)) {
                current.destroy();
                this._surfaces.delete(key);
            }
            if (!enabled)
                continue;
            if (!this._surfaces.has(key)) {
                const surface = new SoftSurface(menu, this._settings, key,
                    () => this._surfaces.delete(key));
                this._surfaces.set(key, surface);
            } else {
                this._surfaces.get(key).update();
            }
        }
    }

    disable() {
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
