import pandas as pd
from rswiki_wrapper.osrs import TimeSeries
from datetime import datetime

# 1. Load CSV flips
df = pd.read_csv("DaBeagleBoss.csv", parse_dates=["timestamp"])
df["action"] = df["action"].str.lower()

# 2. Set up timeseries cache
cache = {}
def ts(item_id, interval):
    key = (item_id, interval)
    if key not in cache:
        ts_data = TimeSeries(game="osrs",
                             user_agent="MyScript - you@example.com",
                             id=str(item_id), timestep=interval)
        df_ts = pd.DataFrame(ts_data.content)
        df_ts["timestamp"] = pd.to_datetime(df_ts["timestamp"], unit="s")
        cache[key] = df_ts
    return cache[key]

# 3. Match flips to closest market data
records = []
for _, r in df.iterrows():
    df_hist = ts(r["item_id"], "5m")  # or use "1h"
    idx = (df_hist["timestamp"] - r["timestamp"]).abs().idxmin()
    bucket = df_hist.loc[idx]
    mid = (bucket["avgHighPrice"] + bucket["avgLowPrice"]) / 2
    diff = (r["price"] - bucket["avgHighPrice"]) if r["action"]=="buy" else (bucket["avgLowPrice"] - r["price"])
    records.append({
        **r.to_dict(),
        "bucket_ts": bucket["timestamp"],
        "mid_price": mid, "diff": diff,
        "spread_pct": diff/mid * 100
    })

out = pd.DataFrame(records)
out.to_csv("analyzed_" + "DaBeagleBoss.csv", index=False)
print("✅ Analysis complete:", len(out), "rows processed.")
