# Validação da versão 34 — 11 de novembro de 2026

- Backend nativo, GNOME Shell 51.1: suíte de superfícies e dock PASS. Banner real com fade animado: intensidade do filtro acompanha a opacidade em quadros intermediários, camada oculta em zero e restaurada ao reexibir.
- Dock real: saída animada, alinhamento por quadro, camada oculta e reabertura PASS.
- `make check` e `git diff --check`: PASS. O resultado perceptual no desktop do usuário ainda depende da confirmação após recarregar a sessão.

# Validação da versão 33 — 11 de novembro de 2026

- Animação real do dock em sessão isolada GNOME Shell 51.1: 18 quadros visíveis com diferença geométrica zero entre blur e fundo; camada oculta ao final e restaurada ao reabrir.
- A regressão verifica quadros intermediários, encerramento e restauração. A confirmação perceptual do flicker no desktop do usuário continua necessária.

# Validação da versão 32 — 11 de novembro de 2026

- Dock real com GNOME Extended em sessão isolada: camada visível ao abrir, oculta ao terminar autohide e restaurada ao reabrir: PASS.
- Backend nativo: regressão de movimento com leitura do framebuffer após a animação, recorte vazio ocultando a camada e recorte parcial: PASS; diferença no framebuffer igual a zero.
- Testes usam GNOME Shell 51.1, escala 100%. A leitura do framebuffer evita depender exclusivamente de screenshots que podem redesenhar a cena.

# Validação da versão 31 — 11 de novembro de 2026

- Regressão gráfica do dock em sessões GNOME Shell/Mutter 51.1 isoladas, com GNOME Rounded Blur e Shell.BlurEffect nativo: PASS.
- Dock mapeado com recorte vazio e parcial: diferença média de pixels fora da área visível igual a zero nos dois backends. Desativar a proteção no mesmo cenário reproduz o bloco de blur (diferença média de 20,71 níveis RGB).
- Reaparecimento após remover o recorte, ocultação/reexibição apenas do fundo, movimento, transições do overview, restauração e limpeza: PASS.
- Suíte de menus, preferências, reativação e redraw ocioso: PASS; nenhum JS ERROR nas sessões finais.
- `make check` e `git diff --check`: PASS.

Os recortes foram exercitados com fixtures do contrato de atores do dock, em escala 100%. Outras versões do GNOME e rotações 3D de docks não foram revalidadas.

```sh
SOFT_TEST_DOCK_FIXTURES=1 python3 tests/headless.py
SOFT_TEST_DOCK_FIXTURES=1 SOFT_TEST_NATIVE=1 python3 tests/headless.py
```

# Validação da versão 30 — 11 de novembro de 2026

- Comparação de pixels entre os caminhos de janelas e SoftSurface sobre o mesmo fundo, em raios 10, 30 e 60 e alturas 24 e 300: seis diferenças médias iguais a zero por backend, tanto em 100% quanto em 180%. O teste em 180% também confirma diferença em relação ao fundo nítido, evitando um falso positivo sem blur.
- Backends GNOME Rounded Blur e Shell.BlurEffect nativo, no GNOME Shell/Mutter 51.1: menus, cantos, painel, dock, transições do filtro, brilho, opacidade de 100%, restauração, teardown, preferências e ausência de loop de redraw ocioso: PASS.
- Regressão de janelas com backend opcional em 100%: geometria animada, oclusão, dano local, empilhamento, fechamento e overview: PASS.
- Backend nativo, monitores de 100% e 180%, com Ptyxis real e arraste contínuo: PASS. Capturas independentes, estabilidade durante movimento, mudanças de escala e dono ocultado preservados; maior diferença média durante o movimento de 0,0125 níveis RGB.
- `make check` e `git diff --check`: PASS.

Os testes gráficos usam sessões privadas de D-Bus/Wayland e não alteram a configuração real de monitores. Os testes de comparação usam fundo e parâmetros iguais; cores diferentes de temas e aplicativos continuam produzindo aparências diferentes. GNOME 45–50 não foi revalidado nesta versão.

A captura mínima necessária para padronizar a resolução aumenta o tamanho das texturas das superfícies finas. O custo cresce com o raio e a escala; não foi realizado benchmark de GPU.

Reprodução da comparação isolada:

```sh
SOFT_TEST_UNIFORM_BLUR=only python3 tests/headless.py
SOFT_TEST_UNIFORM_BLUR=only SOFT_TEST_NATIVE=1 SOFT_TEST_MONITOR=2880x1800 SOFT_TEST_SCALE=1.8 SOFT_TEST_CUSTOM_SCALE=1 python3 tests/headless.py
```

# Validação da versão 29 — 11 de novembro de 2026

- Reproduzida a mudança de fase em arraste contínuo de um Ptyxis real sobre texto de outra janela GTK, com escala fracionária de 133⅓% (diferença média de até 1,85 níveis RGB na referência anterior).
- O teste lê o framebuffer após cada paint, sem solicitar screenshots durante o movimento. Mede também o contraste para garantir que a região esteja de fato desfocada e reprova erros JavaScript no compositor.
- Matriz de 100%, 125%, 133⅓%, 150%, 166⅔%, 180% personalizado e 200%: PASS. Diferenças médias durante o movimento: zero ou abaixo de 0,005 níveis RGB.
- Janela atravessando monitores de 100% e 180%, com capturas independentes: PASS nos backends opcional e nativo; maior diferença média de 0,0125 níveis RGB. Sem mudança de geometria parada e sem loop de redraw ocioso.
- Mudança de escala com o terminal já aberto (180% → 125% → 200%): capturas recriadas, views atuais, raio físico arredondado correto: PASS.
- Foco alternado com uma janela GTK sem blur; camada deslocada deliberadamente sem mudar a ordem dos WindowActors; dono ocultado em before-paint: PASS nos dois backends. O texto fica nítido quando o dono some (contraste ~78–83 níveis RGB), sem camada órfã, e o blur volta ao mostrar a janela.
- Regressões de janelas, geometria, dano local, empilhamento, ciclo de vida e preferências; Nautilus real com cantos preservados e conteúdo opaco: PASS. `make check` e `git diff --check`: PASS.

Resultados em `validation/gnome50*-scale-*-results.json` e `validation/gnome50-native-results.json` (prefixo histórico do harness). As escalas são configuradas apenas em sessões GNOME Shell/Wayland privadas; a configuração de monitores da sessão real não é alterada. As escalas validadas são uma matriz representativa: o código usa a escala da view em execução, sem uma lista fixa de escalas suportadas.

O teste opcional de arraste requer compilador C e `g-ir-scanner`/`g-ir-compiler`, além das dependências gráficas habituais. Exemplo:

```sh
SOFT_TEST_MONITOR=2880x1800 SOFT_TEST_SCALE=1.8 SOFT_TEST_CUSTOM_SCALE=1 SOFT_TEST_PTYXIS=1 SOFT_TEST_TERMINAL_MOTION=1 python3 tests/headless.py
```

# Validação da versão 28 — 11 de novembro de 2026

- Reproduzida a cintilação em texto preto de 16 px sobre fundo branco, atrás da lateral transparente de uma janela de 700 × 550: diferenças médias de 1,30 / 1,15 / 2,53 níveis RGB repetiam a cada quatro pixels de movimento.
- Captura alinhada à tela: diferenças iguais a zero nas 44 comparações por backend, em movimentos horizontais e verticais de um pixel, cruzamento de tiles e alturas de janela 270 e 550. As dimensões da captura permanecem constantes em cada sequência.
- GNOME Rounded Blur e Shell.BlurEffect nativo: testes completos de janelas, alinhamento animado, empilhamento, dano local, geometria, minimização, overview, tela cheia, desativação e teardown: PASS.
- Nautilus real: cantos da janela e do menu com erro de pixels zero. Ptyxis real: blur independente, perfil de opacidade e preservação de título/texto: PASS.
- Ausência de loop de redraw ocioso, `make check` e `git diff --check`: PASS.
- Resultados: `validation/gnome50-results.json` e `validation/gnome50-native-results.json` (nome histórico do harness).

Sessões GNOME Shell/Wayland privadas, monitor virtual com escala 1. Outras escalas e versões do GNOME não foram validadas nesta correção. O backend opcional não requer alteração.

# Validação da versão 27 — 11 de novembro de 2026

- Regressão reproduzida antes da correção: diferença média de 2,69 / 2,10 / 2,16 níveis RGB junto à fronteira entre a lateral transparente e o conteúdo opaco, comparando três posições com uma referência sem oclusão.
- Após a correção, diferença de pixels igual a zero nas três posições com GNOME Rounded Blur e com Shell.BlurEffect nativo.
- Animação de movimento: alinhamento do backdrop em todos os quadros pintados.
- Sessões GNOME Shell/Wayland privadas: geometria, empilhamento, atualização local de conteúdo, novas janelas, fechamento, minimização, tela cheia, overview, desativação, teardown e ausência de loop de redraw ocioso: PASS nos dois backends.
- `make check`: PASS. `git diff --check`: PASS.
- Resultados: `validation/gnome50-results.json` e `validation/gnome50-native-results.json` (nome histórico do harness).

A validação gráfica usa o compositor e o renderer locais, monitor virtual com escala 1. A sessão real do usuário não foi alterada. Outras escalas e versões do GNOME não foram testadas nesta correção.

# Validação da versão 24 — 10 de novembro de 2026

- `make check`: pacote, schemas, estilos GTK, template e integração de perfis do Ptyxis: PASS.
- Configurações 51.1 real / libadwaita 1.10, GNOME Shell 51.1 / Wayland privado: PASS.
- Ativação D-Bus com lançador exclusivo e template extraído do aplicativo instalado: PASS.
- Troca da cena atrás da janela altera os pixels da lateral (delta médio ~42), enquanto a área de conteúdo permanece idêntica (delta 0).
- Opacidade do ator permanece 255; textos e ícones não recebem opacidade global: PASS.
- Lançador existente restaurado byte a byte; alterações manuais preservadas; remoção do lançador gerado ao desativar: PASS.
- Testes gráficos com backend opcional no tema escuro e fallback nativo no tema claro: PASS.
- Regressões de Arquivos, Ptyxis, superfícies do Shell, preferências e restauração dos padrões: PASS.
- Inspeção visual da barra lateral e área de conteúdo: PASS.

Resultados em `validation/settings-sidebar-backend-results.json` e `validation/settings-sidebar-native-results.json`.
Os testes usam diretórios XDG e barramento D-Bus privados; nenhuma janela de Configurações da sessão real é aberta ou encerrada.

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
