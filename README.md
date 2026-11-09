# GNOME Extended

Blur e transparência para superfícies do GNOME Shell, integração com Dash to Dock
e forks, e sombra dos ícones da grade, dos docks e do Alt+Tab. Versão **23**.

## Configurações

As preferências estão organizadas em seis abas:

- **Elementos:** notificações/calendário, configurações rápidas, diálogos,
  banners, pastas, alternadores, indicadores de volume/brilho, captura de tela,
  menus, overview e tela de bloqueio.
- **Janelas:** transparência apenas no fundo da barra lateral do Arquivos e
  nos menus de contexto GTK 4 e na área do terminal Ptyxis (barra de título opaca), com a opacidade geral da aba Blur. Textos, ícones e
  a área de arquivos permanecem opacos. Intensidade, brilho e frequência também seguem a aba Blur.
  A opção de transparência da janela inteira foi removida.
- **Dock:** ativação de blur e transparência nos docks compatíveis detectados,
  com opção **Fundo 100% transparente no overview**. Remove fundo, contorno,
  sombra do fundo e blur enquanto a visão geral estiver aberta e restaura a
  aparência anterior ao fechar, com fade in/out de 250 ms como na barra superior.
  Funciona também com o blur normal desativado;
  vem ligada por padrão e pode ser desativada na aba Dock.
- **Barra superior:** ativação, escolhas por tema e opacidade automática com
  janelas maximizadas ou em tela cheia no monitor da barra.
- **Blur:** intensidade, opacidade, brilho e frequência compartilhados, com link
  para o projeto do backend. Opacidade de 100% cobre o blur com fundo opaco.
- **Ícones:** switches independentes para **grade de aplicativos/pastas** e
  **dock** e **alternador de aplicativos (Alt+Tab)**; intensidade, deslocamentos
  e desfoque da sombra são compartilhados.

As preferências do App Grid Extended foram integradas. Seu schema e caminho
original permanecem para conservar os valores existentes. Desative o App Grid
independente para evitar duplicação. A preferência global antiga de sombra é
migrada para os três switches sem sobrescrever escolhas novas.

## Instalação

Baixe o ZIP na [release estável](https://github.com/mcdalbu/gnome-extended/releases/latest):

```sh
gnome-extensions install --force gnome-extended@local_v23.zip
```

Saia da sessão e entre novamente para carregar a atualização. O UUID continua
`gnome-extended@local`. Abra as preferências pelo aplicativo Extensões ou com:

```sh
gnome-extensions prefs gnome-extended@local
```

## Backend opcional

O projeto de origem é [GNOME Rounded Blur](https://github.com/kancko/gnome-rounded-blur).
Sem biblioteca compatível, a extensão usa `Shell.BlurEffect` na frequência integral.
Half-rate e quarter-rate exigem um backend que exponha a propriedade `frame-divisor`,
como o pacote local `1.0.2-4.local`. Esse recurso não é presumido em qualquer
build do projeto de origem. O RPM opcional é específico para Fedora 45 x86_64 /
Mutter 51; o SRPM correspondente acompanha o binário na release.

O monitor e os controles continuam na frequência normal: só a captura/desfoque
é limitada. Mudanças no raio do blur/geometria e reabertura invalidam o cache.
Brilho e arredondamento reutilizam a textura; uma captura final atualiza cenas
que param durante o intervalo de half-rate ou quarter-rate.
A proteção de redraw completo por view é mantida com raio positivo para evitar captura parcial.

## Docks

A detecção independe do UUID e não importa código de outra extensão. Reconhece
`dashtodockContainer`, marcadores de Dash to Dock e estruturas com
`dash-background`/`overview-icon`. Forks que substituam esse contrato precisam
de adaptação. Outros docks com blur próprio devem desativá-lo para evitar
composição dupla. Dash to Dock Extended 28 já delega esses efeitos ao GNOME Extended.

## Desenvolvimento

```sh
make check
make zip-file
SOFT_TEST_DOCK_FIXTURES=1 python3 tests/headless.py
SOFT_TEST_PANEL_SCENE=1 SOFT_TEST_PANEL_BLUR=1 SOFT_TEST_SURFACES=1 python3 tests/headless.py
```

Os testes gráficos criam uma sessão D-Bus/Wayland privada, sem modificar o desktop.
Exigem GNOME Shell 50/51, GJS e PyGObject. Metadados permitem GNOME 45–51;
a validação desta release foi feita no GNOME Shell 51.1.

Veja [RELEASE_NOTES.md](RELEASE_NOTES.md) e [VALIDATION.md](VALIDATION.md).


A barra superior no tema escuro mantém a cor definida pelo tema do GNOME,
tanto transparente quanto opaca. O cinza Adwaita e a troca de cor ao ficar
opaca foram removidos; a transparência, o blur e suas transições continuam ativos.

## Transparência por elemento

Na aba **Janelas**, ative **Arquivos: apenas a barra lateral** e/ou **Menus de
contexto dos aplicativos GTK 4**. Para a lateral desfocada, ative também o blur
atrás das janelas. Menus têm seu próprio switch de ativação; a aparência é compartilhada com a aba Blur.
O menu da borda da janela, desenhado pelo Shell, usa **Elementos → Menus contextuais**.

Os fundos são estilizados em blocos identificados de `~/.config/gtk-4.0/gtk.css`;
as demais regras pessoais são preservadas. Reabra os aplicativos após mudar o
estilo. Desativar um switch remove seu bloco. O estilo GTK persiste ao desligar
somente a extensão; o blur depende dela. Para restaurar o fundo opaco, desative o
switch correspondente nas preferências e reabra o aplicativo.

O perfil da lateral foi validado no Nautilus 51.1 / libadwaita 1.10. Os menus
compatíveis são `GtkPopoverMenu` em GTK 4 moderno (CSS com variáveis e `color-mix`).
GTK 3, Electron e aplicativos com desenho próprio de menus não são estilizados.

A camada de blur acompanha os cantos arredondados do perfil GTK (janela de
Arquivos: 15 px; menus: 12 px), sem fundo retangular fora do contorno. Janelas
maximizadas usam cantos retos. O backend opcional usa sua máscara arredondada;
o fallback nativo recorta a composição diretamente no framebuffer, sem uma
captura intermediária que poderia alterar a imagem desfocada.

## Ptyxis

Na aba **Janelas**, ative **Ptyxis: apenas a área do terminal**. A opção inclui
transparência do fundo e blur, sem depender do switch geral de blur das janelas.
A barra de título e os textos permanecem opacos. Opacidade, intensidade, brilho e
frequência seguem a aba **Blur**. A opacidade nativa dos perfis muda imediatamente,
inclusive nos terminais já abertos; novos perfis também são acompanhados.

A integração usa os schemas do Ptyxis instalado no sistema e modifica apenas
`opacity` dos perfis. Os valores anteriores, incluindo valores não definidos,
são salvos em `~/.config/gnome-extended/ptyxis-opacity.json` e restaurados ao
desativar o switch. Uma alteração manual feita fora da integração antes de
desativá-la é preservada quando difere dos valores aplicados por ela.
O estilo de opacidade persiste ao desligar somente a extensão, como os estilos
GTK; o blur exige a extensão ativa. O Ptyxis não é uma dependência obrigatória.
Instalações Flatpak com schemas isolados não são configuradas por esta opção.
