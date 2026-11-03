// SPDX-License-Identifier: GPL-2.0-or-later
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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
        this._signals.connect(this._settings, 'changed', () => this._sync());
        this._signals.connect(Main.layoutManager, 'startup-complete', () => this._sync());
        try {
            this._shellSurfaces.start();
            this._backgrounds.start();
            this._sync();
        } catch (error) {
            this.disable();
            throw error;
        }
    }

    _sync() {
        this._shellSurfaces.sync();
        this._backgrounds.sync();
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
