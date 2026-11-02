// SPDX-License-Identifier: GPL-2.0-or-later
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as SwitcherPopup from 'resource:///org/gnome/shell/ui/switcherPopup.js';
import * as OsdWindow from 'resource:///org/gnome/shell/ui/osdWindow.js';
import * as Screenshot from 'resource:///org/gnome/shell/ui/screenshot.js';
import * as WorkspaceSwitcher from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {SoftSurface} from './softSurface.js';
import {Signals} from './signals.js';

// Adapt transient actors to the PopupMenu contract without replacing Shell methods.
class SurfaceMenu {
    constructor(actor, box, isOpen) {
        this.actor = actor;
        this.box = box;
        this._isOpen = isOpen;
        this._callbacks = new Map();
        this._nextId = 0;
        this._open = this.isOpen;
    }

    get isOpen() {
        return this._isOpen();
    }

    connect(signal, callback) {
        const id = ++this._nextId;
        this._callbacks.set(id, {signal, callback});
        return id;
    }

    disconnect(id) {
        this._callbacks.delete(id);
    }

    sync() {
        const open = this.isOpen;
        if (this._open === open)
            return;
        this._open = open;
        for (const {signal, callback} of this._callbacks.values()) {
            if (signal === 'open-state-changed')
                callback(this, open);
        }
    }
}

export class ShellSurfaces {
    constructor(settings) {
        this._settings = settings;
        this._signals = new Signals();
        this._records = new Map();
        this._workspaceRoots = new WeakSet();
    }

    start() {
        this._signals.connect(St.Settings.get(), 'notify::color-scheme', () => this.sync());
        this._watch(Main.panel, 'top-panel');
        // Discover surfaces on creation/mapping, without a polling timer.
        for (const group of new Set([Main.uiGroup, Main.layoutManager.overviewGroup,
            Main.layoutManager.modalDialogGroup, Main.layoutManager.screenshotUIGroup])) {
            if (!group)
                continue;
            const added = GObject.signal_lookup('child-added', group) ? 'child-added' : 'actor-added';
            this._signals.connect(group, added, (_group, actor) => this._discover(actor));
            for (const actor of group.get_children())
                this._discover(actor);
        }
        const bannerBin = Main.messageTray?._bannerBin;
        if (bannerBin) {
            const added = GObject.signal_lookup('child-added', bannerBin) ? 'child-added' : 'actor-added';
            this._signals.connect(bannerBin, added, (_bin, banner) => {
                this._watch(Main.messageTray, 'notification-banners', banner);
            });
            for (const banner of bannerBin.get_children())
                this._watch(Main.messageTray, 'notification-banners', banner);
        }
    }

    _discover(actor) {
        if (actor instanceof ModalDialog.ModalDialog)
            this._watch(actor, 'system-dialogs');
        else if (actor instanceof AppDisplay.AppFolderDialog)
            this._watch(actor, 'app-folders');
        else if (actor instanceof SwitcherPopup.SwitcherPopup)
            this._watch(actor, 'window-switcher');
        else if (actor instanceof OsdWindow.OsdWindow)
            this._watch(actor, 'osd-windows');
        else if (actor instanceof Screenshot.ScreenshotUI)
            this._watch(actor, 'screenshot-ui');
        else if (actor instanceof WorkspaceSwitcher.WorkspaceSwitcherPopup)
            this._watchWorkspace(actor);
        else if (actor._delegate instanceof PopupMenu.PopupMenu && !this._isPanelMenu(actor._delegate))
            this._watch(actor, 'popup-menus');
    }

    _isPanelMenu(menu) {
        return menu === Main.panel.statusArea.dateMenu?.menu ||
            menu === Main.panel.statusArea.quickSettings?.menu;
    }

    _watchWorkspace(actor) {
        if (this._workspaceRoots.has(actor))
            return;
        this._workspaceRoots.add(actor);
        const scan = () => {
            for (const child of actor.get_children()) {
                if (child._list)
                    this._watch(actor, 'workspace-switcher', child._list);
            }
        };
        this._signals.connect(actor, 'notify::mapped', scan);
        scan();
    }

    _watch(actor, key, banner = null) {
        const identity = banner ?? actor;
        if (this._records.has(identity))
            return;
        const record = {actor, key, banner, signals: new Signals(), surface: null};
        this._records.set(identity, record);
        record.signals.connect(identity, 'destroy', () => this._drop(identity, true));
        record.signals.connect(actor, 'notify::mapped', () => this._refresh(record));
        if (banner)
            record.signals.connect(banner, 'notify::mapped', () => this._refresh(record));
        if (key === 'system-dialogs')
            record.signals.connect(actor, 'notify::state', () => record.menu?.sync());
        if (key === 'app-folders')
            record.signals.connect(actor, 'open-state-changed', () => record.menu?.sync());
        this._refresh(record);
    }

    _box(record) {
        switch (record.key) {
        case 'top-panel':
            return record.actor;
        case 'system-dialogs':
            return record.actor.dialogLayout?._dialog ?? record.actor.dialogLayout;
        case 'notification-banners':
        case 'workspace-switcher':
            return record.banner;
        case 'osd-windows':
            return record.actor._hbox;
        case 'screenshot-ui':
            return record.actor._panel;
        case 'popup-menus':
            return record.actor._delegate.box;
        case 'app-folders':
            return record.actor._viewBox;
        case 'window-switcher':
            return record.actor._switcherList;
        default:
            return null;
        }
    }

    _isOpen(record, box) {
        const {actor, key} = record;
        if (!actor.mapped || !box.mapped)
            return false;
        if (key === 'system-dialogs')
            return actor.state === ModalDialog.State.OPENED || actor.state === ModalDialog.State.OPENING;
        if (key === 'app-folders')
            return actor._isOpen;
        if (key === 'window-switcher')
            return actor._haveModal;
        if (key === 'popup-menus')
            return actor._delegate.isOpen;
        return true;
    }

    _refresh(record) {
        const light = St.Settings.get().color_scheme === St.SystemColorScheme.PREFER_LIGHT;
        const enabled = this._settings.get_boolean(record.key) &&
            (record.key !== 'top-panel' ||
                this._settings.get_boolean(light ? 'panel-enabled-light' : 'panel-enabled-dark'));
        if (!enabled) {
            record.surface?.destroy();
            record.surface = null;
            record.menu = null;
            return;
        }
        if (record.surface) {
            record.menu.sync?.();
            return;
        }
        const box = this._box(record);
        const anchor = record.key === 'top-panel' ? Main.layoutManager.panelBox : record.actor;
        // Roots may enter their container before their constructor creates content.
        if (!box || !record.actor.mapped || !anchor.get_parent())
            return;
        record.menu = record.key === 'popup-menus' ? record.actor._delegate :
            new SurfaceMenu(record.actor, box, () => this._isOpen(record, box));
        record.surface = new SoftSurface(record.menu, this._settings, record.key, () => {
            record.surface = null;
        }, {plain: record.key !== 'popup-menus',
            panel: record.key === 'top-panel', anchor});
    }

    sync() {
        for (const record of this._records.values()) {
            const existing = record.surface;
            this._refresh(record);
            if (existing && existing === record.surface)
                existing.update();
        }
    }

    _drop(identity, destroyed = false) {
        const record = this._records.get(identity);
        if (!record)
            return;
        this._records.delete(identity);
        record.signals.clear();
        record.surface?.destroy(destroyed);
        record.surface = null;
        record.menu = null;
    }

    destroy() {
        this._signals.clear();
        for (const identity of this._records.keys())
            this._drop(identity);
        this._settings = null;
    }
}
