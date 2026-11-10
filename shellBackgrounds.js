// SPDX-License-Identifier: GPL-2.0-or-later
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';

import {applyBlurParameters} from './blurBackend.js';
import {Signals} from './signals.js';

const radiusProperty = Shell.BlurEffect.list_properties().some(p => p.name === 'radius') ? 'radius' : 'sigma';

// Wallpaper-only effects use ACTOR mode: they never sample windows or obscure
// foreground controls, and do not need the dynamic framebuffer redraw guard.
export class ShellBackgrounds {
    constructor(settings) {
        this._settings = settings;
        this._signals = new Signals();
        this._overviewSignals = new Signals();
        this._overviewManagers = [];
        this._overviewEffects = [];
        this._locks = new Map();
        this._appearance = new WeakMap();
        this._dialogs = new WeakSet();
        this._lockGroups = new WeakSet();
    }

    start() {
        this._signals.connect(Main.layoutManager, 'monitors-changed', () => {
            this._destroyOverview();
            this.sync();
        });
        this._signals.connect(St.ThemeContext.get_for_stage(global.stage), 'notify::scale-factor', () => this.sync());
        this._signals.connect(Main.overview, 'showing', () => this._syncOverview());
        this._signals.connect(Main.sessionMode, 'updated', () => this._scanLocks());
        const container = Main.screenShield?._lockDialogGroup;
        if (container) {
            const added = GObject.signal_lookup('child-added', container) ? 'child-added' : 'actor-added';
            this._signals.connect(container, added, (_group, dialog) => this._watchDialog(dialog));
        }
        this.sync();
    }

    _effect() {
        const effect = new Shell.BlurEffect({mode: Shell.BlurMode.ACTOR});
        this._updateEffect(effect);
        return effect;
    }

    _updateEffect(effect) {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const radius = this._settings.get_int('blur-radius');
        const brightness = this._settings.get_int('brightness');
        const appearance = `${radius}:${scale}:${brightness}`;
        if (this._appearance.get(effect) === appearance)
            return;
        applyBlurParameters(effect, radiusProperty, radius, scale, brightness);
        this._appearance.set(effect, appearance);
    }

    _syncOverview() {
        if (!this._settings.get_boolean('overview-background')) {
            this._destroyOverview();
            return;
        }
        const controls = Main.overview._overview?.controls;
        const adjustment = controls?._stateAdjustment;
        if (!this._overviewGroup && adjustment) {
            this._overviewGroup = new Meta.BackgroundGroup({name: 'soft-overview-wallpaper'});
            this._overviewSignals.connect(this._overviewGroup, 'destroy', () => {
                this._overviewGroup = null;
                this._destroyOverview();
            });
            Main.layoutManager.overviewGroup.insert_child_at_index(this._overviewGroup, 0);
            for (const [monitorIndex, monitor] of Main.layoutManager.monitors.entries()) {
                const widget = new St.Widget({x: monitor.x, y: monitor.y,
                    width: monitor.width, height: monitor.height, reactive: false});
                this._overviewGroup.add_child(widget);
                const effect = this._effect();
                widget.add_effect_with_name('soft-overview-blur', effect);
                this._overviewEffects.push(effect);
                this._overviewManagers.push(new Background.BackgroundManager({
                    container: widget, monitorIndex, controlPosition: false,
                }));
            }
            const syncOpacity = () => {
                this._overviewGroup.opacity = Math.round(255 * Math.min(1, Math.max(0, adjustment.value)));
            };
            this._overviewSignals.connect(adjustment, 'notify::value', syncOpacity);
            syncOpacity();
        }
        for (const effect of this._overviewEffects)
            this._updateEffect(effect);
    }

    _destroyOverview() {
        this._overviewSignals.clear();
        for (const manager of this._overviewManagers)
            manager.destroy();
        this._overviewManagers = [];
        this._overviewEffects = [];
        this._overviewGroup?.destroy();
        this._overviewGroup = null;
    }

    _watchDialog(dialog) {
        if (this._dialogs.has(dialog))
            return;
        this._dialogs.add(dialog);
        // The unlock root is inserted in its constructor, before its wallpaper
        // exists. Mapping retries after construction; no authentication hooks.
        this._signals.connect(dialog, 'notify::mapped', () => this._scanDialog(dialog));
        this._scanDialog(dialog);
    }

    _scanDialog(dialog) {
        const group = dialog._backgroundGroup;
        if (!group)
            return;
        if (!this._lockGroups.has(group)) {
            this._lockGroups.add(group);
            const added = GObject.signal_lookup('child-added', group) ? 'child-added' : 'actor-added';
            this._signals.connect(group, added, (_group, widget) => this._attachLock(widget));
        }
        for (const widget of group.get_children())
            this._attachLock(widget);
    }

    _scanLocks() {
        const container = Main.screenShield?._lockDialogGroup;
        for (const dialog of container?.get_children() ?? []) {
            this._watchDialog(dialog);
            this._scanDialog(dialog);
        }
    }

    _attachLock(widget) {
        if (!this._settings.get_boolean('lock-screen') || this._locks.has(widget))
            return;
        const native = widget.get_effect('blur');
        if (!native)
            return;
        const record = {native, enabled: native.enabled, signals: new Signals(), effect: this._effect()};
        this._locks.set(widget, record);
        record.signals.connect(widget, 'destroy', () => this._removeLock(widget, true));
        // Leave native radius/brightness values intact so native monitor/theme
        // updates continue to work and can be restored exactly on disable.
        native.enabled = false;
        widget.add_effect_with_name('soft-lock-screen-blur', record.effect);
    }

    _removeLock(widget, destroyed = false) {
        const record = this._locks.get(widget);
        if (!record)
            return;
        this._locks.delete(widget);
        record.signals.clear();
        if (!destroyed) {
            widget.remove_effect(record.effect);
            record.native.enabled = record.enabled;
        }
    }

    sync() {
        this._syncOverview();
        if (!this._settings.get_boolean('lock-screen')) {
            for (const widget of this._locks.keys())
                this._removeLock(widget);
        }
        this._scanLocks();
        for (const {effect} of this._locks.values())
            this._updateEffect(effect);
    }

    destroy() {
        this._signals.clear();
        this._destroyOverview();
        for (const widget of this._locks.keys())
            this._removeLock(widget);
        this._settings = null;
    }
}
