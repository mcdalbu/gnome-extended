// SPDX-License-Identifier: GPL-2.0-or-later
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Signals} from './signals.js';
import {SoftSurface} from './softSurface.js';

// Dash to Dock and forks share this actor contract. No imports from a dock
// extension, UUID assumptions, monkey patches or recurring discovery timers.
export function isDockRoot(actor) {
    return actor.name === 'dashtodockContainer' ||
        actor.has_style_class_name?.('dashtodock') ||
        actor.has_style_class_name?.('dash-to-dock') ||
        (findBackground(actor) !== null && hasIcons(actor));
}

function hasIcons(actor) {
    if (actor.has_style_class_name?.('overview-icon'))
        return true;
    return actor.get_children().some(child => hasIcons(child));
}

function findBackground(actor) {
    if (actor.has_style_class_name?.('dash-background'))
        return actor;
    for (const child of actor.get_children()) {
        const found = findBackground(child);
        if (found)
            return found;
    }
    return null;
}

class DockMenu {
    constructor(actor, box) {
        this.actor = actor;
        this.box = box;
    }

    get isOpen() {
        return this.actor.mapped && this.box.mapped;
    }

    connect() { return 0; }
    disconnect() {}
}

export class DockSurfaces {
    constructor(settings) {
        this._settings = settings;
        this._signals = new Signals();
        this._records = new Map();
        this._scanLater = 0;
        this._pendingRoots = new Set();
        this._fullScan = false;
        this._stopped = false;
    }

    start() {
        this._signals.connect(Main.uiGroup, 'destroy', () => this._stopDiscovery());
        if (GObject.signal_lookup('shutdown', global))
            this._signals.connect(global, 'shutdown', () => this._stopDiscovery());
        const added = GObject.signal_lookup('child-added', Main.uiGroup) ? 'child-added' : 'actor-added';
        this._signals.connect(Main.uiGroup, added, (_group, actor) => this._queueScan(actor));
        this._signals.connect(Main.extensionManager, 'extension-state-changed', () => this._queueScan());
        this._signals.connect(Main.layoutManager, 'monitors-changed', () => this._queueScan());
        this._signals.connect(Main.layoutManager.overviewGroup, 'notify::visible', () => this.sync());
        this._scan();
    }

    _queueScan(actor = null) {
        if (this._stopped)
            return;
        if (actor)
            this._pendingRoots.add(actor);
        else
            this._fullScan = true;
        if (this._scanLater)
            return;
        this._scanLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._scanLater = 0;
            const roots = this._fullScan ? null : this._pendingRoots;
            this._pendingRoots = new Set();
            this._fullScan = false;
            this._scan(roots);
            return false;
        });
    }

    _scan(roots = null) {
        if (this._stopped)
            return;
        const visit = (actor, depth) => {
            // Never claim the stock overview dash or a panel container.
            if (actor === Main.layoutManager.overviewGroup || actor === Main.layoutManager.panelBox)
                return;
            if (this._records.has(actor) || isDockRoot(actor)) {
                this._watch(actor);
                if (roots)
                    this._refresh(this._records.get(actor));
                return;
            }
            // Some forks wrap their dock in an additional layout container.
            if (depth < 3) {
                for (const child of actor.get_children())
                    visit(child, depth + 1);
            }
        };
        const children = Main.uiGroup.get_children();
        for (const actor of roots ?? children) {
            if (!roots || children.includes(actor) || this._records.has(actor))
                visit(actor, 0);
        }
        if (!roots)
            this.sync();
    }

    _watch(actor) {
        if (this._records.has(actor))
            return;
        const record = {actor, signals: new Signals(), boxSignals: new Signals(), surface: null, box: null};
        this._records.set(actor, record);
        record.signals.connect(actor, 'destroy', () => this._drop(actor, true));
        record.signals.connect(actor, 'notify::mapped', () => this._refresh(record));
        // Constructors may add the root before their dash/background exists.
        const added = GObject.signal_lookup('child-added', actor) ? 'child-added' : 'actor-added';
        record.signals.connect(actor, added, () => this._queueScan(actor));
        actor.add_style_class_name('gnome-extended-dock');
    }

    _isOverviewTransparent() {
        return this._settings.get_boolean('dock-transparent-in-overview') &&
            Main.layoutManager.overviewGroup.visible;
    }

    _refresh(record) {
        const box = findBackground(record.actor);
        const enabled = this._settings.get_boolean('docks') ||
            this._settings.get_boolean('dock-transparent-in-overview') ||
            (record.surface?._dockFade?.value ?? 1) < 1;
        if (record.surface && (!enabled || box !== record.box)) {
            record.surface.destroy();
            record.surface = null;
        }
        if (box !== record.box) {
            record.boxSignals.clear();
            if (box) {
                record.boxSignals.connect(box, 'destroy', () => {
                    record.surface?.destroy(true);
                    record.surface = null;
                    record.box = null;
                    this._queueScan(record.actor);
                });
            }
            record.box = box;
        }
        if (!enabled || !box || !record.actor.get_parent())
            return;
        if (!record.surface) {
            const menu = new DockMenu(record.actor, box);
            record.surface = new SoftSurface(menu, this._settings, 'dock', () => {
                record.surface = null;
                this._queueScan(record.actor);
            }, {plain: true, dock: true, anchor: record.actor,
                blurEnabled: () => this._settings.get_boolean('docks'),
                onFadeComplete: () => this._queueScan(record.actor),
                transparent: () => this._isOverviewTransparent()});
        }
    }

    sync(effectOnly = false) {
        for (const record of this._records.values()) {
            const previous = record.surface;
            if (effectOnly) {
                previous?.update(true);
                continue;
            }
            this._refresh(record);
            if (previous && previous === record.surface)
                previous.update();
        }
    }

    _drop(actor, destroyed = false) {
        const record = this._records.get(actor);
        if (!record)
            return;
        this._records.delete(actor);
        this._pendingRoots.delete(actor);
        record.signals.clear();
        record.boxSignals.clear();
        record.surface?.destroy(destroyed);
        if (!destroyed)
            actor.remove_style_class_name('gnome-extended-dock');
    }

    _stopDiscovery() {
        this._stopped = true;
        this._pendingRoots.clear();
        if (this._scanLater)
            global.compositor.get_laters().remove(this._scanLater);
        this._scanLater = 0;
    }

    destroy() {
        this._stopDiscovery();
        this._signals.clear();
        for (const actor of this._records.keys())
            this._drop(actor);
        if (this._scanLater)
            global.compositor.get_laters().remove(this._scanLater);
        this._scanLater = 0;
    }
}
