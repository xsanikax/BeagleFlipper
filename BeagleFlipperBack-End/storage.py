import os
import json
from typing import List, Dict, Any

TRADE_STORAGE_DIR = "trades"

def init_storage_dir():
    if not os.path.exists(TRADE_STORAGE_DIR):
        os.makedirs(TRADE_STORAGE_DIR)

def get_user_trade_path(display_name: str) -> str:
    safe_name = display_name.replace(" ", "_")
    return os.path.join(TRADE_STORAGE_DIR, f"{safe_name}_trades.json")

def save_trade(display_name: str, trade: Dict[str, Any]):
    path = get_user_trade_path(display_name)
    try:
        if os.path.exists(path):
            with open(path, "r") as f:
                data = json.load(f)
        else:
            data = []

        data.append(trade)

        with open(path, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Failed to save trade for {display_name}: {e}")

def get_profit_summary(display_name: str) -> Dict[str, Any]:
    path = get_user_trade_path(display_name)
    try:
        if not os.path.exists(path):
            return {"gp_earned": 0, "flips": 0}

        with open(path, "r") as f:
            data = json.load(f)

        gp_earned = sum(t.get("profit", 0) for t in data if "profit" in t)
        return {
            "gp_earned": gp_earned,
            "flips": len(data)
        }
    except Exception as e:
        print(f"Failed to get summary for {display_name}: {e}")
        return {"gp_earned": 0, "flips": 0}
