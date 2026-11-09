// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {loadBlurBackend, applyBlurParameters, applyBlurRate} from './blurBackend.js';
import {BlurRedrawGuard} from './blurRedrawGuard.js';
import {FrameSignals} from './frameSignals.js';
import {RoundedClip} from './roundedClip.js';
import {Signals} from './signals.js';

const Backend = await loadBlurBackend(Shell, GObject);
const menuTypes = [Meta.WindowType.DROPDOWN_MENU, Meta.WindowType.POPUP_MENU,
    Meta.WindowType.MENU, Meta.WindowType.COMBO];
const radiusProperty = Backend.BlurEffect.list_properties().some(p => p.name === 'radius')
    ? 'radius' : 'sigma';

// A sibling backdrop samples only the windows below this one. Blurring the
// window actor itself would also blur its text and controls.
export class WindowSurfaces {
    constructor(settings) {
        this._settings = settings;
        this._signals = new Signals();
        this._frames = new FrameSignals();
        this._windows = new Map();
    }

    start() {
        this._signals.connect(global.display, 'window-created', (_display, window) => {
            const actor = window.get_compositor_private();
            if (actor)
                this._track(actor);
        });
        for (const group of new Set([global.window_group, global.top_window_group])) {
            if (!group)
                continue;
            const added = GObject.signal_lookup('child-added', group) ? 'child-added' : 'actor-added';
            this._signals.connect(group, added, (_group, actor) => this._track(actor));
        }
        this._signals.connect(global.display, 'restacked', () => {
            this._update();
            this._invalidate();
        });
        this._signals.connect(Main.overview, 'showing', () => this._update());
        this._signals.connect(Main.overview, 'hidden', () => this._update());
        this._signals.connect(Main.sessionMode, 'updated', () => this._update());
        this._signals.connect(global.workspace_manager, 'active-workspace-changed', () => this._update());
        this._frames.connect(global.stage, 'before-update', (_stage, view) => {
            this._update();
            for (const state of this._windows.values()) {
                if (state.blur?.visible)
                    state.guard.begin(state.blur, view);
            }
        });
        this._frames.connect(global.stage, 'after-update', () => {
            for (const state of this._windows.values())
                state.guard.end();
        });
        this.sync();
    }

    sync() {
        if (!this._settings.get_boolean('windows-blur') &&
            !this._settings.get_boolean('windows-app-menus') &&
            !this._settings.get_boolean('windows-ptyxis')) {
            this._clear();
            return;
        }
        for (const actor of global.get_window_actors())
            this._track(actor);
        this._update();
    }

    _track(actor) {
        if (this._windows.has(actor) || !(actor instanceof Meta.WindowActor) ||
            (!this._settings.get_boolean('windows-blur') &&
             !this._settings.get_boolean('windows-app-menus') &&
             !this._settings.get_boolean('windows-ptyxis')))
            return;
        const window = actor.meta_window;
        const menu = menuTypes.includes(window.get_window_type());
        if (!menu && ![Meta.WindowType.NORMAL, Meta.WindowType.DIALOG,
            Meta.WindowType.MODAL_DIALOG].includes(window.get_window_type()))
            return;
        const state = {actor, window, menu, signals: new Signals(), guard: new BlurRedrawGuard(Clutter, Meta),
            blur: null};
        this._windows.set(actor, state);
        state.signals.connect(actor, 'destroy', () => this._remove(actor));
        for (const signal of ['notify::allocation', 'notify::visible', 'notify::mapped', 'notify::opacity',
            'notify::translation-x', 'notify::translation-y', 'notify::scale-x', 'notify::scale-y'])
            state.signals.connect(actor, signal, () => this._invalidate());
        if (GObject.signal_lookup('damaged', actor))
            state.signals.connect(actor, 'damaged', () => this._invalidate());
        this._updateWindow(state);
        this._invalidate();
    }

    _invalidate() {
        // Invalidate on scene changes rather than every frame: static windows
        // must not drive a continuous redraw loop.
        for (const state of this._windows.values()) {
            if (state.blur?.visible)
                state.effect.queue_repaint();
        }
    }

    _update() {
        for (const state of this._windows.values())
            this._updateWindow(state);
    }

    _updateWindow(state) {
        const {actor, window} = state;
        // Keep a separate backdrop out of Shell’s window fade animations.
        if (actor.get_transition('opacity')) {
            state.blur?.hide();
            state.guard.end();
            return;
        }
        // Restore normal rendering in overview, lock screen and fullscreen.
        const active = !Main.overview.visible && !Main.sessionMode.isLocked &&
            Main.sessionMode.currentMode === 'user' && !window.is_fullscreen();
        const parent = actor.get_parent();
        const ptyxis = window.get_gtk_application_id() === 'org.gnome.Ptyxis' ||
            window.get_wm_class()?.startsWith('org.gnome.Ptyxis');
        const enabled = active && (state.menu ? this._settings.get_boolean('windows-app-menus')
            : (ptyxis && this._settings.get_boolean('windows-ptyxis')) ||
              this._settings.get_boolean('windows-blur')) &&
            actor.visible && actor.mapped && actor.opacity > 0 && !window.minimized &&
            actor.width * actor.scale_x >= 1 && actor.height * actor.scale_y >= 1 &&
            window.showing_on_its_workspace() &&
            (parent === global.window_group || parent === global.top_window_group);
        if (!enabled) {
            state.blur?.hide();
            state.guard.end();
            return;
        }
        if (!state.blur) {
            state.blur = new St.Widget({name: 'gnome-extended-window-blur', reactive: false,
                style: 'background-color: transparent;'});
            state.effect = new Backend.BlurEffect({mode: Backend.BlurMode.BACKGROUND});
            if (!('corner_radius' in state.effect)) {
                state.clip = new RoundedClip();
                state.blur.add_effect_with_name('gnome-extended-window-clip', state.clip);
            }
            state.blur.add_effect_with_name('gnome-extended-window-blur', state.effect);
            parent.insert_child_below(state.blur, actor);
        }
        const siblings = parent.get_children();
        if (siblings.indexOf(state.blur) !== siblings.indexOf(actor) - 1)
            parent.set_child_below_sibling(state.blur, actor);
        const frame = window.get_frame_rect();
        const buffer = window.get_buffer_rect();
        const geometry = `${actor.x}:${actor.y}:${actor.translation_x}:${actor.translation_y}:${actor.scale_x}:${actor.scale_y}:${frame.x}:${frame.y}:${frame.width}:${frame.height}:${buffer.x}:${buffer.y}`;
        if (state.geometry !== geometry || !state.blur.visible) {
            state.effect.queue_repaint();
            state.geometry = geometry;
        }
        state.blur.set_position(actor.x + actor.translation_x + (frame.x - buffer.x) * actor.scale_x,
            actor.y + actor.translation_y + (frame.y - buffer.y) * actor.scale_y);
        state.blur.set_size(frame.width, frame.height);
        const maximized = window.is_maximized?.() ?? (window.get_maximized?.() === Meta.MaximizeFlags.BOTH);
        state.cornerRadius = state.menu ? 12 : (maximized ? 0 : 15);
        if (state.clip)
            state.clip.radius = state.cornerRadius;
        else if (state.effect.corner_radius !== state.cornerRadius)
            state.effect.corner_radius = state.cornerRadius;
        state.blur.set_scale(actor.scale_x, actor.scale_y);
        state.blur.opacity = actor.opacity;
        const radius = this._settings.get_int('blur-radius');
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const brightness = this._settings.get_int('brightness');
        const rate = this._settings.get_int('blur-rate');
        const appearance = `${radius}:${scale}:${brightness}:${rate}`;
        if (state.appearance !== appearance) {
            applyBlurParameters(state.effect, radiusProperty, radius, scale, brightness);
            applyBlurRate(state.effect, rate);
            state.appearance = appearance;
        }
        state.blur.show();
    }

    _remove(actor) {
        const state = this._windows.get(actor);
        if (!state)
            return;
        this._windows.delete(actor);
        state.signals.clear();
        state.guard.end();
        state.blur?.destroy();
        this._invalidate();
    }

    _clear() {
        for (const actor of this._windows.keys())
            this._remove(actor);
    }

    destroy() {
        this._frames.clear();
        this._signals.clear();
        this._clear();
    }
}
