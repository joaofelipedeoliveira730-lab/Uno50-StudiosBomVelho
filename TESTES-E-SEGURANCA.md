# Testes, erros conhecidos e prevenção

## Testes automatizados
- Baralho UNO: 108 cartas.
- Compatibilidade por cor.
- Compatibilidade por número.
- Curinga permitido.
- Jogada incompatível rejeitada.

## Proteções implementadas no motor
- autoridade do estado no motor; cliente não define vencedor
- nonce por ação para impedir replay/duplo clique
- limite de 8 ações por segundo por jogador
- turno com 25 segundos
- compra automática quando o turno expira
- janela de reconexão planejada de 30 segundos
- validação de índice da carta
- validação do jogador da vez
- validação de carta jogável
- encerramento imediato ao esvaziar a mão

## Moderação rigorosa planejada para produção
1. Registro de tentativas inválidas e spam.
2. Escalonamento: aviso -> expulsão da sala -> suspensão temporária -> suspensão maior.
3. Abandono repetido pode gerar bloqueio temporário de matchmaking.
4. Manipulação de relógio nunca é aceita do cliente.
5. Resultado e cartas ficam sob autoridade do servidor.
6. Upload de avatar deve validar tamanho, formato e conteúdo no servidor.
7. Sala privada exige código e senha; senha nunca é salva em texto puro.
8. Limitar conexões e mensagens.
9. Logs não devem guardar tokens, senhas ou conteúdo sensível.
10. Produção deve usar TLS/WSS/HTTPS e allowlist de origem.

## Tempos anti-abuso
- turno: 25 s
- reconexão: 30 s
- flood de ações: máximo 8/s no motor local
- sessão ociosa e conexões mortas: devem ser encerradas pelo servidor dedicado

## Erros conhecidos / não fingidos como resolvidos
- Este pacote não foi compilado no Godot porque o ambiente de construção não possui Godot/.NET.
- O multiplayer online de produção ainda precisa do servidor dedicado e persistência PostgreSQL.
- As músicas e sons históricos são placeholders/procedurais; não foram incluídas gravações de terceiros.
- A recuperação de senha permanece indisponível conforme solicitado.

## Próximo teste obrigatório
Abrir no Godot .NET 4.6, compilar, executar no Android e desktop, testar rotação/orientação, toque, teclado, reconexão, duas instâncias, criação de sala e persistência no PostgreSQL.
