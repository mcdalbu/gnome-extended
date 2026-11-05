# GNOME Extended

Blur e transparência para superfícies do GNOME Shell, integração com Dash to Dock
e forks, e sombra dos ícones da grade e dos docks. Versão estável **11**.

## Configurações

As preferências estão organizadas em cinco abas:

- **Elementos:** notificações/calendário, configurações rápidas, diálogos,
  banners, pastas, alternadores, indicadores de volume/brilho, captura de tela,
  menus, overview e tela de bloqueio.
- **Dock:** ativação de blur e transparência nos docks compatíveis detectados.
- **Barra superior:** ativação, escolhas por tema e opacidade automática com
  janelas maximizadas ou em tela cheia no monitor da barra.
- **Blur:** intensidade, opacidade, brilho e frequência compartilhados, com link
  para o projeto do backend. Opacidade de 100% cobre o blur com fundo opaco.
- **Ícones:** switches independentes para **grade de aplicativos/pastas** e
  **dock**; intensidade, deslocamentos e desfoque da sombra são compartilhados.

As preferências do App Grid Extended foram integradas. Seu schema e caminho
original permanecem para conservar os valores existentes. Desative o App Grid
independente para evitar duplicação. A preferência global antiga de sombra é
migrada para os dois switches sem sobrescrever escolhas novas.

## Instalação

Baixe o ZIP na [release estável](https://github.com/mcdalbu/gnome-extended/releases/latest):

```sh
gnome-extensions install --force gnome-extended@local_v12.zip
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
como o pacote local `1.0.2-3.beta2.local`. Esse recurso não é presumido em qualquer
build do projeto de origem. O RPM opcional é específico para Fedora 45 x86_64 /
Mutter 51; o SRPM correspondente acompanha o binário na release.

O monitor e os controles continuam na frequência normal: só a captura/desfoque
é limitada. Mudanças de parâmetros/geometria e reabertura invalidam o cache.
A proteção de redraw completo por view é mantida para evitar captura parcial.

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
```

Os testes gráficos criam uma sessão D-Bus/Wayland privada, sem modificar o desktop.
Exigem GNOME Shell 50/51, GJS e PyGObject. Metadados permitem GNOME 45–51;
a validação desta release foi feita no GNOME Shell 51.1.

Veja [RELEASE_NOTES.md](RELEASE_NOTES.md) e [VALIDATION.md](VALIDATION.md).
