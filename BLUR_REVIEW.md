# Revisão de blur — 8 de novembro de 2026

Alterações incluídas no GNOME Extended 19 e backend 1.0.2-4.local:

- Backend opcional (`../gnome-rounded-blur-rpm/upstream/src/rounded-blur-effect.c`):
  uma captura pendente finaliza uma atualização descartada pelo limitador de
  frequência. O timeout é único por efeito, cancelado quando há captura,
  troca de ator, fallback ou destruição; ao disparar, invalida o cache para
  que sua própria captura não volte a ser limitada.
- Brilho e raio dos cantos atualizam a composição final sem invalidar a
  textura do desfoque. Mudanças no raio do blur continuam invalidando-a.
- A troca de ator também limpa os indicadores de validade dos framebuffers.
- `SoftSurface` preserva redraw parcial quando o raio efetivo é zero.
  Para blur ativo, o guard de redraw completo permanece necessário para
  evitar amostragem de pixels antigos. Não foi implementado damage regional.
- Os cálculos de sombras não precisaram de alteração.

Validação executada:

- Compilação Meson da biblioteca e do typelib contra Mutter 51.1.
- `make check` de Gnome Extended.
- Três testes Node do dock: efeitos/sombras, recuperação de redraw e autohide.
- Integração em sessões GNOME Shell Wayland/D-Bus isoladas, usando a biblioteca
  recém-compilada e, separadamente, o fallback nativo.
- Regressões de cache em `tests/blur_cache.py`: brilho, cantos, raio,
  captura final e estabilidade após o fim das atualizações.
- Teste de frequência: aproximadamente 60/30/15 capturas por segundo.
  Este resultado valida a cadência; não constitui comparação de desempenho
  antes/depois. A telemetria não forneceu contadores de GPU.

Resultados de frequência/cache: `validation/blur-cache-rate-results.json`.
Para repetir o teste do backend compilado, definir `GI_TYPELIB_PATH` e
`LD_LIBRARY_PATH` para a pasta `src` do build e executar
`SOFT_TEST_BLUR_CACHE=1 SOFT_TEST_BLUR_RATE=1 python3 tests/headless.py`.
Distribuição: ZIP v19 e RPM/SRPM 1.0.2-4.local. Após instalar a biblioteca,
encerre a sessão e entre novamente para carregar o novo código nativo.
