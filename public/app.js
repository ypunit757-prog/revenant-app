(() => {
const $ = id => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); kids.forEach(k => n.append(k)); return n; };
let state = null;   // { id, name, base, report }

const setStatus = (msg, err) => { const s = $('status'); s.textContent = msg; s.className = err ? 'err' : ''; };
const api = async (path, data) => {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'The séance failed.');
  return j;
};
const typewrite = async (node, text) => {
  if (reduce) { node.textContent = text; return; }
  node.textContent = '';
  for (const ch of text) { node.textContent += ch; await new Promise(r => setTimeout(r, 14)); }
};

// medium status
fetch('/api/health').then(r => r.json()).then(h => {
  const m = $('medium');
  m.className = 'medium ' + (h.medium ? 'up' : 'down');
  m.textContent = h.medium ? `Medium connected: ${h.model}` : 'No medium connected. The ghost can only repeat its own commit messages.';
}).catch(() => {});

// dig
$('dig').addEventListener('submit', async e => {
  e.preventDefault();
  $('digBtn').disabled = true; $('grave').hidden = true;
  setStatus('Digging… cloning the history, this can take up to a minute.');
  try {
    state = await api('/api/exhume', { source: $('src').value });
    renderGrave(state); setStatus('');
    $('grave').hidden = false; $('grave').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    $('epitaph').textContent = 'The candle gutters…';
    const a = await api('/api/ask', { id: state.id, question: 'In three sentences, say who you were, what you tried to be, and why you went quiet.' });
    await typewrite($('epitaph'), a.text.replace(/\s*\[[0-9a-f]{7,}\]/g, ''));
  } catch (err) { setStatus(err.message, true); $('epitaph').textContent = $('epitaph').textContent === 'The candle gutters…' ? '' : $('epitaph').textContent; }
  finally { $('digBtn').disabled = false; }
});

function renderGrave({ name, report: r }) {
  $('name').textContent = name;
  $('dates').textContent = `${r.born} – ${r.lastBreath}`;
  const stats = [['Cause of death', r.cause], ['Heartbeats', `${r.commits} commits`], ['Silent for', `${r.silentDays} days`], ['Longest sleep', `${r.longestSleep} days`]];
  $('stats').replaceChildren(...stats.map(([k, v]) => el('div', {}, el('dt', { textContent: k }), el('dd', { textContent: v }))));
  const mx = r.keepers[0][1];
  $('candles').replaceChildren(...r.keepers.map(([who, n], i) => {
    const li = el('li', {}, el('b'), el('i', { textContent: who }), el('small', { textContent: n }));
    li.style.setProperty('--h', `${28 + 72 * n / mx}px`); li.style.setProperty('--d', `${(i * .37).toFixed(2)}s`); return li;
  }));
  $('words').replaceChildren(...r.lastWords.map(c => el('li', {}, el('q', { textContent: c.subject }),
    el('small', { textContent: `${c.author}, ${c.when.slice(0, 10)}` }))));
  $('suggest').replaceChildren(...['Why did you go quiet?', 'What were you most proud of?', 'What did you struggle with?', 'Who mattered most to you?']
    .map(q => el('button', { type: 'button', textContent: q, onclick: () => { $('q').value = q; $('askForm').requestSubmit(); } })));
  $('answer').textContent = ''; $('trust').textContent = '';
}

// ask
$('askForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!state) return;
  $('askBtn').disabled = true; $('trust').textContent = ''; $('answer').textContent = 'The candle gutters…';
  try {
    const a = await api('/api/ask', { id: state.id, question: $('q').value });
    renderAnswer(a);
  } catch (err) { $('answer').textContent = err.message; }
  finally { $('askBtn').disabled = false; }
});

function renderAnswer(a) {
  const box = $('answer'), good = new Set(a.cited.filter(h => !a.bad.includes(h)));
  const chip = h => good.has(h) && !state.base
    ? el('span', { className: 'bad', style: 'color:var(--teal);border:1px solid var(--teal);text-decoration:none', textContent: h })
    : good.has(h)
    ? el('a', { href: state.base + h, target: '_blank', rel: 'noopener', textContent: h, title: 'Open this commit' })
    : el('span', { className: 'bad', textContent: 'unverified', title: 'The ghost cited a commit that is not in the record' });
  box.replaceChildren();
  a.text.split(/(\[[0-9a-f]{7,}\])/).forEach(part => {
    const m = part.match(/^\[([0-9a-f]{7,})\]$/);
    box.append(m ? chip(m[1]) : part);
  });
  if (!a.medium) a.evidence.forEach(c => box.append(el('span', { className: 'echo' }, chip(c.h), ' ' + c.subject)));
  $('trust').textContent = a.medium
    ? `Grounded in ${a.evidence.length} commits · citation integrity ${Math.round(a.trust * 100)}%${a.bad.length ? ` · ${a.bad.length} invented citation struck out` : ''}`
    : 'No model answered. These are the repository’s own words.';
}

// save ofrenda as a standalone page
$('save').addEventListener('click', async () => {
  if (!state) return;
  const css = await (await fetch('/style.css')).text();
  const art = $('ofrenda').cloneNode(true);
  const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Ofrenda · ${state.name.replace(/[<&]/g, '')}</title><style>${css}</style><div class="flags"></div><main>${art.outerHTML}` +
    `<footer class="site">Laid with Revenant. Spoken only from the commit record.</footer></main>`;
  const a = el('a', { href: URL.createObjectURL(new Blob([page], { type: 'text/html' })), download: `ofrenda-${state.name.replace(/\W+/g, '-')}.html` });
  a.click(); URL.revokeObjectURL(a.href);
});
})();
