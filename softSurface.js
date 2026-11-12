// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import {ANIMATION_TIME} from 'resource:///org/gnome/shell/ui/overview.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';

import {loadBlurBackend, applyBlurParameters, applyBlurRate, opacityFraction} from './blurBackend.js';
import {BlurRedrawGuard} from './blurRedrawGuard.js';
import {Signals} from './signals.js';
import {FrameSignals} from './frameSignals.js';
import {syncBackdropCapture, updateCaptureAppearance} from './backdropCapture.js';
import {RoundedClip} from './roundedClip.js';
import {PanelOpacity} from './panelOpacity.js';
import {boundsIntersect, windowDamage} from './windowDamage.js';

const BlurBackend = await loadBlurBackend(Shell, GObject);
// Older Shells keep the BoxPointer duration private.
const popupAnimationTime = BoxPointer.POPUP_ANIMATION_TIME ?? 150;

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
        this._trackingFrames = false;
        this._children = new Map();
        this._stopWindowDamage = null;
        this._guard = new BlurRedrawGuard(Clutter, Meta);
        this._later = 0;
        this._styleUntil = 0;
        this._openingUntil = 0;
        this._opaqueUntil = 0;
        this._opaqueTimeout = 0;
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
            this._clip = new RoundedClip();
            if (options.plain)
                this._clip.clipSource = menu.box;
            this._blur.add_effect_with_name('gnome-extended-backdrop-clip', this._clip);
            this._captureState = {blur: this._blur, captures: new Map()};
            if (options.dock) {
                // dash-background is separate from the dock's icon container.
                // Fade its complete theme paint, including images and shadows.
                this._originalBoxOpacity = menu.box.opacity;
                this._dockFade = new St.Adjustment({
                    actor: menu.box, lower: 0, upper: 1,
                    value: options.transparent() ? 0 : 1,
                });
                this._signals.connect(this._dockFade, 'notify::value', () => {
                    this._applyDockFade();
                    this._updateBlurAppearance();
                    this._syncVisibility();
                });
                this._signals.connect(menu.box, 'notify::opacity', () => {
                    if (menu.box.opacity === this._appliedBoxOpacity)
                        return;
                    this._originalBoxOpacity = menu.box.opacity;
                    this._applyDockFade();
                });
                this._applyDockFade();
            }
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
                this._signals.connect(St.Settings.get(), 'notify::color-scheme', () => this._refreshTheme());
            }
            this._signals.connect(this._group, 'destroy', () => {
                // A Shell container may destroy siblings before their surface.
                this._group = null;
                this.destroy(true);
                onDestroyed();
            });
            const anchor = options.anchor ?? menu.actor;
            anchor.get_parent().insert_child_below(this._group, anchor);
            if (options.plain) {
                // The slider keeps the dock mapped and changes its clip in
                // allocation. Observe those ancestors independently of paint.
                for (let source = menu.box; source && source !== this._group.get_parent(); source = source.get_parent()) {
                    for (const property of ['allocation', 'clip-rect', 'has-clip', 'opacity', 'mapped'])
                        this._signals.connect(source, `notify::${property}`, () => {
                            this._queueDockSync();
                        });
                }
            }
            this._replaceEffect();

            // PopupMenu raises itself on open. Raise the separate backdrop with
            // it so other Shell layers cannot end up between blur and surface.
            this._signals.connect(menu, 'open-state-changed', (_menu, open) => {
                if (open) {
                    const anchor = options.anchor ?? menu.actor;
                    const parent = anchor.get_parent();
                    parent.set_child_below_sibling(this._group, anchor);
                    this._stackPending = true;
                    this._openingUntil = GLib.get_monotonic_time() + popupAnimationTime * 1000;
                    this._refreshTheme();
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
                    this._refreshTheme();
                });
            }

            this._signals.connect(menu.actor, 'destroy', () => {
                this.destroy(true);
                onDestroyed();
            });
            const syncMapping = () => {
                // Reuse GPU resources on ordinary reopening; recovery after
                // sleep/lock still explicitly replaces the effect.
                if (!this._themeColor && menu.actor.mapped && menu.box.mapped)
                    this.update();
                else
                    this._syncVisibility();
                this._queueRepaint();
            };
            this._signals.connect(menu.actor, 'notify::mapped', syncMapping);
            if (menu.box !== menu.actor) {
                this._signals.connect(menu.box, 'notify::mapped', syncMapping);
            }
            this._signals.connect(menu.actor, 'notify::opacity', () => this._syncVisibility());
            this._signals.connect(Main.layoutManager, 'monitors-changed', () => {
                this._replaceEffect();
                this._queueRepaint();
            });
            this._signals.connect(this._context, 'changed', () => {
                this._themeColor = null;
                if (menu.actor.mapped && menu.box.mapped)
                    this.update();
            });
            this._signals.connect(this._login, 'prepare-for-sleep', (_login, sleeping) => {
                this._sleeping = sleeping;
                this._recover();
            });
            this._signals.connect(Main.sessionMode, 'updated', () => this._recover());
            if (Main.screenShield)
                this._signals.connect(Main.screenShield, 'active-changed', () => this._recover());

            this._signals.connect(global.display, 'restacked', () => this._queueRepaint());

            this._trackChild(menu.box);
            this.update();
            this._panelPolicy?.start();
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    _syncFrames(visible) {
        if (visible === this._trackingFrames)
            return;
        this._trackingFrames = visible;
        if (!visible) {
            this._frames.clear();
            this._guard.end();
            return;
        }
        this._frames.connect(global.stage, 'before-update', (_stage, view) => {
            this._blurBounds = null;
            this._syncVisibility();
            if (!this._group.visible)
                return;
            const opening = this._stackPending || (!this._options.plain &&
                (GLib.get_monotonic_time() < this._openingUntil || this.menu.box.get_paint_opacity() < 255));
            if (this._stackPending) {
                const anchor = this._options.anchor ?? this.menu.actor;
                anchor.get_parent().set_child_below_sibling(this._group, anchor);
                this._stackPending = false;
            }
            // During opening, give the moving BoxPointer backdrop an
            // allocation before the first paint, including the initial
            // frame before the box reports its animated opacity.
            if (opening || this._options.dock)
                this._syncGeometry(false);
            // A zero-radius effect paints only the actor, without sampling
            // the framebuffer. Keep partial redraws during that phase.
            if (this._effect[this._radiusProperty] > 0)
                this._guard.begin(this._blur, view, opening ? this._blur : this.menu.box);
            else
                this._guard.end();
            if (this._blur.mapped && GLib.get_monotonic_time() < this._styleUntil)
                this._repaintEffects();
        });
        this._frames.connect(global.stage, 'before-paint', (_stage, view) => {
            this._syncGeometry();
            if (this._blur.visible)
                this._syncCapture(view);
        });
        this._frames.connect(global.stage, 'after-update', () => {
            this._blurBounds = null;
            this._guard.end();
        });
    }

    _replaceEffect() {
        this._guard.end();
        for (const capture of this._captureState.captures.values())
            capture.actor.destroy();
        this._captureState.captures.clear();
        this._captureState.capture = null;
        const properties = BlurBackend.BlurEffect.list_properties().map(property => property.name);
        this._radiusProperty = properties.includes('radius') ? 'radius' : 'sigma';
        this._hasCorners = properties.includes('corner-radius');
        this._effect = new BlurBackend.BlurEffect({mode: BlurBackend.BlurMode.BACKGROUND});
        this._captureState.effect = this._effect;
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
        const fade = this._paintFade();
        const scale = this._captureState.captures.values().next().value?.view.get_scale() ?? this._context.scale_factor;
        applyBlurParameters(this._effect, this._radiusProperty,
            this._settings.get_int('blur-radius') * fade, scale,
            100 + (this._settings.get_int('brightness') - 100) * fade);
        updateCaptureAppearance(this._captureState, this._radiusProperty,
            this._settings.get_int('blur-radius') * fade,
            100 + (this._settings.get_int('brightness') - 100) * fade,
            this._settings.get_int('blur-rate'));
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
        // A conservative clip stays
        // inside surfaces whose theme defines different corner radii.
        return Math.max(...this._themeCorners);
    }

    _updateEffectCorners() {
        const {box} = this.menu;
        const {width, height} = this._blur;
        const transformScale = box.width > 0 && box.height > 0
            ? Math.min(width / box.width, height / box.height) : 1;
        this._clip.radius = Math.max(0, Math.min(this._cornerRadius() * transformScale,
            width / 2, height / 2));
    }

    _syncCapture(view = null) {
        const fade = this._paintFade();
        syncBackdropCapture(this._captureState, view, BlurBackend, this._radiusProperty,
            this._settings.get_int('blur-radius') * fade,
            100 + (this._settings.get_int('brightness') - 100) * fade,
            this._settings.get_int('blur-rate'));
    }

    _paintFade() {
        if (this._panelFade)
            return this._panelFade.value;
        if (!this._options.plain)
            return 1;
        // BACKGROUND effects composite independently of actor opacity. Fade
        // their actual filter to the unchanged framebuffer during Shell fades.
        let fade = this.menu.box.get_paint_opacity() / 255;
        if (this._options.dock) {
            const [x, y] = this.menu.box.get_transformed_position();
            const [width, height] = this.menu.box.get_transformed_size();
            if (width > 0 && height > 0) {
                let area = 0;
                for (const monitor of Main.layoutManager.monitors) {
                    const w = Math.max(0, Math.min(x + width, monitor.x + monitor.width) - Math.max(x, monitor.x));
                    const h = Math.max(0, Math.min(y + height, monitor.y + monitor.height) - Math.max(y, monitor.y));
                    area += w * h;
                }
                fade *= Math.min(1, area / (width * height));
            }
        }
        return fade;
    }

    _repaintEffects() {
        for (const capture of this._captureState.captures.values())
            capture.effect.queue_repaint();
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
            this._settleOpacityAt(GLib.get_monotonic_time() + (duration + 50) * 1000);
        }
    }

    _applyDockFade() {
        this._appliedBoxOpacity = Math.round(this._originalBoxOpacity * this._dockFade.value);
        this.menu.box.opacity = this._appliedBoxOpacity;
    }

    _updateDockFade() {
        if (!this._dockFade)
            return;
        const target = this._options.transparent() ? 0 : 1;
        if (this._dockFadeTarget === target)
            return;
        this._dockFadeTarget = target;
        this._dockFade.remove_transition('value');
        this._dockFade.ease(target, {duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._options.onFadeComplete?.()});
    }

    _refreshTheme() {
        this._themeColor = null;
        this.update();
    }

    update(effectOnly = false) {
        if (effectOnly) {
            this._updateEffect();
            this._blurBounds = null;
            this._queueRepaint();
            return;
        }
        this._panelPolicy?.sync();
        this._updateDockFade();
        // Read the actual theme color before adding our own alpha. Never change
        // the opacity of the content actor: labels and icons must stay sharp.
        const {box, actor} = this.menu;
        this._settingStyle = true;
        if (!this._themeColor) {
            box.set_style(this._originalBoxStyle);
            if (!this._options.plain)
                actor.set_style(this._originalMenuStyle);
            this._themeColor = box.get_theme_node().get_background_color();
            this._readThemeCorners();
        }
        const color = this._themeColor;
        const alpha = opacityFraction(this._settings.get_int('opacity'));
        if (this._options.dock && !this._options.blurEnabled()) {
            this._boxSuffix = '';
        } else if (this._panelTint) {
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
        this._appliedBoxStyle = this._boxSuffix
            ? appendStyle(this._originalBoxStyle, this._boxSuffix) : this._originalBoxStyle;
        if (box.get_style() !== this._appliedBoxStyle) {
            box.set_style(this._appliedBoxStyle);
            const duration = box.get_theme_node().get_transition_duration() + 50;
            this._settleOpacityAt(GLib.get_monotonic_time() + duration * 1000);
        }
        // Older themes draw a second opaque surface in BoxPointer's Cairo
        // border. Suppress just its fill; keep layout, border and input intact.
        if (!this._options.plain) {
            this._menuSuffix = '-arrow-background-color: transparent;';
            this._appliedMenuStyle = appendStyle(this._originalMenuStyle, this._menuSuffix);
            if (actor.get_style() !== this._appliedMenuStyle)
                actor.set_style(this._appliedMenuStyle);
        }
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

    _settleOpacityAt(deadline) {
        this._opaqueUntil = deadline;
        if (this._opaqueTimeout)
            GLib.Source.remove(this._opaqueTimeout);
        this._opaqueTimeout = 0;

        // St reports target alpha. Recheck after the last tint frame even
        // when the desktop stays idle and emits no further stage updates.
        const opaque = this._panelTint ? this._panelAlpha === 1 : this._settings.get_int('opacity') === 100;
        if (opaque) {
            const delay = Math.max(1, Math.ceil((deadline - GLib.get_monotonic_time()) / 1000));
            this._opaqueTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                this._opaqueTimeout = 0;
                this._syncVisibility();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _syncVisibility() {
        let clipped = false;
        if (this._options.plain) {
            for (let source = this.menu.box; source; source = source.get_parent()) {
                if (source.has_clip) {
                    const [, , width, height] = source.get_clip();
                    if (width <= 0 || height <= 0) {
                        clipped = true;
                        break;
                    }
                }
            }
        }
        const active = this.menu.isOpen && this.menu.actor.mapped &&
            (!this._options.plain || (this.menu.box.mapped && this.menu.box.get_paint_opacity() > 0)) && !this._sleeping &&
            !clipped &&
            !Main.sessionMode.isLocked && !Main.screenShield?.active &&
            (this._options.blurEnabled?.() ?? true);
        const alpha = this._panelTint ? this._panelAlpha : opacityFraction(this._settings.get_int('opacity'));
        const opaque = active && alpha === 1 && (this._dockFade?.value ?? 1) === 1 &&
            this.menu.box.get_paint_opacity() === 255 &&
            (this._clip || this._cornerRadius() === 0) &&
            GLib.get_monotonic_time() >= this._opaqueUntil;
        const fade = this._panelFade?.value ?? this._dockFade?.value ?? 1;
        const visible = active && fade > 0 && (!!this._panelTint || !opaque);
        const blurVisible = visible && !opaque;
        const wasVisible = this._group.visible && this._blur.visible;
        this._group.visible = !!visible;
        this._blur.visible = !!blurVisible;
        if (wasVisible && !blurVisible) {
            // A framebuffer blur may have painted beyond Clutter's reported
            // damage bounds. Clear the final image once when hiding it.
            global.stage.queue_redraw();
        }
        this._syncFrames(!!visible);
        if (this._panelCover) {
            this._panelCover.opacity = Math.round(255 * (1 - this._panelReveal.value));
            this._panelCover.visible = blurVisible && this._panelCover.opacity > 0;
        }
        if (!blurVisible) {
            this._stopWindowDamage?.();
            this._stopWindowDamage = null;
            if (this._later)
                global.compositor.get_laters().remove(this._later);
            this._later = 0;
            this._guard.end();
        } else {
            if (!wasVisible) {
                for (const capture of this._captureState.captures.values())
                    capture.effect.invalidate?.();
                this._blurBounds = null;
                this._stopWindowDamage = windowDamage.subscribe(bounds => {
                    if (!this._later && this._blur.mapped &&
                        bounds.some(rect => boundsIntersect(rect, this._getBlurBounds())))
                        this._repaint();
                });
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
        // Some menus animate the BoxPointer inside a permanently opaque root.
        // Suppress the backdrop until that BoxPointer starts painting.
        const opacityActor = this._options.plain ? this.menu.box : (this.menu._boxPointer ?? this.menu.actor);
        this._group.opacity = parentOpacity > 0
            ? Math.min(255, Math.round(255 * (this._dockFade ? 1 : fade) *
                opacityActor.get_paint_opacity() / parentOpacity)) : 0;
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
        // Extend only the painted backdrop. Keep panel content and the Shell's
        // reserved work area unchanged, and convert the extra stage pixel with
        // the rest of the bounds so parent transforms are respected.
        const extraBottom = this._options.panel && this._settings.get_boolean('panel-extend-bottom') ? 1 : 0;
        const [okStart, left, top] = parent.transform_stage_point(x, y);
        const [okEnd, right, bottom] = parent.transform_stage_point(x + width, y + height + extraBottom);
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
        // Geometry may change in before-paint, after BEFORE_REDRAW callbacks.
        // Invalidate the capture for this frame, including the first open frame.
        if (this._blur.mapped)
            this._repaintEffects();
    }

    _queueRepaint() {
        if (this._later || !this._blur?.mapped || !this.menu.actor.mapped)
            return;
        this._later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._later = 0;
            if (this._blur.mapped)
                this._repaint();
            return GLib.SOURCE_REMOVE;
        });
    }

    _queueDockSync() {
        if (this._dockSyncLater || this._destroyed)
            return;
        // Allocation updates ancestors one at a time. Applying visibility or
        // capturing between those notifications mixes two animation frames.
        // Commit clip, geometry and capture together after layout has settled.
        this._dockSyncLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._dockSyncLater = 0;
            this._syncVisibility();
            if (this._blur.visible) {
                this._syncGeometry(false);
                this._syncCapture();
                this._repaint();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _repaint() {
        this._blur.queue_redraw();
        this._repaintEffects();
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
                    this._settleOpacityAt(this._styleUntil);
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
        this._dockFade?.remove_transition('value');
        this._dockFade = null;
        this._frames.clear();
        this._trackingFrames = false;
        this._signals.clear();
        if (this._dockSyncLater)
            global.compositor.get_laters().remove(this._dockSyncLater);
        this._dockSyncLater = 0;
        for (const signals of this._children.values())
            signals.clear();
        this._stopWindowDamage?.();
        this._stopWindowDamage = null;
        this._children.clear();
        if (this._later)
            global.compositor.get_laters().remove(this._later);
        this._later = 0;
        this._guard.end();
        if (this._opaqueTimeout)
            GLib.Source.remove(this._opaqueTimeout);
        this._opaqueTimeout = 0;
        const wasPainting = this._group?.visible;
        this._group?.destroy();
        if (wasPainting)
            global.stage.queue_redraw();
        this._group = null;
        this._blur = null;
        this._captureState?.captures.clear();
        this._captureState = null;
        this._clip = null;
        this._panelTint = null;
        this._panelCover = null;
        this._effect = null;
        if (!menuDestroyed) {
            this.menu.box.set_style(this._originalBoxStyle);
            if (this._options.dock)
                this.menu.box.opacity = this._originalBoxOpacity;
            if (!this._options.plain)
                this.menu.actor.set_style(this._originalMenuStyle);
        }
        this._settings = null;
    }
}
