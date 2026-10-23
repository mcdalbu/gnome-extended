# Gnome Shell Soft

Extensão independente para aplicar blur dinâmico e transparência ao menu de
**notificações/calendário** e às **configurações rápidas (Quick Settings)**.
Nome: **Gnome Shell Soft** · UUID: `gnome-shell-soft@local` · Versão: **3**.

Repositório: [mcdalbu/gnome-shell-soft](https://github.com/mcdalbu/gnome-shell-soft).

Usa o mesmo método do Dash to Dock Soft: uma camada `Meta.BackgroundGroup`
separada, atrás do menu, com `BlurEffect` em modo `BACKGROUND`. Os textos,
ícones e botões continuam nítidos. Não requer Dash to Dock Soft instalado e não
modifica seu código nem suas configurações. O efeito acompanha as janelas atrás
dos menus, não apenas o papel de parede. Esta versão cobre o menu do relógio;
os banners flutuantes de notificações não são alterados.

## Instalar

Na pasta desta extensão:

```bash
make zip-file
gnome-extensions install gnome-shell-soft@local_v3.zip
```

Encerre a sessão e entre novamente para o Shell reconhecer uma extensão nova.
Depois:

```bash
gnome-extensions enable gnome-shell-soft@local
gnome-extensions prefs gnome-shell-soft@local
```

Para atualizar, use `gnome-extensions install --force gnome-shell-soft@local_v3.zip`.
Para desativar, use `gnome-extensions disable gnome-shell-soft@local`.

## Preferências

As alterações são aplicadas ao vivo e salvas no schema próprio
`org.gnome.shell.extensions.gnome-shell-soft`.

| Opção | Padrão | Intervalo |
| --- | --- | --- |
| Notificações e calendário | Ativado | Ativado/desativado |
| Configurações rápidas | Ativado | Ativado/desativado |
| Intensidade do desfoque | 30 | 1–100 pixels lógicos |
| Opacidade do fundo | 55% | 0–100% |
| Brilho do desfoque | 85% | 10–100% |
| Raio dos cantos | 30 | 0–100 pixels lógicos |

O fundo preserva a cor do tema ativo e recebe a opacidade escolhida. Opacidade
100% encobre o blur; reduza o valor para vê-lo. A escala do Shell é aplicada ao
raio do blur e dos cantos. As duas opções de ativação são independentes; os
ajustes de aparência são compartilhados entre os menus.

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
