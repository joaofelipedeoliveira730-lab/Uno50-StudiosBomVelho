# UNO50 — Render

## Web Service
Runtime: Node
Build Command:
`npm install`

Start Command:
`node server.js`

## Environment Variables
- `DATABASE_URL` = URL do PostgreSQL do Render
- `JWT_SECRET` = uma string aleatória com pelo menos 32 caracteres
- `CEO_USERNAME` = CeoVelho (opcional)
- `CEO_PASSWORD` = senha escolhida por você, nunca coloque no GitHub

## Banco
1. Faça backup do PostgreSQL.
2. Execute `schema_uno50.sql`.
3. No Shell do Render ou ambiente local com as variáveis configuradas:
   `npm run bootstrap`

## Saúde
Depois do deploy:
`GET /health`

Deve retornar `ok: true` e `database: "ok"`.

## Importante
O jogo Godot/C# é o cliente. O Node.js é o servidor online.
Não coloque `CEO_PASSWORD`, `DATABASE_URL` ou `JWT_SECRET` no GitHub.
