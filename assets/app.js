(() => {
  const METRICS = [
    { key: 'registered_users', label: 'Registered individual users', color: '--c1' },
    { key: 'returns_filed', label: 'Returns filed', color: '--c2' },
    { key: 'everified_returns', label: 'E-verified returns', color: '--c3' },
    { key: 'processed_refunds', label: 'Processed returns', color: '--c4' },
  ];
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat('en-IN');

  // 9,19,23,456 -> "9.19 crore"
  const words = (n) => {
    if (n == null) return '';
    const a = Math.abs(n);
    if (a >= 1e7) return (n / 1e7).toFixed(2) + ' crore';
    if (a >= 1e5) return (n / 1e5).toFixed(2) + ' lakh';
    return fmt.format(n);
  };
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt.format(Math.abs(n));
  const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');
  const num = (s) => (s === '' || s == null ? null : Number(s));

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const head = lines.shift().split(',');
    return lines.filter(Boolean).map((l) => {
      const cells = l.split(',');
      const o = {};
      head.forEach((h, i) => (o[h] = cells[i]));
      METRICS.forEach(({ key }) => {
        o[key] = num(o[key]);
        o[key + '_delta'] = num(o[key + '_delta']);
      });
      return o;
    });
  }

  // Portal date the figures are "as of" (older rows may lack it).
  const day = (r) => r.as_of || r.date_ist;

  // Last reading of each portal day — the series the charts use.
  const perDay = (rows) => {
    const m = new Map();
    rows.forEach((r) => m.set(day(r), r));
    return [...m.values()];
  };

  const dayLabel = (d) =>
    new Date(d + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  function renderCards(latest) {
    $('cards').innerHTML = METRICS.map(({ key, label, color }) => {
      const v = latest[key], d = latest[key + '_delta'];
      return `<article class="card" style="--c: var(${color})">
        <div class="lbl">${label}</div>
        <div class="num" title="${v == null ? '' : fmt.format(v)}">${v == null ? '—' : fmt.format(v)}</div>
        <div class="words">${words(v)}</div>
        <div class="delta ${d == null ? 'flat' : cls(d)}">${d == null ? 'No previous day yet' : signed(d) + ' since previous day'}</div>
      </article>`;
    }).join('');
  }

  function renderBacklog(days) {
    const pending = (r) =>
      r.everified_returns != null && r.processed_refunds != null ? r.everified_returns - r.processed_refunds : null;
    const last = days.at(-1), prev = days.at(-2);
    const now = pending(last);
    if (now == null) return;
    $('backlog').hidden = false;
    $('backlogNow').textContent = words(now);
    $('backlogNow').title = fmt.format(now);
    const p = prev ? pending(prev) : null;
    const el = $('backlogDelta');
    if (p == null) el.textContent = '—';
    else {
      const d = now - p;
      el.textContent = signed(d);
      // Backlog shrinking is the good direction.
      el.className = 'big ' + (d < 0 ? 'up' : d > 0 ? 'down' : 'flat');
    }
    $('processedPct').textContent =
      ((last.processed_refunds / last.everified_returns) * 100).toFixed(1) + '%';
  }

  let totalsChart, deltaChart, days = [];

  const baseOpts = () => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: css('--muted'), boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.format(c.parsed.y)}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: css('--muted'), maxTicksLimit: 8 } },
      y: { grid: { color: css('--line') }, ticks: { color: css('--muted'), callback: (v) => words(v) } },
    },
  });

  function drawTotals(range) {
    const slice = range ? days.slice(-range) : days;
    const data = {
      labels: slice.map((r) => dayLabel(day(r))),
      datasets: METRICS.map(({ key, label, color }) => ({
        label,
        data: slice.map((r) => r[key]),
        borderColor: css(color),
        backgroundColor: css(color),
        borderWidth: 2,
        pointRadius: slice.length > 40 ? 0 : 2,
        tension: 0.25,
        spanGaps: true,
      })),
    };
    if (totalsChart) { totalsChart.data = data; totalsChart.update(); return; }
    totalsChart = new Chart($('totalsChart'), { type: 'line', data, options: baseOpts() });
  }

  function drawDelta(key) {
    const m = METRICS.find((x) => x.key === key);
    const slice = days.slice(-60);
    const data = {
      labels: slice.map((r) => dayLabel(day(r))),
      datasets: [{
        label: m.label + ' — daily change',
        data: slice.map((r) => r[key + '_delta']),
        backgroundColor: css(m.color),
        borderRadius: 3,
      }],
    };
    if (deltaChart) { deltaChart.data = data; deltaChart.update(); return; }
    const o = baseOpts();
    o.plugins.legend.display = false;
    o.plugins.tooltip.callbacks.label = (c) => signed(c.parsed.y);
    deltaChart = new Chart($('deltaChart'), { type: 'bar', data, options: o });
  }

  function renderTable(rows) {
    const recent = rows.slice(-14).reverse();
    $('table').innerHTML =
      `<thead><tr><th>Fetched (IST)</th>${METRICS.map((m) => `<th>${m.label}</th>`).join('')}</tr></thead><tbody>` +
      recent.map((r) => {
        const t = new Date(r.timestamp_ist.replace(/(\d{2})(\d{2})$/, '$1:$2'));
        const when = t.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
        return `<tr><td>${when}</td>${METRICS.map(({ key }) => {
          const v = r[key], d = r[key + '_delta'];
          return `<td class="n">${v == null ? '—' : fmt.format(v)}${d == null ? '' : `<small class="${cls(d)}">${signed(d)}</small>`}</td>`;
        }).join('')}</tr>`;
      }).join('') + '</tbody>';
  }

  async function init() {
    let rows = [];
    try {
      const res = await fetch('data/stats.csv', { cache: 'no-cache' });
      rows = parseCSV(await res.text());
    } catch (e) {
      $('meta').textContent = 'Could not load data/stats.csv';
      return;
    }
    if (!rows.length) {
      $('meta').textContent = 'Waiting for first fetch';
      $('empty').hidden = false;
      document.querySelectorAll('main > .panel:not(#empty)').forEach((p) => (p.hidden = true));
      return;
    }
    days = perDay(rows);
    const latest = rows.at(-1);
    const t = new Date(latest.timestamp_ist.replace(/(\d{2})(\d{2})$/, '$1:$2'));
    $('meta').textContent = 'Last updated ' + t.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    }) + ' IST · figures as of ' + dayLabel(day(latest)) + ' · ' + days.length + ' days tracked';

    renderCards(latest);
    renderBacklog(days);
    renderTable(rows);

    drawTotals(90);
    document.querySelectorAll('.seg button').forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
        drawTotals(Number(b.dataset.range));
      })
    );

    const sel = $('deltaMetric');
    sel.innerHTML = METRICS.map((m) => `<option value="${m.key}">${m.label}</option>`).join('');
    sel.value = 'returns_filed';
    sel.addEventListener('change', () => drawDelta(sel.value));
    drawDelta(sel.value);
  }

  init();
})();
