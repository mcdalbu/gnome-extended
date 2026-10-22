// SPDX-License-Identifier: GPL-2.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GnomeShellSoftPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({
            title: 'Aparência', icon_name: 'preferences-desktop-appearance-symbolic',
        });
        window.add(page);
        const surfaces = new Adw.PreferencesGroup({
            title: 'Gnome Shell Soft',
            description: 'Blur dinâmico e transparência, aplicados ao vivo.',
        });
        page.add(surfaces);
        for (const [key, title, subtitle] of [
            ['notifications', 'Notificações e calendário', 'Menu aberto ao clicar no relógio.'],
            ['quick-settings', 'Configurações rápidas', 'Menu de rede, áudio, energia e outros controles.'],
        ]) {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            surfaces.add(row);
        }
        const appearance = new Adw.PreferencesGroup({
            title: 'Fundo dos menus',
            description: 'Os ajustes afetam os dois menus. Textos e ícones mantêm sua opacidade.',
        });
        page.add(appearance);
        for (const [key, title, subtitle, lower, upper] of [
            ['blur-radius', 'Intensidade do desfoque', 'De 1 a 100 pixels lógicos.', 1, 100],
            ['opacity', 'Opacidade do fundo (%)', '0% transparente; 100% opaco.', 0, 100],
            ['brightness', 'Brilho do desfoque (%)', 'Luminosidade da imagem atrás do fundo.', 10, 100],
            ['corner-radius', 'Raio dos cantos',
                'Em pixels lógicos. O recorte do blur requer GNOME Rounded Blur ou suporte nativo.', 0, 100],
        ]) {
            const row = new Adw.SpinRow({
                title, subtitle,
                adjustment: new Gtk.Adjustment({lower, upper, step_increment: 1, page_increment: 10}),
                digits: 0,
            });
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            appearance.add(row);
        }
        const reset = new Adw.ActionRow({title: 'Restaurar os padrões'});
        const button = new Gtk.Button({label: 'Restaurar', valign: Gtk.Align.CENTER});
        button.connect('clicked', () => {
            for (const key of ['notifications', 'quick-settings', 'blur-radius',
                'opacity', 'brightness', 'corner-radius'])
                settings.reset(key);
        });
        reset.add_suffix(button);
        reset.activatable_widget = button;
        appearance.add(reset);
    }
}
