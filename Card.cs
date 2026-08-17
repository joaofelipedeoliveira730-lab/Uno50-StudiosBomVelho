using Godot;

namespace Uno50;

public enum CardColor { Red, Yellow, Green, Blue, Wild }
public enum CardType { Number, Skip, Reverse, DrawTwo, Wild, WildDrawFour }

public sealed record Card(CardColor Color, CardType Type, int Value = -1)
{
    public bool IsWild => Color == CardColor.Wild || Type is CardType.Wild or CardType.WildDrawFour;
    public string Label => Type switch
    {
        CardType.Number => Value.ToString(), CardType.Skip => "⦸", CardType.Reverse => "↔",
        CardType.DrawTwo => "+2", CardType.Wild => "W", CardType.WildDrawFour => "+4", _ => "?"
    };
    public Color UiColor => Color switch
    {
        CardColor.Red => new Color("e52b32"), CardColor.Yellow => new Color("f2c62e"),
        CardColor.Green => new Color("35a85a"), CardColor.Blue => new Color("3e73d1"), _ => new Color("242936")
    };
}
