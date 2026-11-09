# Validação da versão 23 — 8 de novembro de 2026

- `make check`: pacote, schemas, sinais, estilos GTK e perfis do Ptyxis: PASS.
- Ptyxis 50.1 / VTE 0.84.1 real, GNOME Shell 51.1 em sessões Wayland privadas: PASS.
- Backend opcional e fallback nativo; comparação da cena atrás do terminal: delta médio ~34 na área do terminal e 0 na barra de título.
- Ator da janela mantém opacidade 255; somente a opacidade nativa do fundo do VTE é alterada: PASS.
- Blur independente do switch geral das janelas, opacidade compartilhada e restauração de 0,82 após desativar: PASS.
- Teste de perfis em GSettings de memória: perfis existentes/novos, valor original explícito e não definido, reinício, alterações manuais e backup inválido: PASS.
- Regressões de lateral do Arquivos, menus, cantos, geometria, empilhamento, ociosidade, desmontagem e preferências: PASS.
- Inspeção visual do terminal com título opaco e texto nítido: PASS.

Resultados: `validation/ptyxis-backend-results.json` e `validation/ptyxis-native-results.json`.
No harness privado, um substituto de `systemd-run` no PATH do processo de teste executa diretamente o comando de teste, pois a sessão privada não possui um gerenciador systemd de usuário. O aplicativo Ptyxis e o VTE usados na renderização são os instalados no sistema. Terminais da sessão real não são abertos nem encerrados pelos testes.

# Validação da versão 22 — 8 de novembro de 2026

- `make check`: schemas, pacote, sinais, estilos GTK e migração: PASS.
- Nautilus 51.1 real em GNOME Shell 51.1, backend opcional e fallback nativo, temas escuro e claro: PASS.
- Pixels de referência dos quatro cantos da janela e dos menus comparados com blur desligado: diferença zero nos dois backends.
- Lateral transparente continua revelando a cena; a região de arquivos permanece opaca: PASS.
- Intensidade 42 e brilho 70% nos efeitos de janelas/menus, lidos das chaves gerais: PASS.
- Alterar opacidade geral de 45% para 72% atualiza os três fundos GTK (lateral, lateral sem foco e menu): PASS.
- Preferências sem os quatro ajustes separados, bindings e restauração dos padrões: PASS.
- Geometria, empilhamento, novas janelas, fechamento, minimização, fullscreen, overview e ausência de loop de redraw ocioso: PASS.
- Inspeção das capturas dos menus, janela e preferências: PASS.

Resultados em `validation/corners-backend-results.json` e `validation/corners-native-results.json`.
A verificação gráfica desta alteração usou Wayland, monitor virtual com escala 1 e GTK/libadwaita instalados; outras escalas e versões não foram validadas.

# Validação da versão 21 — 8 de novembro de 2026

- `make check`: schemas estritos, pacote, sinais, estilos GTK e migração das sombras: PASS.
- Nautilus 51.1 real em GNOME Shell 51.1 / Wayland privado, libadwaita 1.10: PASS.
- Tema escuro com backend opcional e tema claro com fallback nativo: PASS.
- Troca da cena atrás da lateral altera seus pixels (delta médio ~44), enquanto a região de conteúdo permanece idêntica (delta 0): PASS.
- Menu real aberto com botão direito: ator com opacidade 255, fundo GTK translúcido e backdrop de blur independente: PASS.
- Criação/fechamento de janelas, empilhamento, geometria, minimização, fullscreen, overview, desmontagem e ociosidade: PASS.
- Preferências sem opacidade/transparência global; bindings e restauração de padrões: PASS.
- Adição, atualização e remoção independente dos blocos de estilo com preservação das regras pessoais: PASS.
- Inspeção das capturas dos menus, lateral e nova aba Janelas: PASS.

Resultados: `validation/selective-dark-results.json` e `validation/selective-native-light-results.json`.
GTK 3, X11, outros releases do Nautilus e menus de Electron não foram validados nesta alteração.

# Validação da versão 20 — 8 de novembro de 2026

- `make check`: schemas estritos, identidade do pacote, defaults, sinais e migração: PASS.
- GNOME Shell 51.1 em sessões Wayland/D-Bus privadas, backend opcional e fallback nativo: PASS.
- Janelas existentes e recém-abertas: opacidade, geometria e empilhamento do backdrop: PASS.
- Fechamento, minimização, tela cheia, overview, desativação e desmontagem: PASS.
- Sem loop de redraw ocioso com janelas e blur nativo ativos: PASS.
- Preferências: seis abas, bindings de todos os controles e restauração dos padrões: PASS.
- Inspeção visual da aba Janelas e das janelas transparentes com blur: PASS.
- Arquivos: `validation/windows-backend-results.json`, `validation/windows-native-results.json`.
- Validação gráfica nesta versão: GNOME 51.1 / Wayland. X11 e outras versões não foram testados nesta alteração.

# Validação da versão 19 — 8 de novembro de 2026

- Compilação do backend e typelib com Mutter 51.1: PASS.
- `make check` e três testes Node do dock (sombras, redraw, autohide): PASS.
- Sessões Wayland/D-Bus isoladas, backend modificado e fallback nativo: PASS.
- Reutilização de cache para brilho/cantos, invalidação por raio, captura final,
  ociosidade e múltiplos efeitos com frequências diferentes: PASS.
- Cadência de captura aproximadamente 60/30/15 Hz; sem comparação antes/depois.
- Detalhes em BLUR_REVIEW.md e regressões em tests/blur_cache.py.

# Validação da versão 18 — 8 de novembro de 2026

- `make check`: schema estrito, pacote, sinais e migração das sombras: PASS.
- Sessão GNOME Shell 51.1 D-Bus/Wayland isolada: sombras nos ícones reais de
  `AppSwitcherPopup` e `WindowSwitcherPopup`, ativação, desativação e
  independência da grade e do dock: PASS.
- Integração das superfícies, desmontagem, reativação e preferências
  (bindings, posição dos controles e restauração dos padrões): PASS.

Resultados em `validation/gnome50-surfaces-results.json`.

# Validação da versão 17 — 6 de novembro de 2026

Sessões GNOME Shell D-Bus/Wayland isoladas, backend opcional e nativo.

- Fade out apresenta opacidades intermediárias 255, 223, 192, 163, 138,
  114, 92, 73, 56, 41, 29, 18, 10, 5, 1, 0; fade in também apresenta
  frames intermediários. Ícones permanecem com opacidade 255: PASS.
- Raio e brilho do efeito interpolados junto com o fundo: PASS.
- Duração usa ANIMATION_TIME e EASE_OUT_QUAD, como o fade da barra superior.
- Default ativado, opt out, restauração, opacidade de 100%, blur normal
  desativado, desmontagem, reativação, preferências e integração: PASS.
- `make check` e integridade do ZIP: PASS.

Resultados em `validation/dock-fade-optional-results.json` e
`validation/dock-fade-native-results.json`.

# Validação da versão 16 — 6 de novembro de 2026

Sessões GNOME Shell D-Bus/Wayland isoladas, com três contratos de dock.

- Fundo, contorno e sombra do fundo invisíveis no overview, ícones com
  opacidade integral e camada de blur oculta: PASS.
- Restauração ao sair do overview, toggle com overview aberto, opacidade
  compartilhada de 100% e funcionamento sem blur normal do dock: PASS.
- Desativação e reativação do controlador com overview aberto: PASS.
- Backend opcional e fallback nativo, integração completa e preferências: PASS.
- Default ativado e opt out verificados com fallback nativo; schema estrito,
  bindings e reset preservam o default ativado. `make check`: PASS.

Resultados em `validation/gnome50-results.json` e
`validation/gnome50-native-results.json`.

# Validação da versão 15 — 5 de novembro de 2026

Sessão GNOME Shell isolada, com backend opcional de blur.

- Cor da barra comparada ao tema nativo com o efeito desativado: PASS.
- Transparência, opacidade manual e automática, restauração da cor nativa,
  fades por pixels e integração das superfícies: PASS.
- Preferências e `make check`: PASS.
- Resultados em `validation/gnome50-surfaces-panel-policy-results.json`.
  O backend nativo não foi repetido nesta alteração da camada de cor compartilhada.

# Validação da versão 14 — 5 de novembro de 2026

GNOME Shell 51.1, sessões D-Bus/Wayland isoladas.

- Cena real com papel de parede listrado e saída do overview em câmera lenta:
  a v13 tinha contraste zero durante toda a saída e saltava para 32,35 quando
  o overview era ocultado. Filtro e opacidade estavam animados; a entrada do
  framebuffer era trocada instantaneamente.
- Após a correção, a passagem apresenta contrastes intermediários de 2,36;
  12,12; 19,14; 24,97; 29,17; 31,72 e 32,96 até estabilizar em 33,16.
  A diferença de luminosidade na primeira troca de cena também é limitada.
- Backend opcional: cena real, desfoque por pixels, superfícies, opacidade
  automática e integração completa PASS. Backend nativo: cena real e
  integração completa PASS. `make check`: PASS.
- Recortes da animação revisados em `validation/panel-scene-crossfade.png`.
  A animação própria tem 250 ms em velocidade normal e respeita as animações
  do sistema por meio de St.Adjustment.

Resultados em
`validation/gnome50-surfaces-panel-policy-panel-blur-panel-scene-results.json`
e `validation/gnome50-native-panel-scene-results.json`.

# Validação da versão 13 — 5 de novembro de 2026

GNOME Shell 51.1, sessões D-Bus/Wayland isoladas.

- Regressão reproduzida na v12 por pixels: em 10%, 35%, 70% e 100% de progresso,
  o padrão já tinha o mesmo contraste (26,07), apesar da animação da camada.
- Após a correção, contraste do padrão em 0%, 10%, 35%, 70% e 100%:
  126,93; 118,04; 86,62; 39,71; 26,15. O blur aumenta gradualmente, e a inversão
  para 35% e 0% restaura os mesmos pixels. PASS nos dois backends.
- Comparação visual dos recortes da barra revisada em
  `validation/panel-blur-rendered-comparison.png`.
- Backend opcional: teste de pixels, superfícies, opacidade automática e
  integração completa PASS. Backend nativo: teste de pixels e integração
  completa PASS. `make check`: PASS.

Resultados em `validation/gnome50-surfaces-panel-policy-panel-blur-results.json`
e `validation/gnome50-native-panel-blur-results.json`.

# Validação da versão 12 — 5 de novembro de 2026

GNOME Shell 51.1, sessões D-Bus/Wayland isoladas.

- Reproduzido o snap com `transition-duration: 0ms`: o teste de frames
  intermediários falhou antes da correção.
- Após a correção, entrada e saída têm frames intermediários, com blur e tint
  na mesma opacidade; backend opcional e `Shell.BlurEffect`: PASS.
- Com o backend nativo, a opacidade acompanha o progresso do overview em cada
  frame, mesmo com a duração CSS da barra em zero: PASS.
- Interrupção, reativação no overview, opacidade automática e restante dos
  testes de superfícies/integração: PASS. `make check`: PASS.

Resultados em `validation/gnome50-surfaces-results.json` e
`validation/gnome50-native-surfaces-panel-policy-results.json`.

# Validação da versão 11

GNOME Shell 51.1, sessões D-Bus/Wayland isoladas, 4 de novembro de 2026.

- Schemas estritos, manifesto e callbacks compartilhados: PASS.
- Migração de sombra global antiga e preservação de escolhas novas: PASS.
- Quatro combinações de switches, verificadas na sombra calculada pelo tema
  de ícones reais da grade sintética e de três contratos de dock: PASS.
- Integração completa, geometria, animações, opacidade, suspensão/retomada,
  desmontagem e reativação: PASS.
- Cinco abas, localização dos controles, bindings, reset e link GitHub do
  backend: PASS. Captura da aba Ícones revisada visualmente.
- Integração com Dash to Dock Extended 28 real, frequência e toggle: PASS.

Testes gráficos em tests/headless.py e tests/dock_surfaces.py; migração em
tests/shadow-settings.js. Não houve novo benchmark nem certificação de todos
os forks, monitores e versões de GNOME. Half/quarter-rate exigem o backend
compatível descrito no README. O redraw completo permanece ativo.
