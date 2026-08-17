using Godot;
using System;
using System.Collections.Generic;
using System.Linq;

namespace Uno50;

public sealed class UnoGame
{
    public List<Player> Players { get; } = new();
    public List<Card> DrawPile { get; } = new();
    public List<Card> Discard { get; } = new();
    public CardColor ActiveColor { get; private set; } = CardColor.Red;
    public int CurrentPlayer { get; private set; }
    public bool Finished { get; private set; }
    public string? Winner { get; private set; }
    public double TurnRemaining { get; private set; } = AntiCheat.TurnSeconds;
    public readonly AntiCheat Security = new();
    private readonly Random rng = new();

    public void Start(int count, bool bots)
    {
        Players.Clear(); DrawPile.Clear(); Discard.Clear(); Finished=false; Winner=null; CurrentPlayer=0; TurnRemaining=AntiCheat.TurnSeconds;
        for(int i=0;i<count;i++) Players.Add(new Player { Id=$"p{i}", Name=i==0?"Você":$"{(bots?"Bot":"Jogador")} {i+1}", AvatarId=(i%10)+1, IsBot=bots });
        BuildDeck();
        foreach(var p in Players) for(int i=0;i<7;i++) p.Hand.Add(Draw());
        var first=Draw(); while(first.IsWild) { DrawPile.Insert(0,first); first=Draw(); } Discard.Add(first); ActiveColor=first.Color;
    }

    private void BuildDeck()
    {
        foreach(var c in new[]{CardColor.Red,CardColor.Yellow,CardColor.Green,CardColor.Blue})
        {
            DrawPile.Add(new(c,CardType.Number,0));
            for(int n=1;n<=9;n++){DrawPile.Add(new(c,CardType.Number,n));DrawPile.Add(new(c,CardType.Number,n));}
            for(int i=0;i<2;i++){DrawPile.Add(new(c,CardType.Skip));DrawPile.Add(new(c,CardType.Reverse));DrawPile.Add(new(c,CardType.DrawTwo));}
        }
        for(int i=0;i<4;i++){DrawPile.Add(new(CardColor.Wild,CardType.Wild));DrawPile.Add(new(CardColor.Wild,CardType.WildDrawFour));}
        DrawPile.Sort((a,b)=>rng.Next(-1,2));
    }

    private Card Draw(){ if(DrawPile.Count==0) Recycle(); var c=DrawPile[^1];DrawPile.RemoveAt(DrawPile.Count-1);return c; }
    private void Recycle(){ if(Discard.Count<=1) return; var keep=Discard[^1]; var cards=Discard.Take(Discard.Count-1).ToList();Discard.Clear();Discard.Add(keep);cards.Sort((a,b)=>rng.Next(-1,2));DrawPile.AddRange(cards);}

    public bool Play(int playerIndex,int cardIndex,CardColor chosen,string nonce)
    {
        if(Finished || playerIndex!=CurrentPlayer || playerIndex<0 || playerIndex>=Players.Count) return false;
        if(!Security.AcceptAction(Players[playerIndex].Id,nonce,DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()/1000.0)) return false;
        var p=Players[playerIndex]; if(cardIndex<0||cardIndex>=p.Hand.Count) return false;
        var card=p.Hand[cardIndex]; var top=Discard[^1]; if(!GameRules.CanPlay(card,top,ActiveColor)) return false;
        p.Hand.RemoveAt(cardIndex);Discard.Add(card); if(card.IsWild) ActiveColor=chosen; else ActiveColor=card.Color;
        if(p.Hand.Count==0){Finished=true;Winner=p.Name;return true;}
        Advance(card); return true;
    }

    public Card DrawForCurrent(string nonce)
    {
        if(Finished) return new(CardColor.Wild,CardType.Wild); var p=Players[CurrentPlayer];
        if(!Security.AcceptAction(p.Id,nonce,DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()/1000.0)) return new(CardColor.Wild,CardType.Wild);
        var c=Draw();p.Hand.Add(c);Advance(null);return c;
    }

    private void Advance(Card? card)
    {
        int step=card?.Type==CardType.Reverse?-1:1; if(Players.Count==2 && card?.Type==CardType.Reverse) step=1;
        if(card?.Type==CardType.Skip) step*=2; CurrentPlayer=(CurrentPlayer+step+Players.Count*4)%Players.Count;TurnRemaining=AntiCheat.TurnSeconds;
    }

    public void Tick(double delta)
    {
        if(Finished) return; TurnRemaining-=delta; if(TurnRemaining<=0){TurnRemaining=AntiCheat.TurnSeconds; var p=Players[CurrentPlayer];p.MissedTurns++;DrawForCurrent("timeout-"+Guid.NewGuid().ToString("N"));}
    }
}
