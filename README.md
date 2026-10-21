# ITR Update

Daily tracking of India's Income Tax e-Filing statistics: returns filed, e-verified, processed, and the backlog in between.

**Live site:** https://amitchaurasiyarorai.github.io/itr-update/

The e-Filing portal publishes only today's totals. This project keeps the history, so you can see how fast returns are being processed and whether the backlog is shrinking.

## How it works

The portal's public statistics are fetched twice a day (8 AM and 6 PM IST) by a GitHub Action, saved to [`data/stats.csv`](data/stats.csv), and charted on the site. No backend, no tracking.

## The data

[`data/stats.csv`](data/stats.csv) is free to download and use. One row per fetch:

| Column | Meaning |
|---|---|
| `timestamp_ist` | When the reading was taken (IST) |
| `as_of` | Date the portal's figures refer to |
| `ay` | Assessment year, e.g. `2026-27` (FY 2025-26) |
| `registered_users` | Individuals registered on the e-Filing portal |
| `returns_filed` | ITRs filed this assessment year |
| `everified_returns` | Returns e-verified and in the processing queue |
| `processed_refunds` | Returns processed by the department |
| `*_delta` | Change from the previous portal day, within the same assessment year |

The portal refreshes about once a day, so the morning and evening readings are often identical. Raw responses are kept in `data/raw/`.

### Assessment years

Counts restart with each assessment year, and filing opens on a different date every year (29 May 2025, 15 May 2026). The fetcher starts a new `ay` automatically when the portal's counters reset, so each season is kept separately and the dashboard adds it as a new tab, with a comparison against the previous season at the same number of days since filing opened. [`data/seasons.json`](data/seasons.json) holds optional labels, filing-open dates and sources per season.

**AY 2025-26** predates daily tracking. [`data/history/ay-2025-26.csv`](data/history/ay-2025-26.csv) reconstructs it from portal snapshots (9–14 Aug 2025, via [TensorBlast/ITRStats](https://github.com/TensorBlast/ITRStats)) and dated figures published during the season; rows marked `approx` are rounded figures as reported. Sources are listed in `seasons.json`.

## Run locally

```bash
python scripts/fetch_stats.py      # fetch the latest figures (Python 3.9+, no dependencies)
python -m http.server 8000         # then open http://localhost:8000
```

## Disclaimer

Independent project, not affiliated with the Income Tax Department or the Government of India. Figures are reproduced as published on the [e-Filing portal](https://www.incometax.gov.in).

---

Built by [Amit Chaurasiya](https://www.linkedin.com/in/amit-chaurasiya-45340945/)
