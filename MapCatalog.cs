namespace Uno50;

public sealed record MapInfo(string Id,string Name,string Description,string Accent);
public static class MapCatalog
{
 public static readonly MapInfo[] All={
  new("pirate","Mar dos Piratas","Convés antigo, mar noturno, lanternas e magia verde.","#2f6f55"),
  new("egypt","Templo do Egito","Pedra, tochas, hieróglifos e ritual antigo.","#b78a42"),
  new("rome","Fórum de Roma","Pedra quente, colunas e cidade ao entardecer.","#9b5b3d"),
  new("edo","Japão Edo","Madeira, jardim, lanternas, água e silêncio.","#6c7892"),
  new("silk","Rota da Seda","Caravançarai, lanternas, tecidos e céu estrelado.","#9b6b4a")};
}
