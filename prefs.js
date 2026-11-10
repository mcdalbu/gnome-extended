// SPDX-License-Identifier: GPL-2.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {PtyxisOpacity} from './ptyxisOpacity.js';
import {saveSidebarStyle} from './sidebarStyle.js';
import {migrateShadowSettings} from './shadowSettings.js';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GnomeExtendedPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const icons = this.getSettings('org.gnome.shell.extensions.app-grid-extended');
        migrateShadowSettings(icons);
        const page = (name, title, icon) => {
            const widget = new Adw.PreferencesPage({name, title, icon_name: icon});
            window.add(widget);
            return widget;
        };
        const group = (parent, title, description) => {
            const widget = new Adw.PreferencesGroup({title, description});
            parent.add(widget);
            return widget;
        };
        const toggle = (parent, source, key, title, subtitle = '', sensitive = null) => {
            const row = new Adw.SwitchRow({name: `setting-${key}`, title, subtitle});
            source.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            if (sensitive)
                source.bind(sensitive, row, 'sensitive', Gio.SettingsBindFlags.GET);
            parent.add(row);
        };
        const spin = (parent, source, key, title, subtitle, lower, upper) => {
            const row = new Adw.SpinRow({name: `setting-${key}`, title, subtitle, digits: 0,
                adjustment: new Gtk.Adjustment({lower, upper, step_increment: 1, page_increment: 5})});
            source.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            parent.add(row);
        };

        const elementsPage = page('elements', 'Elementos', 'view-grid-symbolic');
        const elements = group(elementsPage, 'Superfícies do Shell',
            'Escolha onde aplicar blur e transparência. Dock e barra superior têm abas próprias.');
        for (const [key, title, subtitle] of [
            ['notifications', 'Notificações e calendário', 'Menu aberto ao clicar no relógio.'],
            ['quick-settings', 'Configurações rápidas', 'Rede, áudio, energia e outros controles.'],
            ['system-dialogs', 'Diálogos do sistema', 'Confirmações e outros diálogos do Shell.'],
            ['notification-banners', 'Notificações flutuantes', 'Banners exibidos no topo da tela.'],
            ['app-folders', 'Pastas de aplicativos', 'Pastas abertas na grade.'],
            ['window-switcher', 'Alternador de janelas', 'Seletores Alt+Tab e Super+Tab.'],
            ['osd-windows', 'Volume e brilho', 'Indicadores das teclas de volume e brilho.'],
            ['workspace-switcher', 'Troca de área de trabalho', 'Indicador de áreas de trabalho.'],
            ['screenshot-ui', 'Captura de tela', 'Controles de captura e gravação.'],
            ['popup-menus', 'Menus contextuais', 'Menus de aplicativos e outros menus do Shell.'],
            ['overview-background', 'Overview, grade e pesquisa', 'Papel de parede da visão geral.'],
            ['lock-screen', 'Tela de bloqueio', 'Papel de parede desfocado; relógio e autenticação nítidos.'],
        ])
            toggle(elements, settings, key, title, subtitle);

        const windowsPage = page('windows', 'Janelas', 'focus-windows-symbolic');
        const sidebar = group(windowsPage, 'Elementos do aplicativo',
            'Transparência apenas no fundo do elemento. Textos, ícones e a área de arquivos permanecem opacos.');
        toggle(sidebar, settings, 'windows-nautilus-sidebar', 'Arquivos: apenas a barra lateral',
            'Inclui o cabeçalho da lateral esquerda. A área de arquivos permanece opaca.');
        toggle(sidebar, settings, 'windows-settings-sidebar', 'Configurações: apenas a barra lateral',
            'Inclui o cabeçalho da lateral. Reabra pelo lançador de aplicativos para aplicar; o conteúdo permanece opaco.');
        toggle(sidebar, settings, 'windows-app-menus', 'Menus de contexto dos aplicativos GTK 4',
            'Transparência no fundo e blur, preservando o texto. Inclui o menu de botão direito do Arquivos.');
        toggle(sidebar, settings, 'windows-ptyxis', 'Ptyxis: apenas a área do terminal',
            'Transparência e blur no fundo do terminal. A barra de título permanece opaca; usa os valores gerais da aba Blur. Ao desativar, restaura a opacidade anterior dos perfis.');
        const ptyxisOpacity = new PtyxisOpacity(settings);
        const sidebarStatus = new Adw.ActionRow({title: 'Aplicação do estilo',
            subtitle: 'Reabra os aplicativos após alterar o estilo. Aplicativos com menus próprios, como Electron, não são estilizados.'});
        sidebar.add(sidebarStatus);
        const syncSidebarStyle = () => {
            try {
                saveSidebarStyle(settings);
                const hasPtyxis = ptyxisOpacity.sync();
                sidebarStatus.subtitle = settings.get_boolean('windows-ptyxis') && !hasPtyxis ? 'Ptyxis não está instalado ou seu schema de opacidade não está disponível.' : 'Reabra os aplicativos após alterar o estilo. Aplicativos com menus próprios, como Electron, não são estilizados.';
            } catch (error) {
                sidebarStatus.subtitle = `Não foi possível aplicar o estilo: ${error.message}`;
            }
        };
        const sidebarSignals = ['windows-nautilus-sidebar', 'windows-settings-sidebar', 'windows-app-menus', 'windows-ptyxis', 'opacity'].map(key =>
            settings.connect(`changed::${key}`, syncSidebarStyle));
        window.connect('close-request', () => {
            for (const id of sidebarSignals)
                settings.disconnect(id);
            ptyxisOpacity.destroy();
            return false;
        });
        syncSidebarStyle();
        const windows = group(windowsPage, 'Blur das janelas e menus',
            'O conteúdo do aplicativo permanece opaco. O blur aparece atrás dos elementos transparentes compatíveis.');
        toggle(windows, settings, 'windows-blur', 'Ativar blur atrás das janelas',
            'Funciona com as barras laterais transparentes do Arquivos e do Configurações. Áreas opacas cobrem o blur.');

        windows.add(new Adw.ActionRow({title: 'Aparência compartilhada',
            subtitle: 'Opacidade, intensidade, brilho e frequência seguem os valores da aba Blur.'}));

        const dockPage = page('dock', 'Dock', 'view-app-grid-symbolic');
        const dock = group(dockPage, 'Dash to Dock e forks',
            'Aplicação independente do dock instalado, para estruturas compatíveis.');
        toggle(dock, settings, 'docks', 'Blur e transparência no dock',
            'Acompanha os movimentos, a posição e a visibilidade de cada dock.');
        toggle(dock, settings, 'dock-transparent-in-overview', 'Fundo 100% transparente no overview',
            'Remove fundo, contorno, sombra do fundo e blur enquanto a visão geral estiver aberta. Ao fechar, restaura a aparência anterior.');
        dock.add(new Adw.ActionRow({title: 'Aparência compartilhada',
            subtitle: 'Ajuste intensidade, opacidade, brilho e frequência na aba Blur. A sombra dos ícones fica na aba Ícones.'}));

        const panelPage = page('panel', 'Barra superior', 'view-dual-symbolic');
        const panel = group(panelPage, 'Barra superior', 'Configurações da barra de relógio e indicadores.');
        toggle(panel, settings, 'top-panel', 'Blur e transparência na barra superior');
        const themes = group(panelPage, 'Por tema', 'Ao desativar um tema, a barra usa o visual padrão do GNOME.');
        for (const [key, title] of [
            ['panel-enabled-dark', 'Ativar no tema escuro'],
            ['panel-enabled-light', 'Ativar no tema claro'],
        ])
            toggle(themes, settings, key, title, '', 'top-panel');
        const automatic = group(panelPage, 'Opacidade automática',
            'Com uma janela maximizada ou em tela cheia no monitor da barra e na área de trabalho atual.');
        for (const [key, title] of [
            ['panel-opaque-dark', 'Opaca no tema escuro'],
            ['panel-opaque-light', 'Opaca no tema claro'],
        ])
            toggle(automatic, settings, key, title, 'Ao restaurar ou minimizar, volta à opacidade da aba Blur.', 'top-panel');

        const blurPage = page('blur', 'Blur', 'weather-fog-symbolic');
        const blur = group(blurPage, 'Aparência do blur',
            'Valores compartilhados por todas as superfícies habilitadas. Os cantos seguem o tema de cada elemento.');
        for (const args of [
            ['blur-radius', 'Intensidade do desfoque', 'Pixels lógicos.', 1, 100],
            ['opacity', 'Opacidade do fundo (%)', '100% cobre o blur com um fundo opaco.', 0, 100],
            ['brightness', 'Brilho do desfoque (%)', 'Luminosidade da imagem atrás da superfície.', 10, 100],
        ])
            spin(blur, settings, ...args);
        const performance = group(blurPage, 'Atualização',
            'Half-rate e quarter-rate reutilizam o blur entre capturas; controles e animações mantêm a frequência normal.');
        const rate = new Adw.ComboRow({name: 'setting-blur-rate', title: 'Frequência do blur',
            subtitle: 'Requer backend 1.0.2-3.beta2 ou posterior. O fallback nativo usa frequência integral.',
            model: Gtk.StringList.new(['Integral', 'Half-rate (½)', 'Quarter-rate (¼)'])});
        settings.bind('blur-rate', rate, 'selected', Gio.SettingsBindFlags.DEFAULT);
        performance.add(rate);
        const backend = group(blurPage, 'Backend de blur',
            'GNOME Rounded Blur oferece cantos arredondados e os modos de frequência reduzida.');
        const backendRow = new Adw.ActionRow({title: 'GNOME Rounded Blur', subtitle: 'Código-fonte e informações do projeto no GitHub.'});
        backendRow.add_suffix(new Gtk.LinkButton({label: 'GitHub',
            uri: 'https://github.com/kancko/gnome-rounded-blur', valign: Gtk.Align.CENTER}));
        backend.add(backendRow);

        const iconsPage = page('icons', 'Ícones', 'preferences-desktop-appearance-symbolic');
        const shadow = group(iconsPage, 'Sombra dos ícones', 'Parâmetros compartilhados pela grade, pastas, docks detectados e alternador de aplicativos.');
        toggle(shadow, icons, 'icon-shadow-grid-enabled', 'Na grade de aplicativos', 'Inclui as pastas de aplicativos.');
        toggle(shadow, icons, 'icon-shadow-dock-enabled', 'No dock', 'Dash to Dock e forks compatíveis detectados.');
        toggle(shadow, icons, 'icon-shadow-switcher-enabled', 'No alternador de aplicativos (Alt+Tab)', 'Aplica sombra aos ícones dos aplicativos no alternador.');
        for (const args of [
            ['icon-shadow-intensity', 'Opacidade da sombra (%)', '', 0, 100],
            ['icon-shadow-offset-x', 'Deslocamento horizontal (px)', '', -32, 32],
            ['icon-shadow-offset-y', 'Deslocamento vertical (px)', '', -32, 32],
            ['icon-shadow-blur', 'Desfoque da sombra (px)', '', 0, 32],
        ])
            spin(shadow, icons, ...args);

        const resetGroup = group(elementsPage, 'Padrões', 'Restaura as configurações de todas as abas.');
        const reset = new Adw.ActionRow({title: 'Restaurar os padrões'});
        const button = new Gtk.Button({label: 'Restaurar', valign: Gtk.Align.CENTER});
        button.connect('clicked', () => {
            for (const source of [settings, icons]) {
                for (const key of source.settings_schema.list_keys())
                    source.reset(key);
            }
        });
        reset.add_suffix(button);
        reset.activatable_widget = button;
        resetGroup.add(reset);
    }
}
