using System;
using System.Collections.Generic;

namespace Uno50;

public sealed class AntiCheat
{
    private readonly Dictionary<string, (DateTime time,int count)> actions = new();
    private readonly HashSet<string> nonces = new();
    public const double TurnSeconds = 25;
    public const double ReconnectGraceSeconds = 30;
    public bool AcceptAction(string playerId, string nonce, double nowUnix)
    {
        if (string.IsNullOrWhiteSpace(playerId) || string.IsNullOrWhiteSpace(nonce)) return false;
        if (!nonces.Add(playerId + ":" + nonce)) return false;
        var now=DateTimeOffset.FromUnixTimeMilliseconds((long)(nowUnix*1000)).UtcDateTime;
        if(!actions.TryGetValue(playerId,out var x) || (now-x.time).TotalSeconds>=1) actions[playerId]=(now,1);
        else { if(x.count>=8) return false; actions[playerId]=(x.time,x.count+1); }
        return true;
    }
}
