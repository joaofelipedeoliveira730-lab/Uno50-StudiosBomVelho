using Godot;
using System;
using System.Text;

namespace Uno50;

public partial class OnlineNetwork : Node
{
    [Export] public string ServerUrl = "";
    public WebSocketPeer Peer { get; private set; } = new();
    public bool Connected => Peer.GetReadyState() == WebSocketPeer.State.Open;

    public Error Connect(string url, string token)
    {
        if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(token))
            return Error.InvalidParameter;

        ServerUrl = url;
        var separator = url.Contains('?') ? "&" : "?";
        return Peer.ConnectToUrl($"{url}{separator}token={Uri.EscapeDataString(token)}");
    }

    public void Disconnect()
    {
        Peer.Close();
    }

    public override void _Process(double delta)
    {
        Peer.Poll();
    }

    public void SendJson(string type, Godot.Collections.Dictionary data)
    {
        if (!Connected) return;
        var msg = new Godot.Collections.Dictionary { ["type"] = type };
        foreach (var key in data.Keys) msg[key] = data[key];
        Peer.SendText(Json.Stringify(msg));
    }
}
