# Gnome Shell Soft

Extensão independente para aplicar blur dinâmico e transparência aos menus de
**notificações/calendário** e **Quick Settings**, **diálogos do sistema**,
**notificações flutuantes**, **pastas de aplicativos**, **barra superior** e
**alternador de janelas**, **volume/brilho**, **troca de área de trabalho**,
**menus contextuais**, **captura de tela**, **fundo do overview/pesquisa** e
**papel de parede da tela de bloqueio**.
Nome: **Gnome Shell Soft** · UUID: `gnome-shell-soft@local` · Versão: **7-beta.1**.

Repositório: [mcdalbu/gnome-shell-soft](https://github.com/mcdalbu/gnome-shell-soft).

Usa o mesmo método do Dash to Dock Soft: uma camada `Meta.BackgroundGroup`
separada, atrás do menu, com `BlurEffect` em modo `BACKGROUND`. Os textos,
ícones e botões continuam nítidos. Não requer Dash to Dock Soft instalado e não
modifica seu código nem suas configurações. O efeito acompanha as janelas atrás
das superfícies, não apenas o papel de parede. Os grupos de superfícies podem
ser ativados independentemente nas preferências.

## Instalar

Na pasta desta extensão:

```bash
make zip-file
gnome-extensions install gnome-shell-soft@local_v7-beta.1.zip
```

Encerre a sessão e entre novamente para o Shell reconhecer uma extensão nova.
Depois:

```bash
gnome-extensions enable gnome-shell-soft@local
gnome-extensions prefs gnome-shell-soft@local
```

Para atualizar, use `gnome-extensions install --force gnome-shell-soft@local_v7-beta.1.zip`.
Para desativar, use `gnome-extensions disable gnome-shell-soft@local`.

## Preferências

As alterações são aplicadas ao vivo e salvas no schema próprio
`org.gnome.shell.extensions.gnome-shell-soft`.

| Opção | Padrão | Intervalo |
| --- | --- | --- |
| Notificações e calendário | Ativado | Ativado/desativado |
| Configurações rápidas | Ativado | Ativado/desativado |
| Diálogos do sistema | Ativado | Ativado/desativado |
| Notificações flutuantes | Ativado | Ativado/desativado |
| Pastas de aplicativos | Ativado | Ativado/desativado |
| Barra superior | Ativado | Ativado/desativado |
| Alternador de janelas | Ativado | Ativado/desativado |
| Volume e brilho | Desativado | Ativado/desativado |
| Troca de área de trabalho | Desativado | Ativado/desativado |
| Captura de tela | Desativado | Ativado/desativado |
| Menus contextuais | Desativado | Ativado/desativado |
| Overview, grade e pesquisa | Desativado | Ativado/desativado |
| Tela de bloqueio (personalização do blur nativo) | Desativado | Ativado/desativado |
| Intensidade do desfoque | 30 | 1–100 pixels lógicos |
| Opacidade do fundo | 55% | 0–100% |
| Brilho do desfoque | 85% | 10–100% |
| Raio dos cantos | 30 | 0–100 pixels lógicos |

O fundo preserva a cor do tema ativo e recebe a opacidade escolhida. Opacidade
100% encobre o blur; reduza o valor para vê-lo. A escala do Shell é aplicada ao
raio do blur e dos cantos. As treze opções de ativação são independentes; os
ajustes de aparência são compartilhados entre as superfícies. A barra superior
mantém cantos retos.

## Backend e cantos arredondados

O seletor de backend e a proteção contra redesenho parcial foram reaproveitados
do Dash to Dock Soft. A extensão tenta carregar `gi://Blur` (GNOME Rounded Blur),
valida o tipo GObject e usa seu efeito e enum em conjunto. Na ausência de uma
biblioteca compatível, usa `Shell.BlurEffect`. Detecta as propriedades `radius`
ou `sigma` e `corner-radius` em tempo de execução.

O recorte arredondado do blur requer `corner-radius` no backend. Sem suporte,
a superfície mantém seus cantos, mas a camada de desfoque terá cantos retos.
Para GNOME Rounded Blur, consulte o
[guia oficial](https://github.com/aunetx/blur-my-shell/blob/master/scripts/GUIDE.md).
A biblioteca nativa não está incluída no ZIP e deve corresponder ao Shell/Mutter
instalado; após instalá-la, encerre e reabra a sessão.

Desative no Blur my Shell ou em outras extensões os efeitos que atinjam estes
mesmos menus, para evitar duas extensões controlando seu fundo simultaneamente.
O blur do Dash to Dock Soft pode continuar ativo.

## Ciclo de vida e desempenho

A camada acompanha a posição e o tamanho renderizados do menu, inclusive durante
as animações. Só a cor de fundo recebe transparência. A extensão restaura os
estilos anteriores ao desativar e remove os atores, efeitos, sinais e callbacks.
O blur é recriado quando o menu reabre ou após suspensão e desbloqueio.

Na versão 2, o blur dos dois menus desaparece assim que o fechamento começa,
sem aguardar o fim da animação de saída do ator. A extensão cancela repinturas
pendentes e recria o efeito na reabertura, inclusive se uma animação for
interrompida por outra abertura ou pelo fechamento rápido do menu.

A proteção contra captura de pixels de um frame anterior desativa o redesenho
parcial apenas durante frames já agendados nos monitores com blur visível.
Isso aumenta o trabalho de GPU nesses frames. Não há timer periódico para manter
a tela repintando. Menus fechados não mantêm a proteção ativa.

Na versão 3, mudanças de janelas distantes não solicitam repintura do blur.
Menus fechados ou com blur encoberto não mantêm sinais conectados às janelas;
o acompanhamento é reconstruído ao mostrar o efeito novamente.
O filtro inclui a margem de amostragem e as transformações das janelas; sair
da região ainda invalida a captura anterior. As interseções são atualizadas
quando a geometria ou a intensidade do blur muda.
Com fundo em 100% de opacidade, a camada de blur e sua proteção de redesenho
são ocultadas nos frames seguintes ao término da transição do fundo, quando
o fundo cobre o efeito inteiro. Sem recorte arredondado no backend, o efeito
continua ativo nos cantos expostos. Voltar à transparência restaura o blur.
Em cantos arredondados opacos, retirar a segunda camada pode alterar apenas
os pixels de suavização do contorno, sem mudar o interior da superfície.
Essas otimizações não introduzem timers periódicos nem removem a proteção
necessária ao blur visível; não representam uma medição de ganho percentual.

## Desenvolvimento

Compatibilidade declarada: GNOME Shell **45–50** (módulos ESM). A validação de
integração usa o GNOME Shell 50 instalado; as outras versões precisam de testes
em suas respectivas sessões. As APIs internas de menus podem mudar com o Shell.

Dependências de empacotamento: `make`, `glib-compile-schemas`, `python3` e `zip`.

```bash
make check
make zip-file
```

Teste de integração em uma sessão Wayland headless com D-Bus, diretórios de dados
e configurações próprios, sem instalar na sessão de trabalho:

```bash
/usr/bin/python3 tests/headless.py
SOFT_TEST_NATIVE=1 /usr/bin/python3 tests/headless.py
```

Requer GNOME Shell 50, PyGObject, GJS/GTK/Adwaita e um renderizador disponível.
A segunda execução simula a ausência da biblioteca opcional apenas na cópia
temporária da extensão. Resultados e capturas são gravados em `validation/`.
Os testes verificam a transparência e os cantos efetivamente aplicados, alinhamento
durante translação/escala, ordem das camadas, fechamento e reabertura com
animações FULL/FADE/NONE e interrupções rápidas, ausência de blur após o início
do fechamento em cada frame, alteração
ao vivo, preservação de estilos externos, retomada simulada, repouso e limpeza.
As preferências são construídas em GTK e seus vínculos bidirecionais e restauração
de padrões são exercitados. A suspensão física precisa ser verificada na sessão
real. O helper de teste libera Eval somente no D-Bus privado e não entra no ZIP.

Código derivado do Dash to Dock Soft: `blurBackend.js` e `blurRedrawGuard.js`.
O método de backend acompanha a integração GNOME Rounded Blur do
[Blur my Shell](https://github.com/aunetx/blur-my-shell).
Licença: GPL-2.0-or-later; veja `COPYING`.

## Escala comum com Dash to Dock Soft (versão 4)

O módulo `blurBackend.js` mantém o mesmo cálculo nas duas extensões: blur 24
representa raio 24 em pixels lógicos (multiplicado pela escala do Shell;
no backend antigo, sigma é metade do raio). Opacidade 67% representa alfa 0,67;
transparência é seu complemento, 33%. Não altera a opacidade de textos e ícones.
Brilho 67% representa 0,67 nas duas extensões; o padrão continua em 85%.
No dock, selecione transparência fixa para comparar o percentual: os modos
padrão e dinâmico continuam seguindo o tema e a proximidade de janelas.
Cores, cantos e conteúdo atrás de cada superfície também afetam sua aparência.
Os ajustes permanecem independentes entre as extensões.

A geometria do blur é atualizada antes da preparação do frame e novamente antes
da pintura, acompanhando o deslocamento de abertura do BoxPointer. Alterações
nessa etapa invalidam a captura imediatamente. Imagens de fundo do tema são
removidas da superfície para que não encubram o alfa configurado.

## Beta 5-beta.1: custo do blur

Os limites de amostragem são reutilizados entre notificações de janela e
invalidados nas verificações de geometria, etapas de frame e mudanças de
intensidade/escala. A preparação do frame evita repetir a sincronização de
visibilidade já executada, preservando a atualização imediatamente antes da
pintura para acompanhar animações. A proteção contra artefatos e o acompanhamento
de translação e escala continuam ativos. Não há medição de ganho percentual.

Gerar pacote: `make zip-file`.
O pacote mantém o UUID e as configurações; substitui a versão estável quando
instalado. Para voltar, reinstale o pacote v4.

## Beta 6-beta.1: novas superfícies

Além dos menus de calendário e Quick Settings, esta beta adiciona blur dinâmico:

- ao fundo dos diálogos do sistema baseados em ModalDialog, incluindo confirmações;
- aos banners de notificação, com ações, expansão e fechamento preservados;
- ao fundo das pastas abertas na grade de aplicativos;
- à barra superior, mantendo seus cantos retos;
- às listas de aplicativos e janelas do Alt+Tab/Super+Tab.

Cada grupo possui um interruptor independente nas preferências. Os cinco novos
interruptores vêm ativados; intensidade, opacidade, brilho e cantos compartilham os
controles dos menus existentes. Não aplica blur aos textos, ícones, botões, janelas
de aplicativos ou à tela inteira atrás de um diálogo. A sombra/escurecimento
nativo ao redor dos diálogos e das pastas continua sendo controlado pelo Shell.

As superfícies transitórias são descobertas ao serem criadas e mapeadas, sem
substituir métodos do Shell e sem timer de varredura. As camadas acompanham suas
animações, o blur de diálogos/pastas termina no início do fechamento e os sinais
são liberados quando seus atores são destruídos. A barra superior visível mantém
a proteção contra redesenho parcial nos frames existentes: pode aumentar o custo
de GPU durante atualizações da tela. Não há benchmark de ganho de desempenho.

Gerar: `make zip-file`. Pacote: `gnome-shell-soft@local_v7-beta.1.zip`.
O UUID e as configurações existentes são preservados. Para voltar, reinstale a
beta 5-beta.1 ou a versão 4 e reinicie a sessão.

Validação das novas superfícies em GNOME Shell 50:
`SOFT_TEST_SURFACES=1 /usr/bin/python3 tests/headless.py`.
O teste usa sessão D-Bus/Wayland e configurações privadas, diálogos e notificações
reais, uma pasta da grade e janelas GTK para ambos os alternadores. Também verifica
restauração de estilo ao desativar cada grupo e a regressão dos menus existentes.
Evidências em `validation/gnome50-surfaces-*`. O fallback nativo pode ser testado
com `SOFT_TEST_NATIVE=1 SOFT_TEST_SURFACES=1`; sem suporte a cantos no backend,
permanece a limitação de recorte já documentada. GNOME 45–49 não foi validado nesta
beta; as integrações são internas ao Shell e podem variar entre versões.

## Beta 6-beta.2: barra superior e overview

O preenchimento e o blur da barra superior passam a compartilhar uma única
opacidade animada. Ao entrar no overview, ambos desaparecem com a duração da
transição do tema (250 ms no Adwaita) e a curva EASE_IN_OUT_QUAD usada pelo St.
Ao sair, reaparecem juntos; interrupções retomam a partir da opacidade atual.
O relógio e os indicadores continuam nítidos e visíveis. Habilitar a extensão
com o overview já aberto não mostra o fundo; o blur oculto libera seus sinais
de janela e não mantém a proteção de redesenho da barra ativa.

No modo escuro, o preenchimento usa #2e2e32, a cor --headerbar-bg-color do
Adwaita instalado. No modo claro, preserva a cor definida pelo tema do Shell.
A opacidade escolhida nas preferências continua valendo fora do overview.
Com opacidade em 100%, o preenchimento permanece visível e somente o blur
encoberto é suspenso. Desativar a opção restaura o estilo original da barra.

A duração vem de St.ThemeNode.get_transition_duration; a curva corresponde ao
[código de StThemeNodeTransition](https://github.com/GNOME/gnome-shell/blob/main/src/st/st-theme-node-transition.c).
Os testes de superfícies registram, em cada frame observado, as opacidades do
blur e do preenchimento nas duas direções e verificam transparência total no
overview, retorno após interrupção, cor, opacidade 100% e limpeza ao desativar.

## Beta 7-beta.1: opções para as demais superfícies

Seis novas opções independentes completam os grupos de superfícies:

- **Volume e brilho:** blur atrás dos indicadores OSD, preservando os níveis,
  ícones, teclas e o temporizador de fechamento nativos.
- **Troca de área de trabalho:** fundo do indicador de áreas de trabalho.
- **Captura de tela:** fundo do painel de controles, acompanhando sua animação.
  O efeito não é aplicado à imagem capturada nem ao conteúdo da gravação.
- **Menus contextuais:** menus baseados em PopupMenu do Shell, como menus de
  aplicativos e indicadores. Calendário e Quick Settings mantêm seus próprios
  interruptores. Menus internos de aplicativos GTK/Qt não fazem parte do Shell.
- **Overview, grade e pesquisa:** uma camada de papel de parede desfocado por
  monitor, atrás das áreas de trabalho e dos controles. As prévias de janelas,
  textos, ícones e resultados permanecem nítidos. A opacidade acompanha a
  transição nativa do overview, incluindo gestos.
- **Tela de bloqueio:** personaliza a intensidade e o brilho do blur nativo do
  papel de parede. Desativar a opção restaura o efeito nativo, inclusive seus
  valores e estado de ativação. Não modifica relógio, notificações, autenticação
  ou políticas de bloqueio.

As seis opções novas vêm **desativadas**, para que sejam escolhidas nas
preferências. Intensidade e brilho são compartilhados; opacidade e cantos valem
para as superfícies. O papel de parede do overview/bloqueio usa blur de seu próprio
conteúdo, sem capturar janelas e sem ativar o guard de redesenho dinâmico.

A extensão declara os modos `user` e `unlock-dialog` para manter a personalização
do papel de parede durante o bloqueio; as camadas normais continuam ocultas nesse
modo. Monitores, novos atores e mudanças de papel de parede usam os sinais e
mecanismos de background do Shell. Não há timer de varredura ou repintura contínua.
As correções de fade da barra e a cor Adwaita do beta 6-beta.2 são preservadas.

Validação completa em sessão privada:
`SOFT_TEST_SURFACES=1 SOFT_TEST_REMAINING=1 /usr/bin/python3 tests/headless.py`.
Para o backend nativo, acrescente `SOFT_TEST_NATIVE=1`.
O teste abre os controles de captura sem tirar uma foto ou iniciar uma gravação,
verifica a restauração dos estilos e do blur nativo, o modo `unlock-dialog`, os 13
interruptores e a ausência de frames extras em repouso. O ator real de desbloqueio
é construído em um contêiner oculto da sessão de teste, sem bloquear a sessão real
nem iniciar autenticação. Não substitui uma validação visual após bloqueio físico,
suspensão ou múltiplos monitores reais. GNOME 45–49 permanece sem validação nesta
beta. Evidências em `validation/gnome50-surfaces-remaining-*` e
`validation/gnome50-native-surfaces-remaining-*`.
