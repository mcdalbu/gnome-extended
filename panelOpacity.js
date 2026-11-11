// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Signals} from './signals.js';

// Observe window state only while the current color scheme enables the rule.
// This is separate from blur damage tracking: an opaque blur stops tracking
// damage, but must still notice a window being restored or minimized.
export class PanelOpacity {
    constructor(settings, panel, changed) {
        this._settings = settings;
        this._panel = panel;
        this._changed = changed;
        this._signals = new Signals();
        this._tracking = new Signals();
        this._windows = new Map();
        this._enabled = false;
        this._later = 0;
        this.opaque = false;
    }

    start() {
        this._signals.connect(St.Settings.get(), 'notify::color-scheme', () => this.sync());
        this.sync();
    }

    sync() {
        this._cancelRefresh();
        const light = St.Settings.get().color_scheme === St.SystemColorScheme.PREFER_LIGHT;
        const enabled = this._settings.get_boolean('top-panel') &&
            this._settings.get_boolean(light ? 'panel-opaque-light' : 'panel-opaque-dark');
        if (enabled !== this._enabled) {
            this._enabled = enabled;
            if (enabled) {
                this._tracking.connect(global.display, 'window-created', (_display, window) => {
                    this._watch(window);
                    this._queueRefresh();
                });
                this._tracking.connect(global.display, 'window-entered-monitor', () => this._queueRefresh());
                this._tracking.connect(global.workspace_manager, 'active-workspace-changed', () => this._queueRefresh());
                this._tracking.connect(Main.layoutManager, 'monitors-changed', () => this._queueRefresh());
                this._tracking.connect(this._panel, 'notify::allocation', () => this._queueRefresh());
                for (const actor of global.get_window_actors())
                    this._watch(actor.get_meta_window());
            } else {
                this._tracking.clear();
                for (const signals of this._windows.values())
                    signals.clear();
                this._windows.clear();
            }
        }
        this._refresh();
    }

    _watch(window) {
        if (!window || this._windows.has(window))
            return;
        const signals = new Signals();
        this._windows.set(window, signals);
        for (const signal of ['notify::maximized-horizontally', 'notify::maximized-vertically',
            'notify::fullscreen', 'notify::minimized', 'notify::on-all-workspaces',
            'workspace-changed', 'position-changed', 'size-changed'])
            signals.connect(window, signal, () => this._queueRefresh());
        signals.connect(window, 'unmanaged', () => {
            this._windows.delete(window);
            signals.clear();
            this._queueRefresh();
        });
    }

    _cancelRefresh() {
        if (this._later)
            global.compositor.get_laters().remove(this._later);
        this._later = 0;
    }

    _queueRefresh() {
        if (!this._enabled || this._later)
            return;
        this._later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._later = 0;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    _qualifies(window, workspace, monitor) {
        if (window.minimized || window.get_monitor() !== monitor || !window.located_on_workspace(workspace))
            return false;
        const type = window.get_window_type();
        if (![Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG].includes(type))
            return false;
        return window.is_fullscreen() || (window.maximized_horizontally && window.maximized_vertically);
    }

    _refresh() {
        const workspace = global.workspace_manager.get_active_workspace();
        const monitor = Main.layoutManager.findMonitorForActor(this._panel)?.index ?? Main.layoutManager.primaryIndex;
        const opaque = this._enabled && [...this._windows.keys()]
            .some(window => this._qualifies(window, workspace, monitor));
        if (opaque === this.opaque)
            return;
        this.opaque = opaque;
        this._changed();
    }

    destroy() {
        this._cancelRefresh();
        this._signals.clear();
        this._tracking.clear();
        for (const signals of this._windows.values())
            signals.clear();
        this._windows.clear();
        this._changed = null;
        this._settings = null;
    }
}
