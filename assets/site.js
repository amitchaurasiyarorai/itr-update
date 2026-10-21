// Shared header nav + footer credit, filled from assets/config.js.
(() => {
  const S = window.SITE || {};
  const L = S.links || {};
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isPlaceholder = (u) => !u || /YOUR-PROFILE/.test(u);

  const ICONS = {
    linkedin: '<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.06c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.77 2.65 4.77 6.1V21h-4v-5.2c0-1.24-.02-2.84-1.73-2.84-1.73 0-2 1.35-2 2.75V21h-4z"/>',
    github: '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/>',
    email: '<path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L4.4 7H4v.6l8 5.4 8-5.4V7h-.4z"/>',
    x: '<path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78zm-1.08 16.17h1.7L7.4 4.74H5.58z"/>',
    website: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.6 15.6 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.93 8zM12 4.04A13.8 13.8 0 0 1 13.91 8h-3.82A13.8 13.8 0 0 1 12 4.04zM4.26 14a8.2 8.2 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4zm.81 2h2.95c.32 1.25.78 2.45 1.38 3.56A8 8 0 0 1 5.07 16zM8.02 8H5.07a8 8 0 0 1 4.33-3.56A15.6 15.6 0 0 0 8.02 8zM12 19.96A13.8 13.8 0 0 1 10.09 16h3.82A13.8 13.8 0 0 1 12 19.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.26 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.2 8.2 0 0 1 0 4z"/>',
  };
  const LABELS = { linkedin: 'LinkedIn', github: 'GitHub', email: 'Email', x: 'X', website: 'Website' };

  window.siteLinks = (cls = 'social') =>
    Object.keys(LABELS)
      .filter((k) => L[k] && !(k === 'linkedin' && isPlaceholder(L[k])))
      .map((k) => {
        const href = k === 'email' ? 'mailto:' + L[k] : L[k];
        return `<a class="${cls}" href="${esc(href)}" ${k === 'email' ? '' : 'target="_blank" rel="noopener me"'} aria-label="${LABELS[k]}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">${ICONS[k]}</svg><span>${LABELS[k]}</span></a>`;
      })
      .join('');

  const page = document.body.dataset.page;
  const nav = document.getElementById('nav');
  if (nav) {
    nav.innerHTML = [['index.html', 'Dashboard', 'dashboard'], ['about.html', 'About', 'about']]
      .map(([h, t, p]) => `<a href="${h}"${p === page ? ' aria-current="page"' : ''}>${t}</a>`)
      .join('');
  }

  const credit = document.getElementById('credit');
  if (credit && S.name) {
    const li = !isPlaceholder(L.linkedin)
      ? ` · <a href="${esc(L.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : '';
    const repo = S.repo ? ` · <a href="${esc(S.repo)}" target="_blank" rel="noopener">Source &amp; data</a>` : '';
    credit.innerHTML = `Built by <a href="about.html">${esc(S.name)}</a>${li}${repo}`;
  }
})();
