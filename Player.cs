using System.Collections.Generic;

namespace Uno50;

public sealed class Player
{
    public string Id { get; init; } = "";
    public string Name { get; set; } = "Jogador";
    public int AvatarId { get; set; } = 1;
    public bool IsBot { get; init; }
    public List<Card> Hand { get; } = new();
    public int MissedTurns { get; set; }
}
