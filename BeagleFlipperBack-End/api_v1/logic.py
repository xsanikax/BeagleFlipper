import time
import httpx
from typing import Dict, Any, Tuple, List, Optional

from database import AccountStatus, Suggestion, GraphData
from debug_utils import DebugTracker

CACHE: Dict[str, Any] = {
    "mapping": None,
    "5m": None,
    "last_fetch_time": 0
}
CACHE_DURATION_SECONDS = 60
SKIP_DURATION_SECONDS = 600  # 10 minutes

# Filter thresholds
MIN_PROFIT_PER_ITEM = 3
MIN_ROI = 0.0005
MIN_5M_TOTAL_VOLUME = 50

async def get_market_data() -> Tuple[Dict, Dict]:
    now = time.time()
    if now - CACHE["last_fetch_time"] > CACHE_DURATION_SECONDS:
        print("Market data cache expired, fetching new data...")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {'User-Agent': 'FlippingCopilot-Production/Final'}

                mapping_res = await client.get("https://prices.runescape.wiki/api/v1/osrs/mapping", headers=headers)
                mapping_res.raise_for_status()
                CACHE["mapping"] = {str(item['id']): item for item in mapping_res.json()}

                five_min_res = await client.get("https://prices.runescape.wiki/api/v1/osrs/5m", headers=headers)
                five_min_res.raise_for_status()
                CACHE["5m"] = five_min_res.json().get("data", {})

                CACHE["last_fetch_time"] = now
                print(f"Successfully cached {len(CACHE['mapping'])} mappings and {len(CACHE['5m'])} 5m prices.")
        except httpx.RequestError as e:
            print(f"ERROR: Could not fetch wiki prices: {e}")
            if not CACHE["mapping"]:
                raise

    return CACHE["mapping"], CACHE["5m"]

async def find_best_buy_opportunity(status: AccountStatus) -> Optional[Dict[str, Any]]:
    try:
        mapping, five_min_data = await get_market_data()
    except Exception as e:
        print(f"Could not fetch market data: {e}")
        return None

    player_gp = status.get_total_gp()
    potential_flips = []
    debug = DebugTracker()
    now = time.time()

    print(f"--- Starting Analysis on {len(five_min_data)} items ---")

    for item_id_str, price_data in five_min_data.items():
        item_id = int(item_id_str)

        # Skip if recently attempted
        if item_id in status.skipped_items and (now - status.skipped_items[item_id]) < SKIP_DURATION_SECONDS:
            debug.count("recently_skipped")
            continue

        buy_price = price_data.get("avgLowPrice")
        sell_price = price_data.get("avgHighPrice")

        if not (buy_price and sell_price and buy_price > 0 and sell_price > 0):
            debug.count("missing_prices")
            continue

        total_volume = price_data.get("lowPriceVolume", 0) + price_data.get("highPriceVolume", 0)
        if total_volume < MIN_5M_TOTAL_VOLUME:
            debug.count("low_volume")
            continue

        item_metadata = mapping.get(item_id_str)
        if not item_metadata:
            debug.count("no_metadata")
            continue

        if player_gp < buy_price:
            debug.count("not_affordable")
            continue

        profit_per_item = int(sell_price * 0.98) - buy_price
        if profit_per_item < MIN_PROFIT_PER_ITEM:
            debug.count("low_margin")
            continue

        roi = profit_per_item / buy_price if buy_price > 0 else 0
        if roi < MIN_ROI:
            debug.count("low_roi")
            continue

        score = (roi * 1000) + (total_volume / 1000) + (profit_per_item / 5)
        potential_flips.append({
            "item_id": item_id,
            "name": item_metadata.get("name", ""),
            "buy_price": buy_price,
            "sell_price": sell_price,
            "profit": profit_per_item,
            "roi": roi,
            "limit": item_metadata.get("limit", 0),
            "volume": total_volume,
            "score": score
        })

    print(f"Found {len(potential_flips)} valid flips.")
    debug.summary(total=len(five_min_data))

    if not potential_flips:
        return None

    best = max(potential_flips, key=lambda x: x["score"])
    print(f"Best flip: {best['name']} | Buy: {best['buy_price']} | Sell: {best['sell_price']} | Margin: {best['profit']} | ROI: {best['roi']:.2%}")
    return best

async def generate_suggestion(status: AccountStatus) -> Suggestion:
    has_empty_slot = any(offer.status == "empty" for offer in status.offers)

    if has_empty_slot and not status.sell_only_mode:
        best_flip = await find_best_buy_opportunity(status)
        if best_flip:
            quantity_to_buy = min(best_flip.get("limit", 0), status.get_total_gp() // best_flip["buy_price"])
            if quantity_to_buy > 0:
                # Record margin for later sell suggestion
                status.price_memory[best_flip["item_id"]] = (best_flip["buy_price"], best_flip["sell_price"])

                print(f"Suggesting 'buy' for {quantity_to_buy}x {best_flip['name']}")
                return Suggestion(
                    type="buy",
                    box_id=-1,
                    item_id=best_flip["item_id"],
                    price=best_flip["buy_price"],
                    quantity=quantity_to_buy,
                    name=best_flip["name"],
                    command_id=int(time.time()),
                    message=f"Margin: {best_flip['profit']} gp",
                    graph_data=GraphData(itemId=best_flip["item_id"], name=best_flip["name"])
                )
            else:
                # Can't afford enough, skip for a while
                status.skipped_items[best_flip["item_id"]] = time.time()

    print("No suitable flip — suggesting WAIT")
    return Suggestion(
        type="wait",
        box_id=-1,
        item_id=-1,
        price=0,
        quantity=0,
        name="",
        command_id=int(time.time()),
        message="Waiting for a new opportunity.",
        graph_data=GraphData()
    )
