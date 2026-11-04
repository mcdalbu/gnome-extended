// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import St from 'gi://St';
import {migrateShadowSettings} from './shadowSettings.js';

export class AppGrid {
    constructor(settings) {
        this._settings = settings;
    }

    start() {
        migrateShadowSettings(this._settings);
        this._context = St.ThemeContext.get_for_stage(global.stage);
        this._settingsId = this._settings.connect('changed', () => this._sync());
        this._themeId = this._context.connect('changed', () => this._sync());
        try {
            this._sync();
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    _unloadStylesheet() {
        if (!this._file || !this._theme)
            return;

        // The Shell copies custom stylesheets when replacing its theme.
        for (const theme of new Set([this._theme, this._context.get_theme()]))
            theme?.unload_stylesheet(this._file);
    }

    _sync() {
        if (this._updating)
            return;
        const settings = this._settings;
        const shadow = `icon-shadow: ${settings.get_int('icon-shadow-offset-x')}px ` +
            `${settings.get_int('icon-shadow-offset-y')}px ` +
            `${settings.get_int('icon-shadow-blur')}px rgba(0, 0, 0, ` +
            `${settings.get_int('icon-shadow-intensity') / 100});`;
        const grid = settings.get_boolean('icon-shadow-grid-enabled') ? shadow : 'icon-shadow: none;';
        const dock = settings.get_boolean('icon-shadow-dock-enabled') ? shadow : 'icon-shadow: none;';
        const css = `.apps-scroll-view .overview-icon StIcon {${grid}}` +
            '#dashtodockContainer.gnome-extended-dock.gnome-extended-dock .overview-icon StIcon, ' +
            '.gnome-extended-dock.gnome-extended-dock.gnome-extended-dock.gnome-extended-dock .overview-icon StIcon ' +
            `{${dock}}`;
        const theme = this._context.get_theme();
        if (this._theme === theme && this._css === css)
            return;

        // Loading or unloading a stylesheet emits ThemeContext::changed.
        this._updating = true;
        try {
            if (!this._file) {
                const [file, stream] = Gio.File.new_tmp('app-grid-extended-shadow-XXXXXX');
                this._file = file;
                stream.close(null);
            }
            this._unloadStylesheet();
            this._file.replace_contents(css, null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            theme.load_stylesheet(this._file);
            this._css = css;
            this._theme = theme;
        } finally {
            this._updating = false;
        }
    }

    destroy() {
        if (this._settingsId)
            this._settings.disconnect(this._settingsId);
        if (this._themeId)
            this._context.disconnect(this._themeId);
        this._settingsId = 0;
        this._themeId = 0;
        this._unloadStylesheet();
        this._file?.delete(null);
        this._file = null;
        this._theme = null;
        this._css = null;
        this._settings = null;
        this._context = null;
    }
}
