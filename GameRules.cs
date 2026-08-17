namespace Uno50;

public static class GameRules
{
    public static bool CanPlay(Card card, Card top, CardColor activeColor)
    {
        if (card.IsWild) return card.Type != CardType.WildDrawFour || true;
        return card.Color == activeColor || card.Color == top.Color || (card.Type == CardType.Number && top.Type == CardType.Number && card.Value == top.Value) || (card.Type != CardType.Number && card.Type == top.Type);
    }

    public static int Penalty(Card card) => card.Type switch { CardType.DrawTwo => 2, CardType.WildDrawFour => 4, _ => 0 };
}
