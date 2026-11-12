## Versão 35 — Extensão da borda inferior da barra

- Nova opção **Estender o fundo em 1 px** na aba **Barra superior**, desativada por padrão.
- Estende o fundo e o blur em um pixel lógico para baixo para cobrir lacunas, sem mover relógio e indicadores nem alterar a área reservada às janelas.
- A alteração é aplicada ao alternar a opção e acompanha a ativação por tema da barra.

Saia da sessão e entre novamente após instalar a atualização.

## Versão 34 — Saída das superfícies transitórias

- O filtro dos banners e demais superfícies simples acompanha a opacidade realmente pintada. Reduz raio e alteração de brilho até o framebuffer original, pois efeitos BACKGROUND não obedecem apenas à opacidade do ator.
- O dock reduz o filtro conforme sua área sai dos monitores.
- Recorte, visibilidade e limpeza final passam a cobrir as superfícies simples compartilhadas. Destruição de uma camada visível solicita a limpeza da área pintada.
- Regressão do banner real inclui quadros intermediários do fade, ocultação em opacidade zero e restauração.

Saia da sessão e entre novamente após instalar a atualização.

## Versão 33 — Sincronização da animação do dock

- Alterações de alocação e recorte são reunidas antes do redesenho. Visibilidade, geometria e captura do blur são aplicadas após o layout completo, evitando capturas em posições intermediárias entre notificações do mesmo quadro.
- O callback pendente é removido ao desativar a superfície.

Saia da sessão e entre novamente após instalar a atualização.

## Versão 32 — Ocultação completa do blur do dock

- A camada de blur é ocultada quando o contêiner de deslizamento recebe um recorte vazio, mesmo com o dock ainda mapeado. Alterações de recorte e alocação reativam o acompanhamento ao reaparecer.
- Um redesenho ao ocultar limpa a área anteriormente pintada. A geometria do blur do dock também é atualizada antes do cálculo de dano do quadro.
- Regressão inclui leitura do framebuffer após movimento e ocultação, além de ocultação e restauração com o dock real.

Saia da sessão e entre novamente após instalar a atualização.

## Versão 31 — Blur acompanha a ocultação do dock

- O blur respeita os recortes do fundo e dos contêineres do dock, inclusive o recorte vazio usado na ocultação automática. Isso evita uma camada de blur solta enquanto o dock permanece mapeado.
- Recortes parciais são acompanhados durante a animação, preservando os cantos arredondados e o reaparecimento do fundo.
- Ocultar ou reexibir apenas o fundo do dock também sincroniza imediatamente a visibilidade do blur.

Instale `gnome-extended@local_v31.zip` com `gnome-extensions install --force` e saia da sessão e entre novamente.

## Versão 30 — Blur uniforme entre janelas e superfícies do Shell

- Janelas, menus, painel e dock passam a compartilhar a mesma captura por view, com raio arredondado em pixels físicos, grade fixa e margens iguais para o filtro.
- A resolução de amostragem passa a depender do raio, evitando que uma barra fina e uma janela grande usem níveis diferentes de redução da textura. Isso amplia as capturas das superfícies menores, especialmente em raios altos.
- Os cantos são recortados no framebuffer pelo mesmo mecanismo das janelas, inclusive no backend nativo. Textos e ícones continuam nítidos e as transições de blur e brilho são preservadas.
- Opacidade continua sendo a porcentagem geral aplicada ao fundo. As cores de cada tema e aplicativo permanecem próprias, portanto cores diferentes ainda podem produzir percepções diferentes de transparência.

Instale `gnome-extended@local_v30.zip` com `gnome-extensions install --force` e saia da sessão e entre novamente. Nenhuma alteração do backend opcional 1.0.2-4.local é necessária.

## Versão 29 — Blur adaptado à escala de cada monitor

- A grade de amostragem passa a usar pixels físicos do framebuffer e a escala real da view. O movimento de um terminal sobre texto não desloca a fase do filtro em escalas fracionárias.
- Capturas, parâmetros e caches independentes por view permitem atravessar monitores com escalas diferentes. A integração recria as capturas ao mudar a configuração dos monitores, inclusive com a janela já aberta.
- O raio é convertido e arredondado para pixels físicos da própria view. Uma pequena margem numérica impede que a precisão dos transforms acrescente um pixel à captura.
- Corrigida a possibilidade de uma camada de blur ficar sobre outra janela após mudança de foco. A verificação de empilhamento inclui a posição da camada injetada, mesmo quando a ordem dos atores de janela não muda.
- Uma camada sem o dono visível e imediatamente acima dela não é pintada, inclusive antes da atualização de foco ou visibilidade agendada.
- A regressão gráfica usa um Ptyxis real, uma segunda janela GTK com texto e arraste contínuo por ponteiro virtual. O teste lê o framebuffer já pintado, verifica que o texto está de fato desfocado e mede a estabilidade durante o movimento.

Instale `gnome-extended@local_v29.zip` com `gnome-extensions install --force` e saia da sessão e entre novamente. Nenhuma alteração do backend opcional 1.0.2-4.local é necessária.

## Versão 28 — Estabilidade de textos atrás do blur

- Corrigida a cintilação de texto e detalhes finos atrás de uma janela transparente em movimento. A captura do blur agora usa uma grade fixa na tela, em vez de deslocar a fase de amostragem com a janela.
- A captura inclui uma margem para o filtro e mantém dimensões constantes durante o movimento, evitando mudanças de resolução do desfoque e realocações de texturas ao atravessar a grade.
- A área visível continua acompanhando exatamente a janela, com recorte arredondado aplicado diretamente no framebuffer nos dois backends. Janelas maximizadas preservam os cantos retos.
- Mantida a proteção das regiões opacas da versão 27. Textos e controles do aplicativo continuam nítidos e opacos.

Instale `gnome-extended@local_v28.zip` com `gnome-extensions install --force` e saia da sessão e entre novamente para carregar a atualização. O backend opcional 1.0.2-4.local continua compatível.

## Versão 27 — Fundo do blur durante o movimento das janelas

- Corrigida a captura incompleta do fundo junto às áreas opacas das janelas com blur. Essas regiões agora continuam disponíveis ao efeito, evitando pixels antigos durante o movimento.
- A proteção é aplicada somente às janelas com blur visível e raio positivo; é removida ao ocultar o efeito, zerar o raio ou desligar a integração.
- Textos e controles continuam opacos. O ajuste não cria captura intermediária da janela nem redesenho contínuo quando o desktop está parado.

Instale `gnome-extended@local_v27.zip` com `gnome-extensions install --force` e saia da sessão e entre novamente para carregar a atualização.

## Versão 26 — Menos trabalho durante o uso do desktop

- Menus fechados liberam os callbacks de quadro. A abertura e as animações reconectam o acompanhamento do fundo.
- Atualizações de conteúdo de uma janela parada reutilizam sua geometria. Mudanças de posição, tamanho e transformações dos ancestrais invalidam os limites armazenados.
- Notificações simultâneas da regra de opacidade automática da barra superior são reunidas antes do próximo redesenho.

### Dependências e atualização

- A barra lateral do **Configurações** requer `gresource`, fornecido por `glib2-devel` no Fedora.
- O GNOME Rounded Blur é opcional. O [backend 1.0.2-4.local da versão 24](https://github.com/mcdalbu/gnome-extended/releases/tag/v24) continua compatível no Fedora 45 x86_64 com Mutter 51.
- Instale `gnome-extended@local_v26.zip` com `gnome-extensions install --force`. Saia da sessão e entre novamente para carregar o código.

## Versão 25 — Otimizações de blur e transparência

- O painel, os menus, o dock e as janelas compartilham leituras de geometria e agrupam mudanças antes de repintar o fundo.
- A ordem das janelas só invalida os fundos afetados. O blur de janelas dispensa redesenho integral com raio zero e brilho em 100%. O raio padrão continua em 30.
- As mudanças de opacidade atualizam o CSS GTK e os perfis do Ptyxis após uma breve pausa. Raio, brilho e frequência atualizam apenas o efeito.
- O monitoramento completo do fundo do Ptyxis começa quando há um terminal visível. O blur acompanha a abertura do menu rápido desde o primeiro quadro visível.
- A aba **Ícones** do GNOME Extended aplica as sombras da grade, das pastas, do dock e do Alt+Tab com as preferências já salvas.

### Dependências e atualização

- A barra lateral do **Configurações** requer o utilitário `gresource`. No Fedora, ele é fornecido pelo pacote `glib2-devel`.
- O GNOME Rounded Blur é opcional. O [backend 1.0.2-4.local da versão 24](https://github.com/mcdalbu/gnome-extended/releases/tag/v24) continua compatível no Fedora 45 x86_64 com Mutter 51.
- Instale `gnome-extended@local_v25.zip` com `gnome-extensions install --force`. Saia da sessão e entre novamente para carregar o código.

Validação em sessões isoladas do GNOME Shell 51.1 com o blur nativo e o GNOME Rounded Blur.

## Versão 24 — Barra lateral do Configurações

- Nova opção **Configurações: apenas a barra lateral**, seguindo o padrão do Arquivos.
- Opacidade, intensidade, brilho e frequência compartilhados com a aba Blur.
- Conteúdo, textos e ícones permanecem opacos, com cantos arredondados preservados.
- Estilo limitado ao Configurações por um overlay do template e lançador D-Bus reversível do usuário; nenhum arquivo do sistema é alterado.
- Desativar restaura o lançador anterior e preserva alterações pessoais. Reabra o aplicativo pelo lançador para carregar as mudanças.

## Versão 23 — Terminal Ptyxis

- Nova opção **Ptyxis: apenas a área do terminal** na aba Janelas.
- Transparência nativa só no fundo do terminal, mantendo barra de título e texto opacos.
- Blur independente do switch geral das janelas; aparência compartilhada com a aba Blur.
- Perfis existentes e novos usam a opacidade geral. Desativar restaura os valores anteriores dos perfis.
- Backup persistente conserva os valores após reinício da sessão e respeita alterações manuais externas.

## Versão 22 — Cantos e aparência compartilhada

- Corrigido o blur retangular visível fora dos cantos das janelas e menus.
- Máscara arredondada do backend opcional e recorte do destino no fallback nativo.
- Opacidade, intensidade, brilho e frequência de janelas/menus seguem a aba Blur.
- Removidos os quatro ajustes separados da aba Janelas; as escolhas gerais existentes são preservadas.
- Alterações da opacidade geral atualizam os estilos GTK. Reabra os aplicativos para carregar a nova opacidade; os parâmetros do blur mudam imediatamente.

## Versão 21 — Transparência por elemento

- Removidos o switch de transparência da janela inteira e sua opacidade global.
- Perfil específico para o fundo da barra lateral do Arquivos, incluindo o cabeçalho esquerdo.
- Menus de contexto GTK 4 com opacidade do fundo e blur independentes da lateral.
- Textos, ícones e conteúdo dos arquivos permanecem opacos: a extensão não altera mais a opacidade dos atores de janela.
- Blocos GTK identificados preservam o CSS pessoal. Reabra os aplicativos para carregar mudanças de estilo.

## Versão 20 — Janelas de aplicativos

- Nova aba Janelas com switches independentes de transparência e blur, ambos desligados por padrão.
- Opacidade de 0 a 100% para a janela inteira e controles próprios de intensidade e brilho do blur.
- O backdrop acompanha posição, tamanho e empilhamento, sem desfocar o conteúdo do aplicativo.
- Overview, tela cheia e bloqueio suspendem o efeito. Desativar restaura a opacidade anterior e remove as camadas.

# GNOME Extended 19 — 8 de novembro de 2026

- Preserva redraw parcial quando o raio efetivo do blur é zero.
- Backend opcional 1.0.2-4.local: captura final após atualizações descartadas em
  half-rate/quarter-rate, sem manter repaint contínuo em cenas paradas.
- Brilho e arredondamento reutilizam a textura do blur; troca de ator limpa
  o cache e cancela a atualização pendente.
- Integração validada com backend opcional e nativo, incluindo dois efeitos
  simultâneos em frequências diferentes. O RPM atualizado exige nova sessão.

# GNOME Extended 18 — 8 de novembro de 2026

- Nova opção **No alternador de aplicativos (Alt+Tab)** em **Ícones → Sombra dos ícones**.
- Controle independente da grade e do dock, com opacidade, deslocamentos e
  desfoque compartilhados. Aplica-se aos ícones dos alternadores de aplicativos
  e de janelas, preservando os rótulos e as miniaturas.
- Ativada por padrão; respeita a preferência global antiga ao migrar e
  preserva as escolhas independentes já definidas.

# GNOME Extended 17 — 6 de novembro de 2026

- Fade in/out de 250 ms ao alternar a transparência do dock no overview,
  usando a mesma duração e curva de animação da barra superior.
- Fundo, contorno, imagem e sombra do fundo desaparecem juntos; raio e brilho
  do blur também são interpolados. Os ícones mantêm a opacidade.
- Preserva a aparência original quando o blur normal está desativado,
  incluindo a restauração da opacidade ao desativar a extensão.

# GNOME Extended 16 — 6 de novembro de 2026

- Nova opção na aba Dock: **Fundo 100% transparente no overview**.
- Remove fundo, imagem de fundo, contorno, sombra do fundo e blur enquanto
  a visão geral estiver aberta, incluindo a grade e a pesquisa.
- Preserva ícones e dimensões do dock; restaura o visual anterior ao fechar.
- Ativada por padrão, com switch para desativar na aba Dock, independente
  do blur normal do dock.

# GNOME Extended 15 — 5 de novembro de 2026

- A barra superior no tema escuro volta a usar a cor nativa do tema do GNOME.
- Removidos o cinza Adwaita forçado e a troca para preto ao ficar opaca.
- Preservados blur, transparência, regras por tema, opacidade automática e
  transições do overview.

# GNOME Extended 14 — 5 de novembro de 2026

- A passagem do painel sólido para o desktop desfocado agora tem um crossfade
  próprio de 250 ms após o fundo do overview ser retirado.
- A v13 animava o filtro, mas ele capturava o fundo sólido do overview até o
  último frame. O desktop só entrava na captura quando o overview desaparecia.
- A cobertura temporária usa a cor do tema e o brilho do efeito e desaparece
  gradualmente. Não altera os textos, ícones ou a animação nativa do painel.
- Novo teste com papel de parede e overview reais verifica essa troca de cena;
  os testes anteriores com fundo sintético fixo não cobriam essa condição.

# GNOME Extended 13 — 5 de novembro de 2026

- Corrigido o snap do blur ao sair do overview: o raio e o escurecimento do
  efeito agora acompanham o progresso da transição junto com o fundo da barra.
- No modo BACKGROUND, o efeito compõe com opacidade total; o fade da camada
  implementado na versão 12 não bastava para suavizar o desfoque em si.
- Novo teste de pixels com padrão de alto contraste verifica o desfoque em
  múltiplas etapas e ao inverter o progresso, com os dois backends.

# GNOME Extended 12 — 5 de novembro de 2026

- Fade do blur e do fundo da barra superior sincronizado com o progresso do
  overview, inclusive em temas com `transition-duration: 0ms` na barra.
- O progresso também acompanha gestos, inversões e ativação durante o overview.

# GNOME Extended 11 — 4 de novembro de 2026

- Switches independentes de sombra para a grade/pastas e para os docks.
- Migração da preferência global anterior sem perder escolhas novas.
- App Grid integrado e preferências em abas Elementos, Dock, Barra superior,
  Blur e Ícones; link do backend na aba Blur.
- Blur externo para Dash to Dock e forks compatíveis, sem dependência de UUID.
- Efeitos reutilizados, callbacks de frame compartilhados e recuperação após
  suspensão/bloqueio. Half/quarter-rate usam cache com backend compatível.
- Mantidos os schemas, caminhos e valores existentes das preferências.

Publicado em main como release estável. O backend opcional não foi alterado
nesta release; seu RPM/SRPM local é específico para Fedora 45 / Mutter 51.
