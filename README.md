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
| `registered_users` | Individuals registered on the e-Filing portal |
| `returns_filed` | ITRs filed this assessment year |
| `everified_returns` | Returns e-verified and in the processing queue |
| `processed_refunds` | Returns processed by the department |
| `*_delta` | Change from the previous portal day |

The portal refreshes about once a day, so the morning and evening readings are often identical. Counts restart each assessment year. Raw responses are kept in `data/raw/`.

## Run locally

```bash
python scripts/fetch_stats.py      # fetch the latest figures (Python 3.9+, no dependencies)
python -m http.server 8000         # then open http://localhost:8000
```

## Disclaimer

Independent project, not affiliated with the Income Tax Department or the Government of India. Figures are reproduced as published on the [e-Filing portal](https://www.incometax.gov.in).

---

Built by [Amit Chaurasiya](https://www.linkedin.com/in/amit-chaurasiya-45340945/)
