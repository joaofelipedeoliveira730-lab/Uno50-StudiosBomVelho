# UNO Velho Matematixa — Rebuild 8.0

Esta versão é uma reconstrução visual da camada de apresentação do projeto existente.

## Direção
- Identidade azul + roxo.
- Interface sem emojis decorativos.
- Lobby com hierarquia visual, profundidade, iluminação e personagem central.
- Mesa de jogo com perspectiva, vinheta, anel de mesa e iluminação cinematográfica.
- Cartas com resposta física, hover e feedback de ação.
- Microinterações: ripple, press, partículas, pulso de turno e flutuação do personagem.
- Responsividade para celular e computador.

## Preservado
- PostgreSQL e schema.
- API/rotas existentes.
- Socket.IO e lógica de jogo.
- Assets existentes.
- Mapas, cosméticos, áudio e personagens.

## Alterações principais
- `index.html`: limpeza da apresentação e cache-busting da folha de estilos.
- `style.css`: nova camada visual Premium 8.0 no final do arquivo, sem apagar os estilos anteriores para manter compatibilidade.
- `app.js`: camada de apresentação com feedback tátil e partículas; nenhuma regra de partida ou banco é alterada.

## QA
- `node --check app.js` passou.
- `node --check server.js` passou.
