# Uno50 — Relatório da Reforma

## Estado

Pacote reconstruído do zero em Godot 4.6 .NET / C#, sem carregar os arquivos de interface e lógica antigos. O banco antigo não é levado para o projeto: existe uma migração mínima separada para manter somente o que o Uno50 precisa.

## O que foi colocado

- Tela de termos de uso.
- Login separado de cadastro.
- Mensagem explícita de recuperação de senha indisponível.
- Escolha de plataforma a cada entrada.
- Menu centralizado.
- Perfil com 10 personagens leves em SVG.
- Troca de personagem/foto e seleção persistível no modelo de perfil.
- Jogar: Solo, Duo e Trio.
- Motor básico de UNO em C#.
- Baralho padrão de 108 cartas.
- Cores, números, bloqueio, inversão, +2, curinga e +4.
- Regra de +4 restringida quando o jogador possui carta da cor ativa.
- Bot para partidas solo.
- Cronômetro de 25 segundos por turno.
- Compra automática quando o tempo termina.
- Botão UNO.
- Cinco mapas: Mar dos Piratas, Templo do Egito, Fórum de Roma, Japão Edo e Rota da Seda.
- Mapas em SVG leve, sem imagens pesadas de terceiros.
- Camada inicial de rede ENet para host/join.
- Interface de salas e criação de sala.
- Opções de sala: nome, senha opcional, pública/privada, modo, bots, mapa e descrição.
- Configurações: brilho, som e redução de animações.
- Banco mínimo para usuários, perfil, salas, jogadores de sala, partidas, jogadores de partida, moderação e denúncias.
- Bootstrap separado para recriar a conta CEO com bcrypt e emblema de Líder.

## Limpeza do banco

O novo SQL contém `TRUNCATE` das tabelas do sistema antigo antes do novo conjunto mínimo. A criação da conta CEO foi separada para não colocar senha em texto puro dentro do SQL.

A conta CEO não recebe o conjunto antigo de poderes administrativos. O único marcador simbólico preservado é `leader_badge = TRUE`.

Antes de executar a limpeza em uma base real, deve existir backup e janela de manutenção.

## Proteção contra má-fé

O motor não aceita o cliente como autoridade para decidir vencedor, turno ou carta final. A ação é validada pelo estado do jogo.

Foram adicionados:

- nonce por ação para bloquear replay/duplo clique.
- limite de ações por jogador.
- validação do jogador atual.
- validação do índice da carta.
- validação de carta jogável.
- regra de +4.
- relógio de turno.
- compra automática por timeout.
- janela de reconexão definida para futura camada de servidor.
- registro planejado de ações de moderação.
- estrutura para denúncias.

Para produção online, a autoridade real precisa ficar no servidor dedicado. Godot oferece ENet e RPCs para multiplayer, mas a documentação alerta que rede não é segura automaticamente e que lógica crítica deve permanecer sob autoridade do servidor. citeturn0search1

## Tempos adotados

- Turno: 25 segundos.
- Reconexão planejada: 30 segundos.
- Limite local do motor: 8 ações por segundo por jogador.
- Sessões/conexões mortas: devem ser encerradas pelo servidor dedicado.

## Testes executados

Teste automatizado do motor:

- baralho com 108 cartas: PASS.
- jogada por cor: PASS.
- jogada por número: PASS.
- curinga: PASS.
- jogada incompatível: PASS.
- restrição de +4: PASS.

Também foi feita verificação estática dos arquivos C# para:

- chaves balanceadas.
- ausência de strings com quebra de linha inválida.
- presença dos scripts principais.
- presença dos 10 personagens.
- presença dos 5 mapas.

## O que NÃO foi falsamente declarado como testado

O ambiente de construção desta conversa não possui o editor Godot .NET nem o SDK .NET instalados. Por isso não foi possível executar um build real do projeto Godot, abrir a cena, testar Android ou testar duas instâncias de multiplayer.

Esse é o principal teste pendente.

## Segurança de produção

A camada online deve usar transporte seguro, autenticação por sessão, validação de origem, limites de tamanho, rate limiting, timeouts e monitoramento. Essas medidas são coerentes com as recomendações de segurança para WebSockets e aplicações em tempo real da OWASP. citeturn0search0turn0search10

Também não foram incluídas músicas comerciais ou gravações históricas de terceiros. Os mapas possuem direção de áudio documentada para receber trilhas e ambientes originais.

## Próxima etapa recomendada

1. Abrir o projeto no Godot .NET 4.6.
2. Compilar.
3. Corrigir qualquer diferença de API específica da instalação.
4. Testar Android em retrato e desktop em paisagem.
5. Trocar a camada de sala inicial pelo servidor dedicado.
6. Ligar autenticação e PostgreSQL.
7. Implementar persistência real do avatar e configurações.
8. Implementar reconexão real.
9. Testar partidas com perda de conexão, spam e mensagens inválidas.
10. Só então gerar build de distribuição.
