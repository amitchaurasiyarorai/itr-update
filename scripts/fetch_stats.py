#!/usr/bin/env python3
"""
Fetch the Income Tax e-Filing portal's public "Our Success Enablers" statistics
and append one row to data/stats.csv. Standard library only (Python 3.9+).

    python scripts/fetch_stats.py            # fetch + append
    python scripts/fetch_stats.py --inspect  # fetch, print every field found, write nothing

The endpoint is a plain GET returning flat JSON, e.g.
  {"IndvRegUsers": ..., "TotalAadharLinkedPAN": ..., "eVerifiedReturns": ...,
   "TotalProcessedRefund": ..., "LastUpdated": "2025-08-09"}
(field names confirmed from github.com/TensorBlast/ITRStats).

The portal refreshes once a day; LastUpdated is the date the figures are "as of".
Deltas are therefore computed against the last row with an earlier as_of date,
so the 8 AM and 6 PM fetches of the same portal day carry the same delta.
If the portal ever renames fields, the keyword fallback in FIELD_HINTS kicks in;
use --inspect to see what was matched.
"""
import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ENDPOINT = os.environ.get(
    "IT_ENDPOINT", "https://eportal.incometax.gov.in/iec/oursuccessenablers/saveData"
)
METHOD = os.environ.get("IT_METHOD", "GET").upper()
BODY = os.environ.get("IT_BODY", "{}")

IST = timezone(timedelta(hours=5, minutes=30))
ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "stats.csv"
RAW_DIR = ROOT / "data" / "raw"

METRICS = ["registered_users", "returns_filed", "everified_returns", "processed_refunds"]

# Pin exact flattened keys here once you've seen the real response (--inspect).
# e.g. "returns_filed": "data.itrFiledCount"
FIELD_OVERRIDES: dict[str, str] = {
    "registered_users": "IndvRegUsers",
    "returns_filed": "TotalAadharLinkedPAN",  # returns filed with Aadhaar-linked PAN
    "everified_returns": "eVerifiedReturns",
    "processed_refunds": "TotalProcessedRefund",
}
AS_OF_KEY = "LastUpdated"

# Fallback: first numeric key whose path matches `include` and not `exclude`.
FIELD_HINTS = {
    "registered_users": (r"regist|individual.?user|user.?count", r"today|daily|refund"),
    "processed_refunds": (r"process", r"today|daily"),
    "everified_returns": (r"e.?verif|verified", r"today|daily|process"),
    "returns_filed": (r"filed|itr|return", r"today|daily|verif|process"),
}

HEADER = ["timestamp_ist", "date_ist", "as_of"] + METRICS + [f"{m}_delta" for m in METRICS]


def fetch(attempts: int = 4) -> object:
    data = None if METHOD == "GET" else BODY.encode()
    req = urllib.request.Request(
        ENDPOINT,
        data=data,
        method=METHOD,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://eportal.incometax.gov.in",
            "Referer": "https://eportal.incometax.gov.in/iec/foportal/en/",
            "Accept-Language": "en-IN,en;q=0.9",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
    )
    last = None
    for i in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
            last = e
            print(f"attempt {i}/{attempts} failed: {e}", file=sys.stderr)
            if i < attempts:
                time.sleep(5 * 2**i)
    raise SystemExit(f"fetch failed after {attempts} attempts: {last}")


def to_number(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str):
        s = re.sub(r"[,\s]", "", v)
        if re.fullmatch(r"-?\d+(\.\d+)?", s):
            return int(float(s))
    return None


def flatten(obj, prefix=""):
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.update(flatten(v, f"{prefix}{k}."))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out.update(flatten(v, f"{prefix}{i}."))
    else:
        out[prefix[:-1]] = obj
    # List-of-{label, value} shapes: also expose "label -> value".
    if isinstance(obj, list):
        for item in obj:
            if isinstance(item, dict):
                label = next((item[k] for k in item if isinstance(item[k], str) and to_number(item[k]) is None), None)
                num = next((to_number(item[k]) for k in item if to_number(item[k]) is not None), None)
                if label and num is not None:
                    out[f"{prefix}[{label}]"] = num
    return out


def extract(payload) -> dict:
    flat = {k: to_number(v) for k, v in flatten(payload).items()}
    flat = {k: v for k, v in flat.items() if v is not None}
    picked, used = {}, set()
    for metric, key in FIELD_OVERRIDES.items():
        if key and key in flat:
            picked[metric] = flat[key]
            used.add(key)
    for metric, (inc, exc) in FIELD_HINTS.items():
        if metric in picked:
            continue
        for key, val in flat.items():
            k = key.lower()
            if key not in used and re.search(inc, k) and not re.search(exc, k):
                picked[metric] = val
                used.add(key)
                break
    return picked, flat


def parse_as_of(payload):
    """Normalise the portal's LastUpdated to YYYY-MM-DD, or None."""
    raw = payload.get(AS_OF_KEY) if isinstance(payload, dict) else None
    if not raw:
        return None
    raw = str(raw).strip()
    for candidate in (raw, raw[:10], raw[:11]):
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%b-%Y", "%d %b %Y"):
            try:
                return datetime.strptime(candidate, fmt).strftime("%Y-%m-%d")
            except ValueError:
                pass
    m = re.search(r"\d{4}-\d{2}-\d{2}", raw)
    return m.group(0) if m else None


def read_rows():
    if not CSV_PATH.exists():
        return []
    with CSV_PATH.open(newline="") as f:
        return list(csv.DictReader(f))


def main():
    inspect = "--inspect" in sys.argv
    payload = fetch()
    picked, flat = extract(payload)

    if inspect:
        print(json.dumps(payload, indent=2, ensure_ascii=False)[:4000])
        print("\nNumeric fields found:")
        for k, v in flat.items():
            print(f"  {k} = {v}")
        print("\nMatched:", json.dumps(picked, indent=2))
        return

    missing = [m for m in METRICS if m not in picked]
    if len(missing) == len(METRICS):
        raise SystemExit("No metrics matched the response. Run with --inspect and set FIELD_OVERRIDES.")
    if missing:
        print(f"warning: unmatched metrics {missing}; run --inspect", file=sys.stderr)

    now = datetime.now(IST)
    today = now.strftime("%Y-%m-%d")
    rows = read_rows()
    as_of = parse_as_of(payload) or today

    # Daily delta = this value minus the last reading of an earlier portal day.
    day = lambda r: r.get("as_of") or r["date_ist"]
    prev = next((r for r in reversed(rows) if day(r) < as_of), None)
    row = {"timestamp_ist": now.strftime("%Y-%m-%dT%H:%M:%S%z"), "date_ist": today, "as_of": as_of}
    for m in METRICS:
        v = picked.get(m)
        row[m] = "" if v is None else v
        pv = to_number(prev.get(m)) if prev else None
        row[f"{m}_delta"] = "" if v is None or pv is None else v - pv

    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    new_file = not CSV_PATH.exists() or CSV_PATH.stat().st_size == 0
    with CSV_PATH.open("a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADER)
        if new_file:
            w.writeheader()
        w.writerow(row)

    # Keep the raw response too, so a mapping fix can be back-filled later.
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR / f"{now.strftime('%Y-%m-%dT%H%M')}.json").write_text(
        json.dumps(payload, ensure_ascii=False)
    )
    print("appended:", row)


if __name__ == "__main__":
    main()
