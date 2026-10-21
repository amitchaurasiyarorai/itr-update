# ITR Update

A lightweight, static dashboard that tracks the Income Tax e-Filing portal's public statistics day by day — registered users, returns filed, e-verified returns and processed returns — with daily deltas and a processing-backlog view.

No backend, no database: a Python script fetches the numbers twice a day via GitHub Actions, appends them to `data/stats.csv`, and GitHub Pages serves the dashboard, which reads the CSV directly.

```
.github/workflows/fetch-stats.yml   runs at ~8 AM and ~6 PM IST, commits new data
scripts/fetch_stats.py              fetches the endpoint, appends a CSV row (stdlib only)
data/stats.csv                      the open dataset (one row per fetch)
data/raw/*.json                     raw responses, kept so mappings can be back-filled
index.html, assets/                 the dashboard (Chart.js from cdnjs)
```

## Your details

Edit **`assets/config.js`** only — name, role, bio, LinkedIn, GitHub, email, photo and repo link. The About page, footer credit and nav all read from it. Empty fields are hidden. To add a photo, drop a square image at `assets/photo.jpg` and set `photo: "assets/photo.jpg"`.

## Hosting (₹0)

GitHub Pages hosts the site and GitHub Actions runs the fetch — both free for a public repo, with HTTPS included.

1. Create a **public** repo on GitHub (e.g. `itr-update`) and push this folder:
   ```bash
   git init && git add . && git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/<you>/itr-update.git
   git push -u origin main
   ```
2. **Settings → Actions → General → Workflow permissions** → *Read and write permissions* → Save.
3. **Settings → Pages** → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
   The site goes live at `https://<you>.github.io/itr-update/` within a minute or two.
4. **Actions → Fetch ITR stats → Run workflow** to collect the first reading now. Each scheduled run commits new data, and Pages republishes automatically.
5. Set `repo` and `siteUrl` in `assets/config.js` to the repo and site URLs.

### Optional: your own domain

Buy a domain from any registrar (a `.in` or `.com` is usually under ₹1,000 a year), then:

- In **Settings → Pages → Custom domain**, enter e.g. `itrupdate.in` and tick *Enforce HTTPS* once it's offered.
- At your registrar, add DNS records: four `A` records for the apex pointing to GitHub's Pages IPs (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`) and a `CNAME` for `www` pointing to `<you>.github.io`.

### If the scheduled fetch is blocked

GitHub's runners are outside India, and the portal may refuse them (403s or timeouts in the Action log). The site can stay on GitHub Pages; only the fetch has to move to a machine in India:

- **Your own PC, laptop or a Raspberry Pi (free):** register it as a [self-hosted runner](https://docs.github.com/actions/hosting-your-own-runners) (Settings → Actions → Runners → New runner) and change `runs-on: ubuntu-latest` to `runs-on: self-hosted` in the workflow. It only needs to be on around 8 AM / 6 PM.
- **A small cloud VM in Mumbai or Hyderabad (free tier or a few dollars a month):** run the same self-hosted runner on it, or a plain cron job that runs the script and `git push`es. Cloud IPs may still be blocked, so try the free option first.

## Field mapping

The endpoint is a plain `GET` returning flat JSON (field names confirmed from [TensorBlast/ITRStats](https://github.com/TensorBlast/ITRStats)):

| portal field | CSV column | dashboard label |
|---|---|---|
| `IndvRegUsers` | `registered_users` | Registered individual users |
| `TotalAadharLinkedPAN` | `returns_filed` | Returns filed |
| `eVerifiedReturns` | `everified_returns` | E-verified returns |
| `TotalProcessedRefund` | `processed_refunds` | Processed returns |
| `LastUpdated` | `as_of` | date the figures refer to |

The portal refreshes once a day, so both daily fetches usually return the same numbers. Deltas are computed against the last row with an earlier `as_of`, which keeps them consistent. To check what the live portal returns:

```bash
python scripts/fetch_stats.py --inspect
```

## Data columns

| column | meaning |
|---|---|
| `timestamp_ist`, `date_ist` | when the reading was taken |
| `as_of` | portal's `LastUpdated` date for these figures |
| `registered_users`, `returns_filed`, `everified_returns`, `processed_refunds` | cumulative totals |
| `*_delta` | change vs the last reading of the previous portal (`as_of`) day |

Backlog shown on the dashboard = e-verified − processed.

## Run locally

```bash
python scripts/fetch_stats.py
python -m http.server 8000   # open http://localhost:8000
```

## Notes

- The portal may block requests from outside India or from cloud IPs. If the Action fails with 403/timeouts, run the workflow on a self-hosted runner in India (`runs-on: self-hosted`) or any Indian VM with a cron.
- Counts are per assessment year, so expect a large negative delta when the portal rolls over to a new AY.
- Independent project, not affiliated with the Income Tax Department.
