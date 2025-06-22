import time
import msgpack
from typing import List, Tuple, Dict
from pydantic import BaseModel, Field

class Offer(BaseModel):
    status: str
    item_id: int
    price: int
    amount_total: int
    amount_spent: int
    amount_traded: int
    items_to_collect: int
    gp_to_collect: int
    box_id: int
    active: bool
    copilot_price_used: bool

class InventoryItem(BaseModel):
    item_id: int
    amount: int

class AccountStatus(BaseModel):
    offers: List[Offer]
    items: List[InventoryItem]
    is_member: bool
    display_name: str
    sell_only_mode: bool = Field(..., alias='sell_only')
    f2p_only_mode: bool = Field(..., alias='f2p_only')
    blocked_items: List[int]
    timeframe: int
    skip_suggestion: int
    send_graph_data: bool

    # Extra runtime fields (not part of JSON, initialized at runtime)
    price_memory: Dict[int, Tuple[int, int]] = {}
    skipped_items: Dict[int, float] = {}

    class Config:
        populate_by_name = True

    def get_total_gp(self) -> int:
        coins = next((item.amount for item in self.items if item.item_id == 995), 0)
        tokens = next((item.amount for item in self.items if item.item_id == 13204), 0)
        return coins + (tokens * 1000)

class GraphData(BaseModel):
    itemId: int = 0
    name: str = ""
    buyPrice: int = 0
    sellPrice: int = 0
    dailyVolume: float = 0.0
    low1hTimes: List[int] = []
    low1hPrices: List[int] = []
    high1hTimes: List[int] = []
    high1hPrices: List[int] = []

    def to_msgpack(self) -> bytes:
        return msgpack.packb({
            "id": self.itemId, "n": self.name, "dv": self.dailyVolume,
            "sp": self.sellPrice, "bp": self.buyPrice,
            "l1ht": self.low1hTimes or None, "l1hp": self.low1hPrices or None,
            "h1ht": self.high1hTimes or None, "h1hp": self.high1hPrices or None,
            "l5mt": None, "l5mp": None, "h5mt": None, "h5mp": None,
            "llt": None, "llp": None, "hlt": None, "hlp": None,
            "pt": None, "plm": None, "pliu": None, "plil": None,
            "phm": None, "phiu": None, "phil": None
        }, use_bin_type=True)

class Suggestion(BaseModel):
    type: str
    box_id: int
    item_id: int
    price: int
    quantity: int
    name: str
    command_id: int
    message: str
    graph_data: GraphData

    def to_msgpack_sections(self) -> Tuple[bytes, bytes]:
        suggestion_map = {
            "t": self.type, "b": self.box_id, "i": self.item_id,
            "p": self.price, "q": self.quantity, "n": self.name,
            "id": self.command_id, "m": self.message
        }
        suggestion_bytes = msgpack.packb(suggestion_map, use_bin_type=True)
        graph_data_bytes = self.graph_data.to_msgpack()
        return suggestion_bytes, graph_data_bytes
