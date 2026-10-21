(() => {
  const METRICS = [
    { key: 'registered_users', label: 'Registered individual users', color: '--c1' },
    { key: 'returns_filed', label: 'Returns filed', color: '--c2' },
    { key: 'everified_returns', label: 'E-verified returns', color: '--c3' },
    { key: 'processed_refunds', label: 'Processed returns', color: '--c4' },
  ];
  const DAY_MS = 864e5;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = new Intl.NumberFormat('en-IN');

  // 9,19,23,456 -> "9.19 crore"
  const words = (n) => {
    if (n == null) return '';
    const a = Math.abs(n);
    if (a >= 1e7) return (n / 1e7).toFixed(2) + ' crore';
    if (a >= 1e5) return (n / 1e5).toFixed(2) + ' lakh';
    return fmt.format(Math.round(n));
  };
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt.format(Math.abs(n));
  const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');
  const num = (s) => (s === '' || s == null ? null : Number(s));

  // ---- dates & seasons --------------------------------------------------
  const day = (r) => r.as_of || r.date_ist;                    // portal date the figures refer to
  const toDays = (d) => Date.parse(d + 'T00:00:00Z') / DAY_MS;  // date -> day number
  const fromDays = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
  const dayLabel = (d, withYear) =>
    new Date(d + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  const ayStart = (ay) => parseInt(ay, 10);
  const ayLabel = (y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  const fyOf = (ay) => ayLabel(ayStart(ay) - 1);
  // Fallback for rows without an `ay` tag: seasons open around May/June.
  const ayFromDate = (d) => ayLabel(+d.slice(5, 7) >= 6 ? +d.slice(0, 4) : +d.slice(0, 4) - 1);

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const head = lines.shift().split(',');
    return lines.filter(Boolean).map((l) => {
      const cells = l.split(',');
      const o = {};
      head.forEach((h, i) => (o[h] = cells[i] ?? ''));
      METRICS.forEach(({ key }) => {
        o[key] = num(o[key]);
        o[key + '_delta'] = num(o[key + '_delta']);
      });
      return o;
    });
  }

  // Last reading of each portal day, in date order.
  const perDay = (rows) => {
    const m = new Map();
    rows.forEach((r) => m.set(day(r), r));
    return [...m.values()].sort((a, b) => day(a).localeCompare(day(b)));
  };

  // ---- state --------------------------------------------------------------
  let SEASONS = {};       // ay -> { meta, rows (raw readings), days (one per portal day), live }
  let ORDER = [];         // ay labels, newest first
  let liveRows = [];
  let charts = {};

  async function getText(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(url + ' ' + res.status);
    return res.text();
  }

  async function load() {
    let meta = { seasons: [] };
    try { meta = JSON.parse(await getText('data/seasons.json')); } catch (e) { /* optional */ }
    liveRows = parseCSV(await getText('data/stats.csv'));

    const add = (ay) => (SEASONS[ay] ||= { ay, meta: {}, rows: [], live: false });
    (meta.seasons || []).forEach((s) => (add(s.ay).meta = s));

    // History files first, then live readings (live wins for the same portal date).
    for (const s of meta.seasons || []) {
      if (!s.history) continue;
      try {
        parseCSV(await getText('data/' + s.history)).forEach((r) => {
          r.history = true;
          add(s.ay).rows.push(r);
        });
      } catch (e) { console.warn('history not loaded', s.history); }
    }
    liveRows.forEach((r) => {
      const ay = r.ay || ayFromDate(day(r));
      const s = add(ay);
      s.live = true;
      s.rows = s.rows.filter((h) => !(h.history && day(h) === day(r)));
      s.rows.push(r);
    });

    Object.values(SEASONS).forEach((s) => {
      s.days = perDay(s.rows);
      s.opened = s.meta.filing_opened || (s.days[0] && day(s.days[0]));
    });
    ORDER = Object.keys(SEASONS).filter((ay) => SEASONS[ay].days.length).sort((a, b) => ayStart(b) - ayStart(a));
  }

  // Value of a metric at a given day-of-season, exact or interpolated between nearby readings.
  function valueAt(season, key, dos) {
    const pts = season.days
      .filter((r) => r[key] != null)
      .map((r) => ({ x: toDays(day(r)) - toDays(season.opened), y: r[key], approx: r.precision === 'approx' }));
    if (!pts.length) return null;
    const hit = pts.find((p) => Math.abs(p.x - dos) <= 1);
    if (hit) return { value: hit.y, approx: hit.approx };
    let lo = null, hi = null;
    pts.forEach((p) => {
      if (p.x < dos && (!lo || p.x > lo.x)) lo = p;
      if (p.x > dos && (!hi || p.x < hi.x)) hi = p;
    });
    if (!lo || !hi || hi.x - lo.x > 120) return null;
    return { value: lo.y + ((hi.y - lo.y) * (dos - lo.x)) / (hi.x - lo.x), approx: true };
  }

  // ---- rendering ----------------------------------------------------------
  function renderSeasonBar(current) {
    $('seasonBar').innerHTML =
      `<span class="season-lbl">Season</span>` +
      ORDER.map((ay, i) =>
        `<a href="#ay=${ay}" class="season${ay === current ? ' on' : ''}" ${ay === current ? 'aria-current="true"' : ''}>
          AY ${ay}<small>FY ${fyOf(ay)}${i === 0 ? ' · current' : ''}</small></a>`).join('');
  }

  function renderMeta(s, isLatest) {
    const latest = s.days.at(-1);
    let txt;
    if (isLatest && liveRows.length) {
      const last = liveRows.at(-1);
      const t = new Date(last.timestamp_ist.replace(/(\d{2})(\d{2})$/, '$1:$2'));
      txt = 'Last updated ' + t.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
      }) + ' IST · figures as of ' + dayLabel(day(latest));
    } else {
      txt = `AY ${s.ay} · last reading ${dayLabel(day(latest), true)}`;
    }
    const n = s.days.length;
    $('meta').textContent = txt + ` · ${n} ${s.live ? (n === 1 ? 'day' : 'days') + ' tracked' : (n === 1 ? 'reading' : 'readings')}`;
  }

  function renderNote(s) {
    const m = s.meta;
    const box = $('seasonNote');
    if (!m.note) { box.hidden = true; return; }
    box.hidden = false;
    const srcs = (m.sources || []).map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></li>`).join('');
    box.innerHTML = `<p>${esc(m.note)}</p>${srcs ? `<details><summary>Sources</summary><ul>${srcs}</ul></details>` : ''}`;
  }

  function renderCards(s, isLatest) {
    const latest = s.days.at(-1);
    $('cards').innerHTML = METRICS.map(({ key, label, color }) => {
      // Latest non-empty value of this metric in the season (history rows can be partial).
      const r = [...s.days].reverse().find((x) => x[key] != null);
      const v = r ? r[key] : null;
      const approx = r && r.precision === 'approx';
      const d = r && r === latest && s.live ? r[key + '_delta'] : null;
      let foot;
      if (d != null) foot = `<div class="delta ${cls(d)}">${signed(d)} since previous day</div>`;
      else if (isLatest && s.live) foot = `<div class="delta flat">No previous day yet</div>`;
      else foot = `<div class="delta flat">${r ? (approx ? '≈ ' : '') + 'as of ' + dayLabel(day(r), true) : 'Not reported'}</div>`;
      return `<article class="card" style="--c: var(${color})">
        <div class="lbl">${label}</div>
        <div class="num" title="${v == null ? '' : fmt.format(v)}">${v == null ? '—' : approx ? '≈' + words(v) : fmt.format(v)}</div>
        <div class="words">${approx ? 'rounded, as reported' : words(v)}</div>
        ${foot}
      </article>`;
    }).join('');
  }

  function renderBacklog(s) {
    const pending = (r) =>
      r.everified_returns != null && r.processed_refunds != null ? r.everified_returns - r.processed_refunds : null;
    const withBoth = s.days.filter((r) => pending(r) != null);
    const last = withBoth.at(-1), prev = withBoth.at(-2);
    if (!last) { $('backlog').hidden = true; return; }
    $('backlog').hidden = false;
    const now = pending(last);
    const approx = last.precision === 'approx';
    $('backlogNow').textContent = (approx ? '≈' : '') + words(now);
    $('backlogNow').title = fmt.format(now);
    $('backlogNowLbl').textContent = s === SEASONS[ORDER[0]] ? 'pending now' : 'pending on ' + dayLabel(day(last), true);
    const el = $('backlogDelta');
    el.className = 'big';
    // Only compare consecutive-ish readings; a gap of weeks isn't a "daily" change.
    if (!prev || toDays(day(last)) - toDays(day(prev)) > 3) el.textContent = '—';
    else {
      const d = now - pending(prev);
      el.textContent = signed(d);
      el.className = 'big ' + (d < 0 ? 'up' : d > 0 ? 'down' : 'flat'); // shrinking backlog is good
    }
    $('processedPct').textContent = ((last.processed_refunds / last.everified_returns) * 100).toFixed(1) + '%';
  }

  function renderCompare(s) {
    const prevAy = ayLabel(ayStart(s.ay) - 1);
    const p = SEASONS[prevAy];
    const panel = $('compare');
    if (!p || !p.days.length || !s.opened || !p.opened) { panel.hidden = true; return null; }
    const last = s.days.at(-1);
    const dos = toDays(day(last)) - toDays(s.opened);
    const keys = ['returns_filed', 'everified_returns', 'processed_refunds'];
    const items = keys.map((key) => {
      const m = METRICS.find((x) => x.key === key);
      const cur = [...s.days].reverse().find((r) => r[key] != null);
      const then = valueAt(p, key, dos);
      if (!cur || !then) return '';
      const diff = (cur[key] - then.value) / then.value;
      return `<div class="cmp">
        <div class="lbl">${m.label}</div>
        <div class="cmp-row"><span class="big">${words(cur[key])}</span><span class="cmp-pct ${cls(diff)}">${diff >= 0 ? '+' : '−'}${Math.abs(diff * 100).toFixed(1)}%</span></div>
        <div class="hint">vs ${then.approx ? '≈' : ''}${words(then.value)} at the same point of AY ${prevAy}</div>
      </div>`;
    }).join('');
    panel.hidden = false;
    $('compareHint').textContent =
      `Day ${Math.round(dos)} since filing opened (${dayLabel(s.opened, true)}), against day ${Math.round(dos)} of AY ${prevAy} (opened ${dayLabel(p.opened, true)}).` +
      (p.live ? '' : ' Last season is estimated between published readings, so treat it as indicative.');
    $('compareCards').innerHTML = items || '<p class="hint">Not enough readings from last season around this point to compare.</p>';
    return p;
  }

  // ---- charts -----------------------------------------------------------
  const baseOpts = (xTitle) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    plugins: {
      legend: { labels: { color: css('--muted'), boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: {},
    },
    scales: {
      x: { type: 'linear', grid: { display: false }, ticks: { color: css('--muted'), maxTicksLimit: 8 },
        ...(xTitle ? { title: { display: true, text: xTitle, color: css('--muted') } } : {}) },
      y: { grid: { color: css('--line') }, ticks: { color: css('--muted'), callback: (v) => words(v) } },
    },
  });

  function destroy(name) { if (charts[name]) { charts[name].destroy(); delete charts[name]; } }

  function note(canvasId, text) {
    const box = $(canvasId).parentElement;
    box.dataset.note = '1';
    box.querySelector('canvas').hidden = true;
    let p = box.querySelector('.chart-note');
    if (!p) { p = document.createElement('p'); p.className = 'chart-note'; box.appendChild(p); }
    p.textContent = text;
  }
  function clearNote(canvasId) {
    const box = $(canvasId).parentElement;
    delete box.dataset.note;
    box.querySelector('canvas').hidden = false;
    box.querySelector('.chart-note')?.remove();
  }

  function drawTotals(s, range) {
    destroy('totals');
    if (s.days.length < 2) { note('totalsChart', 'Trends appear once a second day of data is collected.'); $('rangeSeg').hidden = true; return; }
    clearNote('totalsChart');
    $('rangeSeg').hidden = !s.live;
    const lastX = toDays(day(s.days.at(-1)));
    const slice = s.live && range ? s.days.filter((r) => lastX - toDays(day(r)) < range) : s.days;
    const datasets = METRICS.map(({ key, label, color }) => ({
      label,
      data: slice.filter((r) => r[key] != null).map((r) => ({ x: toDays(day(r)), y: r[key], approx: r.precision === 'approx' })),
      borderColor: css(color),
      backgroundColor: css(color),
      borderWidth: 2,
      pointRadius: slice.length > 40 ? 0 : 3,
      pointStyle: (c) => (c.raw && c.raw.approx ? 'rectRot' : 'circle'),
      tension: 0.2,
    }));
    const o = baseOpts();
    o.scales.x.ticks.callback = (v) => dayLabel(fromDays(v));
    o.plugins.tooltip.callbacks = {
      title: (items) => dayLabel(fromDays(items[0].parsed.x), true),
      label: (c) => `${c.dataset.label}: ${c.raw.approx ? '≈' : ''}${fmt.format(c.parsed.y)}`,
    };
    charts.totals = new Chart($('totalsChart'), { type: 'line', data: { datasets }, options: o });
  }

  function drawDelta(s, key) {
    destroy('delta');
    const withDelta = s.days.filter((r) => r[key + '_delta'] != null);
    if (!withDelta.length) {
      note('deltaChart', s.live
        ? 'Daily changes appear once a second day of data is collected.'
        : 'Daily changes aren’t available for this season. It was reconstructed from occasional readings.');
      $('deltaMetric').hidden = true;
      return;
    }
    clearNote('deltaChart');
    $('deltaMetric').hidden = false;
    const m = METRICS.find((x) => x.key === key);
    const slice = withDelta.slice(-60);
    const o = baseOpts();
    o.scales.x = { grid: { display: false }, ticks: { color: css('--muted'), maxTicksLimit: 8 } };
    o.plugins.legend.display = false;
    o.plugins.tooltip.callbacks = { label: (c) => signed(c.parsed.y) };
    charts.delta = new Chart($('deltaChart'), {
      type: 'bar',
      data: {
        labels: slice.map((r) => dayLabel(day(r))),
        datasets: [{ label: m.label, data: slice.map((r) => r[key + '_delta']), backgroundColor: css(m.color), borderRadius: 3 }],
      },
      options: o,
    });
  }

  function drawCompare(s, p) {
    destroy('compare');
    if (!p) return;
    const series = (season, key, prev) => ({
      label: `${METRICS.find((m) => m.key === key).label.replace(' returns', '')} · AY ${season.ay}`,
      data: season.days.filter((r) => r[key] != null)
        .map((r) => ({ x: toDays(day(r)) - toDays(season.opened), y: r[key], approx: r.precision === 'approx' })),
      borderColor: css(key === 'returns_filed' ? '--c2' : '--c4') + (prev ? '80' : ''),
      backgroundColor: css(key === 'returns_filed' ? '--c2' : '--c4') + (prev ? '80' : ''),
      borderWidth: prev ? 1.5 : 2.5,
      borderDash: prev ? [5, 4] : [],
      pointRadius: season.days.length > 40 ? 0 : 3,
      pointStyle: (c) => (c.raw && c.raw.approx ? 'rectRot' : 'circle'),
      tension: 0.2,
    });
    const datasets = [series(s, 'returns_filed'), series(p, 'returns_filed', true), series(s, 'processed_refunds'), series(p, 'processed_refunds', true)]
      .filter((d) => d.data.length);
    const o = baseOpts('Days since filing opened');
    o.scales.x.min = 0;
    o.plugins.legend.labels.usePointStyle = false;
    o.plugins.legend.labels.boxHeight = 2;
    o.plugins.legend.labels.boxWidth = 18;
    o.plugins.tooltip.callbacks = {
      title: (items) => 'Day ' + Math.round(items[0].parsed.x),
      label: (c) => `${c.dataset.label}: ${c.raw.approx ? '≈' : ''}${words(c.parsed.y)}`,
    };
    charts.compare = new Chart($('compareChart'), { type: 'line', data: { datasets }, options: o });
  }

  function renderTable(s) {
    const recent = (s.live ? s.rows.filter((r) => !r.history) : s.days).slice(-14).reverse();
    const head = s.live ? 'Fetched (IST)' : 'As of';
    $('tableTitle').textContent = s.live ? 'Recent readings' : 'Readings';
    const dl = $('downloadCsv');
    dl.href = s.live ? 'data/stats.csv' : 'data/' + s.meta.history;
    $('table').innerHTML =
      `<thead><tr><th>${head}</th>${METRICS.map((m) => `<th>${m.label}</th>`).join('')}</tr></thead><tbody>` +
      recent.map((r) => {
        let when;
        if (r.timestamp_ist) {
          const t = new Date(r.timestamp_ist.replace(/(\d{2})(\d{2})$/, '$1:$2'));
          when = t.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
        } else when = dayLabel(day(r), true) + (r.precision === 'approx' ? ' <small class="flat">≈ reported</small>' : '');
        return `<tr><td>${when}</td>${METRICS.map(({ key }) => {
          const v = r[key], d = r[key + '_delta'];
          const shown = v == null ? '—' : r.precision === 'approx' ? '≈' + words(v) : fmt.format(v);
          return `<td class="n">${shown}${d == null ? '' : `<small class="${cls(d)}">${signed(d)}</small>`}</td>`;
        }).join('')}</tr>`;
      }).join('') + '</tbody>';
  }

  // ---- page -------------------------------------------------------------
  function selectedAy() {
    const m = location.hash.match(/ay=(\d{4}-\d{2})/);
    return m && SEASONS[m[1]] ? m[1] : ORDER[0];
  }

  function render() {
    const ay = selectedAy();
    const s = SEASONS[ay];
    const isLatest = ay === ORDER[0];
    renderSeasonBar(ay);
    renderMeta(s, isLatest);
    renderNote(s);
    renderCards(s, isLatest);
    renderBacklog(s);
    const prev = renderCompare(s);
    renderTable(s);
    drawTotals(s, Number(document.querySelector('#rangeSeg .on')?.dataset.range || 90));
    drawDelta(s, $('deltaMetric').value || 'returns_filed');
    drawCompare(s, prev);
  }

  async function init() {
    try {
      await load();
    } catch (e) {
      $('meta').textContent = 'Could not load data';
      return;
    }
    if (!ORDER.length) {
      $('meta').textContent = 'Waiting for first fetch';
      $('empty').hidden = false;
      document.querySelectorAll('main > .panel:not(#empty), #cards').forEach((p) => (p.hidden = true));
      return;
    }

    const sel = $('deltaMetric');
    sel.innerHTML = METRICS.map((m) => `<option value="${m.key}">${m.label}</option>`).join('');
    sel.value = 'returns_filed';
    sel.addEventListener('change', () => drawDelta(SEASONS[selectedAy()], sel.value));
    document.querySelectorAll('#rangeSeg button').forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('#rangeSeg button').forEach((x) => x.classList.toggle('on', x === b));
        drawTotals(SEASONS[selectedAy()], Number(b.dataset.range));
      })
    );
    window.addEventListener('hashchange', render);
    render();
  }

  init();
})();
