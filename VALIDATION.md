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
