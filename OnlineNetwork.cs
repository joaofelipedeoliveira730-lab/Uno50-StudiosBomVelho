using Godot;

namespace Uno50;

public partial class OnlineNetwork : Node
{
    public const int DefaultPort = 28750;
    public bool IsHost => Multiplayer.IsServer();
    public Error Host(int maxPlayers=3)
    {
        var peer=new ENetMultiplayerPeer();
        var err=peer.CreateServer(DefaultPort,maxPlayers);
        if(err==Error.Ok) Multiplayer.MultiplayerPeer=peer;
        return err;
    }
    public Error Join(string address)
    {
        var peer=new ENetMultiplayerPeer();
        var err=peer.CreateClient(address,DefaultPort);
        if(err==Error.Ok) Multiplayer.MultiplayerPeer=peer;
        return err;
    }
    public void Disconnect()=>Multiplayer.MultiplayerPeer=null;
}
