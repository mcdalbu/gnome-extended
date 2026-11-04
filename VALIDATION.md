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
