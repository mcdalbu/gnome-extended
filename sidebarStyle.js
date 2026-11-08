// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BEGIN = '/* BEGIN GNOME Extended: Nautilus sidebar */';
const END = '/* END GNOME Extended: Nautilus sidebar */';

export function sidebarCss(opacity) {
    const percent = Math.max(0, Math.min(100, opacity));
    return `${BEGIN}
/* Scoped to Files. Change background paint, never widget opacity. */
window.nautilus-window {
    background-color: transparent;
    border-radius: 15px;
}
window.nautilus-window.maximized, window.nautilus-window.fullscreen {
    border-radius: 0;
}
window.nautilus-window .content-pane {
    background-color: var(--view-bg-color);
}
window.nautilus-window .sidebar-pane {
    background-color: color-mix(in srgb, var(--sidebar-bg-color) ${percent}%, transparent);
}
window.nautilus-window .sidebar-pane:backdrop {
    background-color: color-mix(in srgb, var(--sidebar-backdrop-color) ${percent}%, transparent);
}
${END}`;
}

export function menuCss(opacity) {
    return `/* BEGIN GNOME Extended: GTK4 context menus */
popover.menu > contents {
    border-radius: 12px;
    background-color: color-mix(in srgb, var(--popover-bg-color, @theme_bg_color) ${Math.max(0, Math.min(100, opacity))}%, transparent);
}
/* END GNOME Extended: GTK4 context menus */`;
}

function updateBlock(original, enabled, css, begin, finish) {
    const start = original.indexOf(begin);
    const end = original.indexOf(finish);
    if ((start < 0) !== (end < 0) || (start >= 0 && end < start))
        throw new Error('O bloco GTK do GNOME Extended está incompleto; o arquivo foi preservado.');
    if (start >= 0) {
        const before = original.slice(0, start);
        const after = original.slice(end + finish.length);
        return before + (enabled ? css : '') + after;
    }
    if (!enabled)
        return original;
    return original + (original && !original.endsWith('\n') ? '\n' : '') + css + '\n';
}

export function updateSidebarBlock(original, enabled, opacity) {
    return updateBlock(original, enabled, sidebarCss(opacity), BEGIN, END);
}

export function updateMenuBlock(original, enabled, opacity) {
    return updateBlock(original, enabled, menuCss(opacity),
        '/* BEGIN GNOME Extended: GTK4 context menus */',
        '/* END GNOME Extended: GTK4 context menus */');
}

export function saveSidebarStyle(settings) {
    const directory = GLib.build_filenamev([GLib.get_user_config_dir(), 'gtk-4.0']);
    const file = Gio.File.new_for_path(GLib.build_filenamev([directory, 'gtk.css']));
    let original = '';
    let etag = null;
    try {
        const [, bytes, loadedEtag] = file.load_contents(null);
        original = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
        etag = loadedEtag;
    } catch (error) {
        if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw error;
    }
    const sidebar = updateSidebarBlock(original,
        settings.get_boolean('windows-nautilus-sidebar'),
        settings.get_int('opacity'));
    const result = updateMenuBlock(sidebar, settings.get_boolean('windows-app-menus'),
        settings.get_int('opacity'));
    if (result === original)
        return;
    GLib.mkdir_with_parents(directory, 0o700);
    // The etag prevents overwriting a concurrent edit by another program.
    file.replace_contents(result, etag, true, Gio.FileCreateFlags.NONE, null);
}
