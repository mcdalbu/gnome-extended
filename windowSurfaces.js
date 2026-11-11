// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
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
import {boundsIntersect, windowDamage} from './windowDamage.js';

const Backend = await loadBlurBackend(Shell, GObject);
const menuTypes = [Meta.WindowType.DROPDOWN_MENU, Meta.WindowType.POPUP_MENU,
    Meta.WindowType.MENU, Meta.WindowType.COMBO];
const radiusProperty = Backend.BlurEffect.list_properties().some(p => p.name === 'radius')
    ? 'radius' : 'sigma';

const normalTypes = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG];

function isPtyxis(window) {
    return window.get_gtk_application_id() === 'org.gnome.Ptyxis' ||
        window.get_wm_class()?.startsWith('org.gnome.Ptyxis');
}

// Mutter excludes an opaque window's region when painting the actors below
// it. A sibling BACKGROUND blur also samples that region, especially along
// translucent/opaque boundaries. An enabled, in-place effect makes Mutter
// preserve those source pixels without an offscreen copy of the window.
const BlurSource = GObject.registerClass(class BlurSource extends Clutter.Effect {
    vfunc_paint(_node, context, _flags) {
        this.get_actor().continue_paint(context);
    }
});

const CaptureView = GObject.registerClass(class CaptureView extends Clutter.Effect {
    vfunc_paint(_node, context, _flags) {
        // A sibling backdrop must never paint independently of its owner,
        // including the frame before a queued focus/restack update runs.
        if (!this.owner.mapped || !this.owner.visible || this.owner.opacity === 0 ||
            this.owner.get_parent() !== this.backdrop.get_parent() ||
            this.owner.get_previous_sibling() !== this.backdrop)
            return;
        // PaintContext.get_stage_view() is not introspectable in Mutter.
        // The framebuffer identifies the view without a private GI call.
        const framebuffer = context.get_framebuffer();
        const onStage = this.get_actor().peek_stage_views()
            .some(view => view.get_framebuffer() === framebuffer);
        // Screenshots can paint into a separate framebuffer. Keep one capture
        // in that path, rather than omitting blur or drawing every view twice.
        if (framebuffer === this.view.get_framebuffer() || (!onStage && this.primary))
            this.get_actor().continue_paint(context);
    }
});

// A sibling backdrop samples only the windows below this one. Blurring the
// window actor itself would also blur its text and controls.
export class WindowSurfaces {
    constructor(settings) {
        this._settings = settings;
        this._signals = new Signals();
        this._frames = new FrameSignals();
        this._windows = new Map();
        this._identities = new Map();
        this._stopWindowDamage = null;
        this._visible = new Set();
        this._dirty = new Set();
        this._damage = new Set();
        this._exposed = [];
        this._later = 0;
        this._restacked = false;
        this._stackPending = false;
        this._stack = new Map();
    }

    start() {
        this._signals.connect(global.display, 'window-created', (_display, window) => {
            const actor = window.get_compositor_private();
            if (actor)
                this._consider(actor);
        });
        for (const group of new Set([global.window_group, global.top_window_group])) {
            if (!group)
                continue;
            const added = GObject.signal_lookup('child-added', group) ? 'child-added' : 'actor-added';
            this._signals.connect(group, added, (_group, actor) => this._consider(actor));
        }
        const refresh = () => {
            if (this._windows.size) {
                this._refreshAll();
                this._queueUpdate();
            }
        };
        const restack = () => {
            if (this._windows.size) {
                this._stackPending = true;
                this._queueUpdate();
            }
        };
        this._signals.connect(global.display, 'restacked', restack);
        this._signals.connect(global.display, 'notify::focus-window', restack);
        this._signals.connect(Main.overview, 'showing', refresh);
        this._signals.connect(Main.overview, 'hidden', refresh);
        this._signals.connect(Main.sessionMode, 'updated', refresh);
        this._signals.connect(global.workspace_manager, 'active-workspace-changed', refresh);
        this._context = St.ThemeContext.get_for_stage(global.stage);
        this._signals.connect(this._context, 'notify::scale-factor', () => this.sync());
        this._signals.connect(Main.layoutManager, 'monitors-changed', () => {
            for (const state of this._windows.values()) {
                for (const capture of state.captures.values())
                    capture.actor.destroy();
                state.captures.clear();
                state.capture = null;
                state.effect = null;
            }
            this._refreshAll();
            this._queueUpdate();
        });
        this._frames.connect(global.stage, 'before-update', (_stage, view) => {
            if (this._radius === 0 && this._brightness === 100)
                return;
            for (const state of this._visible)
                state.guard.begin(state.blur, view);
        });
        this._frames.connect(global.stage, 'before-paint', (_stage, view) => {
            for (const state of this._visible)
                this._syncCapture(state, view);
        });
        this._frames.connect(global.stage, 'after-update', () => {
            for (const state of this._visible)
                state.guard.end();
        });
        this.sync();
    }

    sync(effectOnly = false) {
        const settings = this._settings;
        this._radius = settings.get_int('blur-radius');
        this._scale = this._context.scale_factor;
        this._brightness = settings.get_int('brightness');
        this._rate = settings.get_int('blur-rate');
        if (effectOnly) {
            for (const state of this._visible) {
                this._applyEffect(state);
                this._syncCapture(state);
            }
            return;
        }
        this._blurWindows = settings.get_boolean('windows-blur');
        this._blurMenus = settings.get_boolean('windows-app-menus');
        this._blurPtyxis = settings.get_boolean('windows-ptyxis');
        if (!this._blurWindows && !this._blurMenus && !this._blurPtyxis) {
            this._clear();
            return;
        }
        const actors = new Set([...global.get_window_actors(), ...this._windows.keys(), ...this._identities.keys()]);
        for (const actor of actors)
            this._consider(actor);
        this._refreshAll();
        this._flush();
    }

    _consider(actor) {
        if (!(actor instanceof Meta.WindowActor) ||
            (!this._blurWindows && !this._blurMenus && !this._blurPtyxis))
            return;
        const window = actor.meta_window;
        if (!window)
            return;
        const type = window.get_window_type();
        const menu = menuTypes.includes(type);
        const normal = normalTypes.includes(type);
        const watchIdentity = this._blurPtyxis && !this._blurWindows && normal;
        if (watchIdentity && !this._identities.has(actor)) {
            // The GTK application ID can arrive after the compositor actor.
            const signals = new Signals();
            this._identities.set(actor, signals);
            for (const signal of ['notify::gtk-application-id', 'notify::wm-class'])
                signals.connect(window, signal, () => this._consider(actor));
            signals.connect(actor, 'destroy', () => this._forgetIdentity(actor));
        } else if (!watchIdentity) {
            this._forgetIdentity(actor);
        }

        if (this._blurWindows || (this._blurMenus && menu) || (watchIdentity && isPtyxis(window))) {
            if (!this._windows.has(actor))
                this._track(actor, window, menu, normal);
        } else {
            this._remove(actor);
        }
    }

    _forgetIdentity(actor) {
        this._identities.get(actor)?.clear();
        this._identities.delete(actor);
    }

    _track(actor, window, menu, normal) {
        const state = {actor, window, menu, normal, signals: new Signals(),
            guard: new BlurRedrawGuard(Clutter, Meta), blur: null, captures: new Map()};
        this._windows.set(actor, state);
        const refresh = () => {
            this._dirty.add(state);
            this._queueUpdate();
        };
        state.signals.connect(actor, 'destroy', () => this._remove(actor));
        for (const signal of ['notify::allocation', 'notify::visible', 'notify::mapped', 'notify::opacity',
            'notify::translation-x', 'notify::translation-y', 'notify::scale-x', 'notify::scale-y',
            'parent-set', 'transitions-completed', 'first-frame', 'effects-completed'])
            state.signals.connect(actor, signal, refresh);
        for (const signal of ['position-changed', 'size-changed', 'notify::fullscreen', 'notify::minimized',
            'notify::maximized-horizontally', 'notify::maximized-vertically'])
            state.signals.connect(window, signal, refresh);
        if (GObject.signal_lookup('damaged', actor)) {
            state.signals.connect(actor, 'damaged', () => {
                if (this._blurWindows) {
                    this._damage.add(state);
                    this._queueUpdate();
                }
            });
        }
        refresh();
    }

    _refreshAll() {
        this._restacked = true;
        for (const state of this._windows.values())
            this._dirty.add(state);
    }

    _queueUpdate() {
        if (!this._later)
            this._later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._later = 0;
                this._flush();
                return GLib.SOURCE_REMOVE;
            });
    }

    _updateStack(dirty, exposed, refreshAll) {
        const stack = new Map();
        for (const group of new Set([global.window_group, global.top_window_group])) {
            if (!group)
                continue;
            let index = 0;
            for (const actor of group.get_children()) {
                if (actor instanceof Meta.WindowActor)
                    stack.set(actor, {group, index: index++});
            }
        }
        if (!refreshAll) {
            for (const [actor, placement] of stack) {
                const previous = this._stack.get(actor);
                const state = this._windows.get(actor);
                const paired = !state?.blur?.visible || actor.get_previous_sibling() === state.blur;
                // Mutter restacks window actors while our injected siblings
                // can move relative to them without changing window indices.
                if (previous?.group === placement.group && previous.index === placement.index && paired)
                    continue;
                if (state) {
                    dirty.add(state);
                } else {
                    const bounds = windowDamage.boundsFor(actor);
                    if (bounds)
                        exposed.push(bounds);
                }
            }
        }
        this._stack = stack;
    }

    _flush() {
        if (!this._dirty.size && !this._damage.size && !this._exposed.length &&
            !this._restacked && !this._stackPending) {
            this._syncDamageTracking();
            return;
        }
        const dirty = this._dirty;
        const damage = this._damage;
        const exposed = this._exposed.splice(0);
        const restacked = this._restacked;
        if (restacked || this._stackPending)
            this._updateStack(dirty, exposed, restacked);
        this._stackPending = false;
        this._dirty = new Set();
        this._damage = new Set();
        this._restacked = false;
        const repaint = new Set();
        for (const state of dirty) {
            if (state.bounds)
                exposed.push(state.bounds);
            state.bounds = windowDamage.boundsFor(state.actor);
            if (state.bounds)
                exposed.push(state.bounds);
            if (this._updateWindow(state))
                repaint.add(state);
        }
        for (const state of damage) {
            // A new client buffer can switch between RGB and RGBA without moving.
            if (!state.menu && state.normal && !dirty.has(state)) {
                const opaque = this._isOpaque(state);
                if (opaque !== state.opaque && this._updateWindow(state, opaque))
                    repaint.add(state);
            }
            if (state.bounds)
                exposed.push(state.bounds);
        }
        this._repaintAffected(exposed, repaint, restacked);
        this._syncDamageTracking();
    }

    _repaintAffected(exposed, repaint = null, restacked = false) {
        for (const state of this._visible) {
            if (restacked || repaint?.has(state)) {
                for (const capture of state.captures.values())
                    capture.effect.queue_repaint();
                continue;
            }
            const margin = Math.max(64, 3 * this._radius) * this._scale *
                Math.max(1, state.actor.scale_x, state.actor.scale_y);
            if (state.blurBounds && exposed.some(bounds => boundsIntersect(bounds, state.blurBounds, margin))) {
                for (const capture of state.captures.values())
                    capture.effect.queue_repaint();
            }
        }
    }

    _syncDamageTracking() {
        // With selective blur, unrelated windows only supply the backdrop.
        // Subscribe to their changes while at least one backdrop is visible.
        if (!this._blurWindows && this._visible.size)
            this._stopWindowDamage ??= windowDamage.subscribe(bounds => this._repaintAffected(bounds));
        else {
            this._stopWindowDamage?.();
            this._stopWindowDamage = null;
        }
    }

    _isOpaque({actor, window}) {
        // X11 window shapes may expose the backdrop even with an RGB buffer.
        // On Wayland, keep the backdrop when the root surface's format is unknown.
        if (actor.opacity !== 255 || window.get_client_type() !== Meta.WindowClientType.WAYLAND)
            return false;
        const texture = actor.get_texture()?.get_texture?.();
        const plane = texture?.is_simple?.() ? texture.get_plane(0) : texture;
        const components = plane?.get_components?.();
        return components !== undefined && components === Cogl.TextureComponents?.RGB;
    }

    _hide(state) {
        this._visible.delete(state);
        state.blur?.hide();
        if (state.source) {
            state.actor.remove_effect(state.source);
            state.source = null;
        }
        state.guard.end();
        return false;
    }

    _applyEffect(state) {
        if (this._radius > 0 && !state.source) {
            state.source = new BlurSource();
            state.actor.add_effect(state.source);
        } else if (this._radius === 0 && state.source) {
            state.actor.remove_effect(state.source);
            state.source = null;
        }
        for (const capture of state.captures.values()) {
            const scale = capture.view.get_scale();
            const appearance = `${this._radius}:${scale}:${this._brightness}:${this._rate}`;
            if (capture.appearance === appearance)
                continue;
            // Radius properties use integer framebuffer pixels; round rather
            // than truncate fractional scales (e.g. 30 * 1.8 is nearly 54).
            applyBlurParameters(capture.effect, radiusProperty,
                Math.round(this._radius * scale), 1, this._brightness);
            applyBlurRate(capture.effect, this._rate);
            capture.appearance = appearance;
        }
    }

    _syncCapture(state, view = null) {
        // A view owns a physical-pixel sampling grid and its own effect/cache.
        // Sharing a logical grid, or changing one capture between differently
        // scaled views, shifts the blur phase during movement.
        if (!view) {
            for (const stageView of state.blur.peek_stage_views())
                this._syncCapture(state, stageView);
            return;
        }
        const [x, y] = state.blur.get_transformed_position();
        const [width, height] = state.blur.get_transformed_size();
        const scaleX = width / state.blur.width;
        const scaleY = height / state.blur.height;
        if (!(scaleX > 0 && scaleY > 0))
            return;
        const layout = view.layout;
        if (x >= layout.x + layout.width || x + width <= layout.x ||
            y >= layout.y + layout.height || y + height <= layout.y)
            return;
        let capture = state.captures.get(view);
        if (!capture) {
            const actor = new St.Widget({name: 'gnome-extended-window-capture', reactive: false,
                style: 'background-color: transparent;'});
            const onlyView = new CaptureView();
            onlyView.view = view;
            onlyView.primary = state.captures.size === 0;
            onlyView.owner = state.actor;
            onlyView.backdrop = state.blur;
            actor.add_effect_with_name('gnome-extended-capture-view', onlyView);
            const effect = new Backend.BlurEffect({mode: Backend.BlurMode.BACKGROUND});
            actor.add_effect_with_name('gnome-extended-window-blur', effect);
            state.blur.add_child(actor);
            capture = {actor, effect, view};
            state.captures.set(view, capture);
            state.capture ??= actor;
            state.effect ??= effect;
            this._applyEffect(state);
        }
        const scale = view.get_scale();
        const tile = 64;
        const padding = Math.ceil(3 * this._radius * scale);
        const left = Math.floor(((x - layout.x) * scale - padding) / tile) * tile;
        const top = Math.floor(((y - layout.y) * scale - padding) / tile) * tile;
        // Reserve an extra tile for the offset from the window to the grid.
        // Constant capture dimensions prevent backend downscale thresholds
        // and FBO allocations from changing while a window only moves.
        const right = left + (Math.ceil((width * scale + 2 * padding) / tile) + 1) * tile;
        const bottom = top + (Math.ceil((height * scale + 2 * padding) / tile) + 1) * tile;
        const geometry = `${left}:${top}:${right}:${bottom}:${x}:${y}:${scaleX}:${scaleY}:${scale}`;
        if (capture.geometry === geometry)
            return;
        capture.geometry = geometry;
        // Stay just inside the integer capture box: float transforms must not
        // make the backend's outward rounding add a whole source pixel.
        const inset = 1 / 256;
        capture.actor.set_position((layout.x + (left + inset) / scale - x) / scaleX,
            (layout.y + (top + inset) / scale - y) / scaleY);
        capture.actor.set_size((right - left - 2 * inset) / scale / scaleX,
            (bottom - top - 2 * inset) / scale / scaleY);
        capture.effect.queue_repaint();
    }

    _updateWindow(state, opaque = this._blurWindows && state.normal && this._isOpaque(state)) {
        const {actor, window} = state;
        state.opaque = opaque;
        // Keep a separate backdrop out of Shell’s window fade animations.
        if (actor.get_transition('opacity') || (!state.menu && !state.normal))
            return this._hide(state);
        // Restore normal rendering in overview, lock screen and fullscreen.
        const active = !Main.overview.visible && !Main.sessionMode.isLocked &&
            Main.sessionMode.currentMode === 'user' && !window.is_fullscreen();
        const parent = actor.get_parent();
        const enabled = active && (state.menu ? this._blurMenus :
            (this._blurPtyxis && isPtyxis(window)) || (this._blurWindows && !opaque)) &&
            actor.visible && actor.mapped && actor.opacity > 0 && !window.minimized &&
            actor.width * actor.scale_x >= 1 && actor.height * actor.scale_y >= 1 &&
            window.showing_on_its_workspace() &&
            (parent === global.window_group || parent === global.top_window_group);
        if (!enabled)
            return this._hide(state);
        if (!state.blur) {
            state.blur = new St.Widget({name: 'gnome-extended-window-blur', reactive: false,
                style: 'background-color: transparent;'});
            state.clip = new RoundedClip();
            state.blur.add_effect_with_name('gnome-extended-window-clip', state.clip);
            parent.insert_child_below(state.blur, actor);
        }
        const previousParent = state.blur.get_parent();
        if (previousParent !== parent) {
            previousParent?.remove_child(state.blur);
            parent.insert_child_below(state.blur, actor);
        } else if (actor.get_previous_sibling() !== state.blur) {
            parent.set_child_below_sibling(state.blur, actor);
        }
        const frame = window.get_frame_rect();
        const buffer = window.get_buffer_rect();
        const maximized = window.is_maximized?.() ?? (window.get_maximized?.() === Meta.MaximizeFlags.BOTH);
        const cornerRadius = state.menu ? 12 : (maximized ? 0 : 15);
        const x = actor.x + actor.translation_x + (frame.x - buffer.x) * actor.scale_x;
        const y = actor.y + actor.translation_y + (frame.y - buffer.y) * actor.scale_y;
        const geometry = `${x}:${y}:${frame.width}:${frame.height}:${actor.scale_x}:${actor.scale_y}:${actor.opacity}:${cornerRadius}`;
        const changed = state.geometry !== geometry || !this._visible.has(state);
        if (changed) {
            state.geometry = geometry;
            state.cornerRadius = cornerRadius;
            state.blur.set_position(x, y);
            state.blur.set_size(frame.width, frame.height);
            state.blur.set_scale(actor.scale_x, actor.scale_y);
            state.blur.opacity = actor.opacity;
            state.clip.radius = cornerRadius;
        }
        this._applyEffect(state);
        this._syncCapture(state);
        state.blur.show();
        this._visible.add(state);
        state.blurBounds = {x, y, right: x + frame.width * actor.scale_x,
            bottom: y + frame.height * actor.scale_y};
        return changed;
    }

    _remove(actor) {
        const state = this._windows.get(actor);
        if (!state)
            return;
        this._windows.delete(actor);
        this._dirty.delete(state);
        this._damage.delete(state);
        this._hide(state);
        state.signals.clear();
        state.blur?.destroy();
        this._syncDamageTracking();
        if (state.bounds && this._visible.size) {
            this._exposed.push(state.bounds);
            this._queueUpdate();
        }
    }

    _clear() {
        for (const actor of this._identities.keys())
            this._forgetIdentity(actor);
        this._stopWindowDamage?.();
        this._stopWindowDamage = null;
        this._visible.clear();
        for (const actor of this._windows.keys())
            this._remove(actor);
        if (this._later) {
            global.compositor.get_laters().remove(this._later);
            this._later = 0;
        }
        this._exposed.length = 0;
        this._restacked = false;
        this._stackPending = false;
        this._stack.clear();
    }

    destroy() {
        this._frames.clear();
        this._signals.clear();
        this._clear();
    }
}
