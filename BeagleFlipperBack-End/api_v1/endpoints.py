from fastapi import APIRouter, Request, Response, status, Body
from typing import Dict, Any
from .logic import generate_suggestion
from database import AccountStatus
import httpx
import msgpack

router = APIRouter()

@router.post("/suggestion")
async def get_suggestion(account_status: AccountStatus):
    suggestion = await generate_suggestion(account_status)
    suggestion_bytes, graph_bytes = suggestion.to_msgpack_sections()
    content = suggestion_bytes + graph_bytes
    return Response(
        content=content,
        headers={
            "Content-Type": "application/x-msgpack",
            "X-Suggestion-Content-Length": str(len(suggestion_bytes)),
            "Content-Length": str(len(content)),
        },
        status_code=status.HTTP_200_OK
    )

@router.post("/prices")
async def lookup_price(data: Dict[str, int] = Body(...)):
    item_id = data.get("item_id")
    if not item_id:
        return Response(status_code=status.HTTP_400_BAD_REQUEST)
    async with httpx.AsyncClient() as client:
        r = await client.get(f"https://prices.runescape.wiki/api/v1/osrs/latest?id={item_id}")
        r.raise_for_status()
        info = r.json().get("data", {}).get(str(item_id), {})
    return {"item_id": item_id, "buy_price": info.get("low", 0), "sell_price": info.get("high", 0)}

@router.post("/profit-tracking/client-transactions")
async def profit_tracking_stub(display_name: str = Body(..., embed=True)):
    return {"status": "ok"}
