# Arquitetura Uno50

A interface e o motor são separados. `Uno50App.cs` controla telas; `UnoGame.cs` controla estado de partida; `GameRules.cs` valida jogadas; `AntiCheat.cs` impõe limites.

A regra central é: o cliente pede uma ação, a autoridade valida e só então aplica a mudança. O cliente nunca informa sozinho a carta final, vencedor, relógio ou resultado.

Para produção online, a camada de autoridade deve rodar em servidor dedicado e usar transporte seguro/autenticação.
