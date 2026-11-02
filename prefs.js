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
            ['system-dialogs', 'Diálogos do sistema', 'Fundo de confirmações e outros diálogos do Shell.'],
            ['notification-banners', 'Notificações flutuantes', 'Banners exibidos no topo da tela.'],
            ['app-folders', 'Pastas de aplicativos', 'Fundo das pastas abertas na grade de aplicativos.'],
            ['top-panel', 'Barra superior', 'Fundo da barra de relógio e indicadores, com cantos retos.'],
            ['window-switcher', 'Alternador de janelas', 'Fundo dos seletores Alt+Tab e Super+Tab.'],
            ['osd-windows', 'Volume e brilho', 'Indicadores exibidos pelas teclas de volume e brilho.'],
            ['workspace-switcher', 'Troca de área de trabalho', 'Indicador ao alternar entre áreas de trabalho.'],
            ['screenshot-ui', 'Captura de tela', 'Painel de controles da captura de tela e gravação.'],
            ['popup-menus', 'Menus contextuais', 'Menus de aplicativos e outros menus do Shell.'],
            ['overview-background', 'Overview, grade e pesquisa', 'Papel de parede desfocado atrás da visão geral, grade e pesquisa.'],
            ['lock-screen', 'Tela de bloqueio', 'Personaliza o blur nativo do papel de parede; relógio e autenticação permanecem nítidos.'],
        ]) {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            surfaces.add(row);
        }
        const appearance = new Adw.PreferencesGroup({
            title: 'Fundo das superfícies',
            description: 'Intensidade e brilho compartilhados. Opacidade e cantos ajustam as superfícies; a barra mantém cantos retos.',
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
            for (const key of ['notifications', 'quick-settings', 'system-dialogs',
                'notification-banners', 'app-folders', 'top-panel', 'window-switcher',
                'osd-windows', 'workspace-switcher', 'screenshot-ui', 'popup-menus',
                'overview-background', 'lock-screen', 'blur-radius',
                'opacity', 'brightness', 'corner-radius'])
                settings.reset(key);
        });
        reset.add_suffix(button);
        reset.activatable_widget = button;
        appearance.add(reset);
    }
}
