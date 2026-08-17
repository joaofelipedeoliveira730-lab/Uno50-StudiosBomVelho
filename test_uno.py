from dataclasses import dataclass

@dataclass(frozen=True)
class Card:
    color:str; typ:str; value:int=-1
    @property
    def wild(self): return self.color=='wild' or self.typ in ('wild','wild4')

def playable(c, top, active):
    return c.wild or c.color==active or c.color==top.color or (c.typ=='number' and top.typ=='number' and c.value==top.value) or (c.typ != 'number' and c.typ == top.typ)

def deck():
    out=[]
    for col in ('red','yellow','green','blue'):
        out.append(Card(col,'number',0))
        for n in range(1,10): out += [Card(col,'number',n),Card(col,'number',n)]
        for _ in range(2): out += [Card(col,'skip'),Card(col,'reverse'),Card(col,'draw2')]
    for _ in range(4): out += [Card('wild','wild'),Card('wild','wild4')]
    return out

def test_deck(): assert len(deck())==108
def test_color(): assert playable(Card('red','number',7),Card('blue','number',2),'red')
def test_number(): assert playable(Card('red','number',7),Card('blue','number',7),'blue')
def test_wild(): assert playable(Card('wild','wild4'),Card('blue','number',2),'blue')
def test_invalid(): assert not playable(Card('red','number',7),Card('blue','number',2),'green')
if __name__=='__main__':
    for f in (test_deck,test_color,test_number,test_wild,test_invalid): f(); print('PASS',f.__name__)
