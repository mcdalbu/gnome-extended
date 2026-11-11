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
