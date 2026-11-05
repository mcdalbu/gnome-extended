// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ANIMATION_TIME} from 'resource:///org/gnome/shell/ui/overview.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';

import {loadBlurBackend, applyBlurParameters, applyBlurRate, opacityFraction} from './blurBackend.js';
import {BlurRedrawGuard} from './blurRedrawGuard.js';
import {Signals} from './signals.js';
import {FrameSignals} from './frameSignals.js';
import {PanelOpacity} from './panelOpacity.js';

const BlurBackend = await loadBlurBackend(Shell, GObject);

function appendStyle(original, suffix) {
    // St's CSS parser stops at an empty declaration (a leading or doubled ';').
    const base = (original ?? '').trim().replace(/;+\s*$/, '');
    return base ? `${base}; ${suffix}` : suffix;
}

export class SoftSurface {
    constructor(menu, settings, name, onDestroyed, options = {}) {
        this.menu = menu;
        this._options = options;
        this._settings = settings;
        this._signals = new Signals();
        this._frames = new FrameSignals();
        this._children = new Map();
        this._windows = new Map();
        this._guard = new BlurRedrawGuard(Clutter, Meta);
        this._later = 0;
        this._styleUntil = 0;
        this._opaqueUntil = 0;
        this._needsEffect = false;
        this._originalBoxStyle = menu.box.get_style();
        this._originalMenuStyle = menu.actor.get_style?.() ?? null;
        this._context = St.ThemeContext.get_for_stage(global.stage);
        this._login = LoginManager.getLoginManager();
        this._sleeping = this._login.preparingForSleep ?? false;

        try {
            // Keep framebuffer sampling outside BoxPointer's offscreen effects
            // (Quick Settings uses one when dimming behind an expanded submenu).
            this._group = new Meta.BackgroundGroup({name: `soft-${name}-group`, width: 0, height: 0});
            this._blur = new St.Widget({
                name: `soft-${name}-background`, reactive: false,
                style: 'background-color: transparent;',
            });
            this._group.add_child(this._blur);
            if (options.panel) {
                // The overview's solid backdrop disappears only after its
                // animation ends. Crossfade that last input into the live
                // desktop blur rather than exposing a different framebuffer.
                this._panelCover = new St.Widget({reactive: false});
                this._group.add_child(this._panelCover);
                this._panelReveal = new St.Adjustment({
                    actor: menu.actor, lower: 0, upper: 1,
                    value: Main.layoutManager.overviewGroup.visible ? 0 : 1,
                });
                this._signals.connect(this._panelReveal, 'notify::value', () => this._syncVisibility());
                this._signals.connect(Main.layoutManager.overviewGroup, 'notify::visible', () => {
                    this._panelReveal.remove_transition('value');
                    if (Main.layoutManager.overviewGroup.visible)
                        this._panelReveal.value = 0;
                    else
                        this._panelReveal.ease(1, {duration: ANIMATION_TIME,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD});
                });
                // Tint and blur share one opacity, so there is no second CSS
                // animation to leave the blur visible in the overview.
                this._panelTint = new St.Widget({reactive: false});
                this._group.add_child(this._panelTint);
                this._panelPolicy = new PanelOpacity(settings, menu.actor, () => {
                    this._updatePanelTint();
                    this._syncVisibility();
                });
                const overviewAdjustment = Main.overview._overview.controls._stateAdjustment;
                const panelFade = () => 1 - Math.min(1, Math.max(0, overviewAdjustment.value));
                this._panelFade = new St.Adjustment({
                    actor: menu.actor, lower: 0, upper: 1,
                    value: panelFade(),
                });
                this._signals.connect(this._panelFade, 'notify::value', () => {
                    this._updateBlurAppearance();
                    this._syncVisibility();
                });
                // Follow Shell's animation (including gestures and reversals).
                // Panel CSS durations can be zero even with animations enabled.
                this._signals.connect(overviewAdjustment, 'notify::value', () => {
                    this._panelFade.value = panelFade();
                });
                this._signals.connect(St.Settings.get(), 'notify::color-scheme', () => this.update());
            }
            this._signals.connect(this._group, 'destroy', () => {
                // A Shell container may destroy siblings before their surface.
                this._group = null;
                this.destroy(true);
                onDestroyed();
            });
            const anchor = options.anchor ?? menu.actor;
            anchor.get_parent().insert_child_below(this._group, anchor);
            this._replaceEffect();

            // PopupMenu raises itself on open. Raise the separate backdrop with
            // it so other Shell layers cannot end up between blur and surface.
            this._signals.connect(menu, 'open-state-changed', (_menu, open) => {
                if (open) {
                    const anchor = options.anchor ?? menu.actor;
                    const parent = anchor.get_parent();
                    parent.set_child_below_sibling(this._group, anchor);
                    this._stackPending = true;
                    this.update();
                } else {
                    // The menu actor stays mapped through its exit animation.
                    // End the separate backdrop when closing starts, including
                    // interrupted animations and switches between panel menus.
                    this._syncVisibility();
                }
            });
            // PanelMenu rewrites the menu's max-height when opening or moving
            // monitors. Preserve those updates and reapply only our suffix.
            const styledActors = [[menu.box, '_originalBoxStyle']];
            if (!options.plain)
                styledActors.push([menu.actor, '_originalMenuStyle']);
            for (const [actor, field] of styledActors) {
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
                // Reuse GPU resources on ordinary reopening; recovery after
                // sleep/lock still explicitly replaces the effect.
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

            this._frames.connect(global.stage, 'before-update', (_stage, view) => {
                this._blurBounds = null;
                this._syncVisibility();
                if (!this._group.visible)
                    return;
                if (this._stackPending) {
                    const anchor = this._options.anchor ?? this.menu.actor;
                    anchor.get_parent().set_child_below_sibling(this._group, anchor);
                    this._stackPending = false;
                }
                this._syncGeometry(false);
                this._guard.begin(this._blur, view);
                if (this._blur.mapped && GLib.get_monotonic_time() < this._styleUntil)
                    this._effect.queue_repaint();
            });
            this._frames.connect(global.stage, 'before-paint', () => this._syncGeometry());
            this._frames.connect(global.stage, 'after-update', () => {
                this._blurBounds = null;
                this._guard.end();
            });
            this._signals.connect(global.display, 'restacked', () => this._queueRepaint());

            const added = GObject.signal_lookup('child-added', global.window_group)
                ? 'child-added' : 'actor-added';
            const removed = added === 'child-added' ? 'child-removed' : 'actor-removed';
            this._signals.connect(global.window_group, added, (_group, actor) => this._trackWindow(actor));
            this._signals.connect(global.window_group, removed, (_group, actor) => {
                this._untrackWindow(actor);
            });
            for (const actor of global.get_window_actors())
                this._trackWindow(actor);
            this._trackChild(menu.box);
            this.update();
            this._panelPolicy?.start();
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
        this._blur.add_effect_with_name('gnome-extended-blur', this._effect);
        this._needsEffect = false;
        this._updateEffect();
    }

    _updateEffect() {
        applyBlurRate(this._effect, this._settings.get_int('blur-rate'));
        this._updateBlurAppearance();
        this._updateEffectCorners();
    }

    _updateBlurAppearance() {
        if (!this._effect)
            return;
        // BACKGROUND effects composite at full opacity, independently of the
        // actor's paint opacity. Animate the actual filter from an unchanged
        // background to the configured blur, not just its containing actor.
        const fade = this._panelFade?.value ?? 1;
        const scale = this._context.scale_factor;
        applyBlurParameters(this._effect, this._radiusProperty,
            this._settings.get_int('blur-radius') * fade, scale,
            100 + (this._settings.get_int('brightness') - 100) * fade);
        if (this._panelCover) {
            const color = Main.layoutManager.overviewGroup.get_theme_node().get_background_color();
            const brightness = this._effect.brightness;
            const [r, g, b] = [color.red, color.green, color.blue].map(c => Math.round(c * brightness));
            const style = `background-color: rgba(${r}, ${g}, ${b}, ${color.alpha / 255}); transition-duration: 0ms;`;
            if (this._panelCover.get_style() !== style)
                this._panelCover.set_style(style);
        }
    }

    _readThemeCorners() {
        const node = this.menu.box.get_theme_node();
        // Theme node lengths already include the display scale. Keep each
        // surface's CSS untouched, including capsule-shaped OSD backgrounds.
        this._themeCorners = [0, 1, 2, 3].map(corner => Math.max(0, node.get_border_radius(corner)));
    }

    _cornerRadius() {
        if (!this._themeCorners)
            this._readThemeCorners();
        // The backend exposes one radius. A conservative clip also stays
        // inside surfaces whose theme defines different corner radii.
        return Math.max(...this._themeCorners);
    }

    _updateEffectCorners() {
        if (!this._hasCorners)
            return;
        const {box} = this.menu;
        const {width, height} = this._blur;
        const transformScale = box.width > 0 && box.height > 0
            ? Math.min(width / box.width, height / box.height) : 1;
        const radius = Math.round(Math.max(0, Math.min(this._cornerRadius() * transformScale,
            width / 2, height / 2)));
        if (this._effect.corner_radius !== radius)
            this._effect.corner_radius = radius;
    }

    _updatePanelTint() {
        if (!this._panelColor)
            return;
        this._panelAlpha = this._panelPolicy.opaque ? 1 : opacityFraction(this._settings.get_int('opacity'));
        const [red, green, blue] = this._panelColor;
        // St interpolates the complete RGBA background in one native CSS
        // transition. Keep blur until the opaque fill has finished fading in.
        const duration = this.menu.box.get_theme_node().get_transition_duration();
        const style = `background-color: rgba(${red}, ${green}, ${blue}, ${this._panelAlpha}); transition-duration: ${duration}ms;`;
        if (this._panelTint.get_style() !== style) {
            this._panelTint.set_style(style);
            this._opaqueUntil = GLib.get_monotonic_time() +
                (this._panelTint.get_theme_node().get_transition_duration() + 50) * 1000;
        }
    }

    update() {
        this._panelPolicy?.sync();
        // Read the actual theme color before adding our own alpha. Never change
        // the opacity of the content actor: labels and icons must stay sharp.
        const {box, actor} = this.menu;
        this._settingStyle = true;
        box.set_style(this._originalBoxStyle);
        if (!this._options.plain)
            actor.set_style(this._originalMenuStyle);
        const color = box.get_theme_node().get_background_color();
        const alpha = opacityFraction(this._settings.get_int('opacity'));
        this._readThemeCorners();
        if (this._panelTint) {
            const light = St.Settings.get().color_scheme === St.SystemColorScheme.PREFER_LIGHT;
            // Keep the native panel color at every opacity, including dark mode.
            if (light && color.alpha > 0)
                this._panelLightColor = [color.red, color.green, color.blue];
            this._panelColor = light ? (this._panelLightColor ?? [250, 250, 251]) :
                [color.red, color.green, color.blue];
            this._updatePanelTint();
            this._boxSuffix = 'background-color: transparent; background-image: none;';
        } else {
            this._boxSuffix = 'background-color: ' +
                `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha}); background-image: none;`;
        }
        this._appliedBoxStyle = appendStyle(this._originalBoxStyle, this._boxSuffix);
        box.set_style(this._appliedBoxStyle);
        // Older themes draw a second opaque surface in BoxPointer's Cairo
        // border. Suppress just its fill; keep layout, border and input intact.
        if (!this._options.plain) {
            this._menuSuffix = '-arrow-background-color: transparent;';
            this._appliedMenuStyle = appendStyle(this._originalMenuStyle, this._menuSuffix);
            actor.set_style(this._appliedMenuStyle);
        }
        this._settingStyle = false;
        this._updateEffect();
        // St's theme node reports the target alpha, not the intermediate
        // color of a CSS transition. Keep the backdrop until it has settled.
        this._opaqueUntil = GLib.get_monotonic_time() +
            (box.get_theme_node().get_transition_duration() + 50) * 1000;
        this._syncVisibility();
        this._syncGeometry();
        this._refreshWindowIntersections();
        this._queueRepaint();
    }

    _recover() {
        this._needsEffect = true;
        this._guard.end();
        this._syncVisibility();
        this._queueRepaint();
    }

    _syncVisibility() {
        const active = this.menu.isOpen && this.menu.actor.mapped && !this._sleeping &&
            !Main.sessionMode.isLocked && !Main.screenShield?.active;
        const alpha = this._panelTint ? this._panelAlpha : opacityFraction(this._settings.get_int('opacity'));
        const opaque = active && alpha === 1 &&
            this.menu.box.get_paint_opacity() === 255 &&
            (this._hasCorners || this._cornerRadius() === 0) &&
            GLib.get_monotonic_time() >= this._opaqueUntil;
        const fade = this._panelFade?.value ?? 1;
        const visible = active && fade > 0 && (!!this._panelTint || !opaque);
        const blurVisible = visible && !opaque;
        const wasVisible = this._group.visible && this._blur.visible;
        this._group.visible = !!visible;
        this._blur.visible = !!blurVisible;
        if (this._panelCover) {
            this._panelCover.opacity = Math.round(255 * (1 - this._panelReveal.value));
            this._panelCover.visible = blurVisible && this._panelCover.opacity > 0;
        }
        if (!blurVisible) {
            for (const {signals} of this._windows.values())
                signals.clear();
            this._windows.clear();
            if (this._later)
                global.compositor.get_laters().remove(this._later);
            this._later = 0;
            this._guard.end();
        } else {
            if (!wasVisible) {
                this._effect.invalidate?.();
                this._blurBounds = null;
                for (const actor of global.get_window_actors())
                    this._trackWindow(actor);
                this._refreshWindowIntersections();
            }
            if (this._needsEffect)
                this._replaceEffect();
        }
        if (!visible) {
            this._group.opacity = 0;
            return;
        }
        // The group is a sibling, so account for its common parent's opacity.
        const parentOpacity = this._group.get_parent().get_paint_opacity();
        const opacityActor = this._options.plain ? this.menu.box : this.menu.actor;
        this._group.opacity = parentOpacity > 0
            ? Math.min(255, Math.round(255 * fade * opacityActor.get_paint_opacity() / parentOpacity)) : 0;
    }

    _syncGeometry(syncVisibility = true) {
        this._blurBounds = null;
        if (!this._group.visible || !this.menu.box.mapped)
            return;
        if (syncVisibility)
            this._syncVisibility();
        const parent = this._group.get_parent();
        // Follow the rendered box, including the BoxPointer slide animation.
        // Avoid attaching the blur to the menu or its offscreen-rendered bin.
        const [x, y] = this.menu.box.get_transformed_position();
        const [width, height] = this.menu.box.get_transformed_size();
        const [okStart, left, top] = parent.transform_stage_point(x, y);
        const [okEnd, right, bottom] = parent.transform_stage_point(x + width, y + height);
        // BinLayout can position a zero-sized sibling at its center. Convert
        // parent coordinates into the backdrop group's local coordinates.
        const values = [left - this._group.x, top - this._group.y, right - left, bottom - top];
        if (!okStart || !okEnd || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0)
            return;
        const previous = [this._blur.x, this._blur.y, this._blur.width, this._blur.height];
        if (values.every((value, i) => Math.abs(value - previous[i]) < 0.01)) {
            this._updateEffectCorners();
            return;
        }
        this._blur.set_position(values[0], values[1]);
        this._blur.set_size(values[2], values[3]);
        this._panelTint?.set_position(values[0], values[1]);
        this._panelTint?.set_size(values[2], values[3]);
        this._panelCover?.set_position(values[0], values[1]);
        this._panelCover?.set_size(values[2], values[3]);
        this._updateEffectCorners();
        this._refreshWindowIntersections();
        // Geometry may change in before-paint, after BEFORE_REDRAW callbacks.
        // Invalidate the capture for this frame, including the first open frame.
        if (this._blur.mapped)
            this._effect.queue_repaint();
    }

    _queueRepaint() {
        if (this._later || !this._blur?.mapped || !this.menu.actor.mapped)
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

    _windowIntersectsBlur(actor) {
        if (!actor.mapped)
            return false;
        // Use transformed actor bounds so translations/scaling are included.
        // Include a conservative sampling margin, as on the dock.
        const [x, y] = actor.get_transformed_position();
        const [width, height] = actor.get_transformed_size();
        const bounds = this._getBlurBounds();
        if (![x, y, width, height, bounds.x, bounds.y, bounds.right, bounds.bottom].every(Number.isFinite))
            return true;
        return x < bounds.right && x + width > bounds.x &&
            y < bounds.bottom && y + height > bounds.y;
    }

    // Share stage bounds across window events; geometry/settings and frame
    // boundaries invalidate them so ancestor transforms cannot persist in cache.
    _getBlurBounds() {
        if (!this._blurBounds) {
            const [x, y] = this._blur.get_transformed_position();
            const [width, height] = this._blur.get_transformed_size();
            const transformScale = Math.max(1, width / this._blur.width || 1,
                height / this._blur.height || 1);
            const margin = Math.max(64, 3 * this._settings.get_int('blur-radius')) *
                this._context.scale_factor * transformScale;
            this._blurBounds = {
                x: x - margin, y: y - margin,
                right: x + width + margin, bottom: y + height + margin,
            };
        }
        return this._blurBounds;
    }

    _refreshWindowIntersections() {
        this._blurBounds = null;
        for (const [actor, record] of this._windows)
            record.affected = this._windowIntersectsBlur(actor);
    }

    _untrackWindow(actor) {
        const record = this._windows.get(actor);
        if (!record)
            return;
        record.signals.clear();
        this._windows.delete(actor);
        if (record.affected)
            this._queueRepaint();
    }

    _trackWindow(actor) {
        if (!this._group.visible || !this._blur.visible || this._windows.has(actor) || !actor.get_meta_window)
            return;
        const signals = new Signals();
        const record = {signals, affected: this._windowIntersectsBlur(actor)};
        this._windows.set(actor, record);
        const update = () => {
            if (!this._group.visible)
                return;
            const affected = this._windowIntersectsBlur(actor);
            // Moving away still invalidates the old footprint once.
            if (affected || record.affected)
                this._queueRepaint();
            record.affected = affected;
        };
        const changes = ['notify::allocation', 'notify::visible', 'notify::mapped',
            'notify::opacity', 'notify::translation-x', 'notify::translation-y',
            'notify::scale-x', 'notify::scale-y'];
        if (GObject.signal_lookup('damaged', actor))
            changes.push('damaged');
        for (const signal of changes)
            signals.connect(actor, signal, update);
        signals.connect(actor, 'destroy', () => this._untrackWindow(actor));
        if (record.affected)
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
                if (actor === this.menu.box) {
                    if (!this._settingStyle) {
                        this._readThemeCorners();
                        this._updateEffectCorners();
                    }
                    this._opaqueUntil = this._styleUntil;
                    this._syncVisibility();
                }
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
        this._panelPolicy?.destroy();
        this._panelPolicy = null;
        this._panelReveal?.remove_transition('value');
        this._panelReveal = null;
        this._panelFade = null;
        this._frames.clear();
        this._signals.clear();
        for (const signals of this._children.values())
            signals.clear();
        for (const {signals} of this._windows.values())
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
        this._panelTint = null;
        this._panelCover = null;
        this._effect = null;
        if (!menuDestroyed) {
            this.menu.box.set_style(this._originalBoxStyle);
            if (!this._options.plain)
                this.menu.actor.set_style(this._originalMenuStyle);
        }
        this._settings = null;
    }
}
