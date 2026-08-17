# UNO Velho Matematixa 8.2 — QA profundo

## Correções principais
- Navegação interna passou de `replaceState` para histórico real com `pushState`.
- Botões de voltar usam `history.back()` quando a entrada anterior realmente corresponde ao destino.
- Caso a tela tenha sido aberta por um caminho diferente do esperado, o botão usa fallback explícito sem quebrar o histórico.
- `popstate` foi sincronizado com a tela atual.
- Editor de personagem: Voltar agora retorna para PERSONAGENS quando veio da galeria; quando aberto diretamente, cai no destino seguro.
- Catálogo e guarda-roupa agora exibem os SVGs reais dos assets em vez de placeholders/emoji.
- Adicionados 5 assets de personagens: velhinho, barman, rainha, astronauta e rei.
- Avatar recebeu estrutura visual com cabeça, tronco, braços, pernas e calçados preservados mesmo dentro dos frames pequenos.
- Arena mobile recebeu uma composição nova: parede/navy, mesa elíptica inferior, feltro verde, centro de cartas e áreas de oponentes separadas.
- CSS final foi colocado em uma camada única de override para neutralizar conflitos acumulados das versões anteriores.
- Cache-busting de `app.js` e `style.css` atualizado para 8.2.

## Testes automatizados executados
- `node --check app.js` — OK
- `node --check server.js` — OK
- `node --check config.js` — OK
- `node --check migrate.js` — OK
- CSS: 2811 `{` e 2811 `}` — OK
- 153 SVGs parseados por XML — 0 erros
- IDs HTML duplicados — 0 encontrados
- Referências locais de assets verificadas — 0 ausentes
- IDs cosméticos usados pelo frontend — 0 assets ausentes
- Destinos `data-back` — todos apontam para views existentes
- Histórico de navegação: `uvView` + `uvFrom` adicionados para validação de retorno correto

## Teste de navegador
O Chromium headless disponível no ambiente não conseguiu encerrar corretamente durante a execução (processo ficou preso em comunicação do zygote/DBus). Por isso, não foi declarado um teste visual/interativo de navegador como aprovado. Os testes estruturais acima foram executados de fato.

## Arquivos mais importantes alterados
- `app.js`
- `style.css`
- `index.html`
- `assets/manifest.json`
- `package.json`
- `assets/characters/*.svg`

