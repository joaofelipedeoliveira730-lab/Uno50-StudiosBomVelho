# Uno50 — reconstrução limpa

Projeto reconstruído em Godot 4.6 .NET / C#. A interface é criada por código para manter o projeto pequeno e consistente.

## Escopo
- Login/cadastro e recuperação indisponível
- escolha de plataforma a cada entrada
- perfil com 10 personagens/fotos locais
- Solo, Duo e Trio locais
- Online/salas: UI e camada ENet inicial (host/join)
- cinco mapas históricos com identidade visual
- configurações de desempenho
- motor UNO server-authoritative preparado
- proteção contra ações duplicadas, spam, timeout e abandono

## Execução
Instale o editor Godot .NET 4.6 e .NET 8.0. Abra `project.godot` e execute.

## Limitação importante
O ambiente de construção usado para este pacote não possui Godot/.NET, então não foi possível executar o editor ou fazer build binário. Os testes automáticos do motor foram feitos fora do Godot em Python e a estrutura C# foi revisada estaticamente. Antes de produção, faça build no Godot .NET 4.6 e teste em Android e desktop.


## Servidor online
`server.js` é o backend Node.js para o Render. O banco é PostgreSQL e a comunicação de partida usa WebSocket.
O Godot não deve tentar rodar `server.js`; o cliente Godot se conecta ao endereço do Render.
