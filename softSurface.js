// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';

import {loadBlurBackend} from './blurBackend.js';
import {BlurRedrawGuard} from './blurRedrawGuard.js';
import {Signals} from './signals.js';

const BlurBackend = await loadBlurBackend(Shell, GObject);

function appendStyle(original, suffix) {
    // St's CSS parser stops at an empty declaration (a leading or doubled ';').
    const base = (original ?? '').trim().replace(/;+\s*$/, '');
    return base ? `${base}; ${suffix}` : suffix;
}

export class SoftSurface {
    constructor(menu, settings, name, onDestroyed) {
        this.menu = menu;
        this._settings = settings;
        this._signals = new Signals();
        this._children = new Map();
        this._windows = new Map();
        this._guard = new BlurRedrawGuard(Clutter, Meta);
        this._later = 0;
        this._styleUntil = 0;
        this._needsEffect = false;
        this._originalBoxStyle = menu.box.get_style();
        this._originalMenuStyle = menu.actor.get_style();
        this._context = St.ThemeContext.get_for_stage(global.stage);
        this._login = LoginManager.getLoginManager();
        this._sleeping = this._login.preparingForSleep ?? false;

        try {
            // Keep framebuffer sampling outside BoxPointer's offscreen effects
            // (Quick Settings uses one when dimming behind an expanded submenu).
            this._group = new Meta.BackgroundGroup({name: `soft-${name}-group`});
            this._blur = new St.Widget({
                name: `soft-${name}-background`, reactive: false,
                style: 'background-color: transparent;',
            });
            this._group.add_child(this._blur);
            menu.actor.get_parent().insert_child_below(this._group, menu.actor);
            this._replaceEffect();

            // PopupMenu raises itself on open. Raise the separate backdrop with
            // it so other Shell layers cannot end up between blur and surface.
            this._signals.connect(menu, 'open-state-changed', (_menu, open) => {
                if (open) {
                    const parent = menu.actor.get_parent();
                    parent.set_child_below_sibling(this._group, menu.actor);
                    this.update();
                } else {
                    // The menu actor stays mapped through its exit animation.
                    // End the separate backdrop when closing starts, including
                    // interrupted animations and switches between panel menus.
                    this._needsEffect = true;
                    this._syncVisibility();
                }
            });
            // PanelMenu rewrites the menu's max-height when opening or moving
            // monitors. Preserve those updates and reapply only our suffix.
            for (const [actor, field] of [[menu.box, '_originalBoxStyle'],
                [menu.actor, '_originalMenuStyle']]) {
                this._signals.connect(actor, 'notify::style', () => {
                    const isBox = actor === menu.box;
                    const applied = isBox ? this._appliedBoxStyle : this._appliedMenuStyle;
                    const style = actor.get_style();
                    // GObject can defer notify until after set_style returns.
                    if (this._settingStyle || style === applied)
                        return;
                    const suffix = isBox ? this._boxSuffix : this._menuSuffix;
                    this[field] = suffix && style ? style.replace(suffix, '') : style;
                    this.update();
                });
            }

            this._signals.connect(menu.actor, 'destroy', () => {
                this.destroy(true);
                onDestroyed();
            });
            this._signals.connect(menu.actor, 'notify::mapped', () => {
                // Discard cached framebuffer resources on every reopening.
                this._needsEffect = true;
                this._syncVisibility();
                this._queueRepaint();
            });
            this._signals.connect(menu.actor, 'notify::opacity', () => this._syncVisibility());
            this._signals.connect(this._context, 'changed', () => this.update());
            this._signals.connect(this._login, 'prepare-for-sleep', (_login, sleeping) => {
                this._sleeping = sleeping;
                this._recover();
            });
            this._signals.connect(Main.sessionMode, 'updated', () => this._recover());
            if (Main.screenShield)
                this._signals.connect(Main.screenShield, 'active-changed', () => this._recover());

            this._signals.connect(global.stage, 'before-update', (_stage, view) => {
                this._guard.begin(this._blur, view);
                if (this._blur.mapped && GLib.get_monotonic_time() < this._styleUntil)
                    this._effect.queue_repaint();
            });
            this._signals.connect(global.stage, 'before-paint', () => this._syncGeometry());
            this._signals.connect(global.stage, 'after-update', () => this._guard.end());
            this._signals.connect(global.display, 'restacked', () => this._queueRepaint());

            const added = GObject.signal_lookup('child-added', global.window_group)
                ? 'child-added' : 'actor-added';
            const removed = added === 'child-added' ? 'child-removed' : 'actor-removed';
            this._signals.connect(global.window_group, added, (_group, actor) => this._trackWindow(actor));
            this._signals.connect(global.window_group, removed, (_group, actor) => {
                this._windows.get(actor)?.clear();
                this._windows.delete(actor);
                this._queueRepaint();
            });
            for (const actor of global.get_window_actors())
                this._trackWindow(actor);
            this._trackChild(menu.box);
            this.update();
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    _replaceEffect() {
        this._guard.end();
        if (this._effect)
            this._blur.remove_effect(this._effect);
        const properties = BlurBackend.BlurEffect.list_properties().map(property => property.name);
        this._radiusProperty = properties.includes('radius') ? 'radius' : 'sigma';
        this._hasCorners = properties.includes('corner-radius');
        this._effect = new BlurBackend.BlurEffect({mode: BlurBackend.BlurMode.BACKGROUND});
        this._blur.add_effect_with_name('gnome-shell-soft-blur', this._effect);
        this._needsEffect = false;
        this._updateEffect();
    }

    _updateEffect() {
        const scale = this._context.scale_factor;
        const radius = this._settings.get_int('blur-radius') * scale;
        this._effect[this._radiusProperty] = this._radiusProperty === 'radius' ? radius : radius / 2;
        this._effect.brightness = this._settings.get_int('brightness') / 100;
        if (this._hasCorners)
            this._effect.corner_radius = this._settings.get_int('corner-radius') * scale;
    }

    update() {
        // Read the actual theme color before adding our own alpha. Never change
        // the opacity of the content actor: labels and icons must stay sharp.
        const {box, actor} = this.menu;
        this._settingStyle = true;
        box.set_style(this._originalBoxStyle);
        actor.set_style(this._originalMenuStyle);
        const color = box.get_theme_node().get_background_color();
        const alpha = this._settings.get_int('opacity') / 100;
        const radius = this._settings.get_int('corner-radius');
        this._boxSuffix = 'background-color: ' +
            `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha}); border-radius: ${radius}px;`;
        this._appliedBoxStyle = appendStyle(this._originalBoxStyle, this._boxSuffix);
        box.set_style(this._appliedBoxStyle);
        // Older themes draw a second opaque surface in BoxPointer's Cairo
        // border. Suppress just its fill; keep layout, border and input intact.
        this._menuSuffix = '-arrow-background-color: transparent;';
        this._appliedMenuStyle = appendStyle(this._originalMenuStyle, this._menuSuffix);
        actor.set_style(this._appliedMenuStyle);
        this._settingStyle = false;
        this._updateEffect();
        this._syncVisibility();
        this._syncGeometry();
        this._queueRepaint();
    }

    _recover() {
        this._needsEffect = true;
        this._guard.end();
        this._syncVisibility();
        this._queueRepaint();
    }

    _syncVisibility() {
        const visible = this.menu.isOpen && this.menu.actor.mapped && !this._sleeping &&
            !Main.sessionMode.isLocked && !Main.screenShield?.active;
        this._group.visible = visible;
        if (!visible) {
            if (this._later)
                global.compositor.get_laters().remove(this._later);
            this._later = 0;
            this._guard.end();
            return;
        }
        if (this._needsEffect)
            this._replaceEffect();
        // The group is a sibling, so account for its common parent's opacity.
        const parentOpacity = this._group.get_parent().get_paint_opacity();
        this._group.opacity = parentOpacity > 0
            ? Math.round(255 * this.menu.actor.get_paint_opacity() / parentOpacity) : 0;
    }

    _syncGeometry() {
        if (!this._group.visible || !this.menu.box.mapped)
            return;
        this._syncVisibility();
        const parent = this._group.get_parent();
        // Follow the rendered box, including the BoxPointer slide animation.
        // Avoid attaching the blur to the menu or its offscreen-rendered bin.
        const [x, y] = this.menu.box.get_transformed_position();
        const [width, height] = this.menu.box.get_transformed_size();
        const [okStart, left, top] = parent.transform_stage_point(x, y);
        const [okEnd, right, bottom] = parent.transform_stage_point(x + width, y + height);
        const values = [left, top, right - left, bottom - top];
        if (!okStart || !okEnd || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0)
            return;
        const previous = [this._blur.x, this._blur.y, this._blur.width, this._blur.height];
        if (values.every((value, i) => Math.abs(value - previous[i]) < 0.01))
            return;
        this._blur.set_position(left, top);
        this._blur.set_size(values[2], values[3]);
        this._queueRepaint();
    }

    _queueRepaint() {
        if (this._later || !this._group?.visible || !this.menu.actor.mapped)
            return;
        this._later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._later = 0;
            if (this._blur.mapped) {
                this._blur.queue_redraw();
                this._effect.queue_repaint();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _trackWindow(actor) {
        if (this._windows.has(actor) || !actor.get_meta_window)
            return;
        const signals = new Signals();
        this._windows.set(actor, signals);
        for (const signal of ['notify::allocation', 'notify::visible', 'notify::mapped',
            'notify::translation-x', 'notify::translation-y'])
            signals.connect(actor, signal, () => this._queueRepaint());
        signals.connect(actor, 'destroy', () => {
            signals.clear();
            this._windows.delete(actor);
            this._queueRepaint();
        });
        this._queueRepaint();
    }

    _trackChild(actor) {
        if (this._children.has(actor))
            return;
        const signals = new Signals();
        this._children.set(actor, signals);
        const added = GObject.signal_lookup('child-added', actor) ? 'child-added' : 'actor-added';
        const removed = added === 'child-added' ? 'child-removed' : 'actor-removed';
        signals.connect(actor, added, (_actor, child) => {
            this._trackChild(child);
            this._queueRepaint();
        });
        signals.connect(actor, removed, (_actor, child) => {
            this._untrackChild(child);
            this._queueRepaint();
        });
        signals.connect(actor, 'destroy', () => this._untrackChild(actor));
        if (actor instanceof St.Widget) {
            signals.connect(actor, 'style-changed', () => {
                const duration = actor.get_theme_node().get_transition_duration() + 50;
                this._styleUntil = Math.max(this._styleUntil, GLib.get_monotonic_time() + duration * 1000);
                this._queueRepaint();
            });
        }
        for (const child of actor.get_children())
            this._trackChild(child);
    }

    _untrackChild(actor) {
        this._children.get(actor)?.clear();
        this._children.delete(actor);
        for (const child of actor.get_children())
            this._untrackChild(child);
    }

    destroy(menuDestroyed = false) {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._signals.clear();
        for (const signals of [...this._children.values(), ...this._windows.values()])
            signals.clear();
        this._children.clear();
        this._windows.clear();
        if (this._later)
            global.compositor.get_laters().remove(this._later);
        this._later = 0;
        this._guard.end();
        this._group?.destroy();
        this._group = null;
        this._blur = null;
        this._effect = null;
        if (!menuDestroyed) {
            this.menu.box.set_style(this._originalBoxStyle);
            this.menu.actor.set_style(this._originalMenuStyle);
        }
        this._settings = null;
    }
}
