// Revenant server: zero npm dependencies. Node >= 18.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { execFile } = require('child_process');

const PORT = process.env.PORT || 3000;
const LLM_BASE = (process.env.LLM_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'gemma3:4b';
const LLM_KEY = process.env.LLM_API_KEY || '';
const ALLOW_LOCAL = process.env.ALLOW_LOCAL === '1';
const URL_RE = /^https:\/\/(github\.com|gitlab\.com|codeberg\.org)\/[\w.-]+\/[\w.-]+?(\.git)?\/?$/;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// ---------- git ----------
const git = (args, opts = {}) => new Promise((res, rej) =>
  execFile('git', args, { maxBuffer: 64e6, timeout: 90000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, ...opts },
    (e, out, err) => e ? rej(new Error((err || e.message).trim().split('\n')[0])) : res(out)));

async function exhume(source) {
  let gitArgs, tmp = null, base = null;
  if (URL_RE.test(source)) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-'));
    const url = source.replace(/\/$/, '').replace(/\.git$/, '');
    await git(['clone', '--bare', '--filter=blob:none', '--single-branch', '--no-tags', url + '.git', tmp]);
    gitArgs = ['--git-dir', tmp];
    base = url + (url.includes('gitlab.com') ? '/-/commit/' : '/commit/');
  } else if (ALLOW_LOCAL && fs.existsSync(source)) {
    gitArgs = ['-C', source];
  } else {
    throw new Error('Paste an https URL from github.com, gitlab.com or codeberg.org.');
  }
  try {
    const out = await git([...gitArgs, 'log', '--reverse', '--no-merges', '--max-count=20000', '--pretty=format:%h%x1f%an%x1f%aI%x1f%s']);
    const commits = out.split('\n').filter(Boolean).map(l => { const [h, author, when, subject] = l.split('\x1f'); return { h, author, when, subject }; });
    if (!commits.length) throw new Error('This repository has never lived.');
    return { commits, base };
  } finally { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); }
}

function autopsy(commits) {
  const first = commits[0], last = commits.at(-1), t = c => Date.parse(c.when);
  const silentDays = Math.floor((Date.now() - t(last)) / 864e5);
  const authors = {}; commits.forEach(c => authors[c.author] = (authors[c.author] || 0) + 1);
  const ranked = Object.entries(authors).sort((a, b) => b[1] - a[1]);
  let longest = 0; for (let i = 1; i < commits.length; i++) longest = Math.max(longest, Math.floor((t(commits[i]) - t(commits[i - 1])) / 864e5));
  const share = ranked[0][1] / commits.length;
  const cause = silentDays < 90 ? 'Still breathing'
    : ranked.length === 1 ? 'Abandoned by its only keeper'
    : share > .8 ? 'Bus factor of one'
    : 'A thousand maintainers, each with other priorities';
  return { born: first.when.slice(0, 10), lastBreath: last.when.slice(0, 10), silentDays, commits: commits.length,
    longestSleep: longest, cause, keepers: ranked.slice(0, 12), lastWords: commits.slice(-5).reverse() };
}

// ---------- retrieval (BM25 over commit subjects) ----------
const tok = s => (s.toLowerCase().match(/[a-z0-9_]+/g) || []);
function recall(commits, q, k = 12) {
  const docs = commits.map(c => tok(`${c.subject} ${c.author} ${c.when.slice(0, 4)}`));
  const avg = docs.reduce((a, d) => a + d.length, 0) / docs.length || 1;
  const df = {}; docs.forEach(d => new Set(d).forEach(w => df[w] = (df[w] || 0) + 1));
  const qt = tok(q);
  const score = d => { const tf = {}; d.forEach(w => tf[w] = (tf[w] || 0) + 1);
    return qt.reduce((s, w) => !tf[w] ? s : s + Math.log(1 + (docs.length - df[w] + .5) / (df[w] + .5)) * tf[w] * 2.2 / (tf[w] + 1.2 * (.25 + .75 * d.length / avg)), 0); };
  const ranked = commits.map((c, i) => [c, score(docs[i])]).sort((a, b) => b[1] - a[1]);
  const hits = ranked.slice(0, k).filter(p => p[1] > 0).map(p => p[0]);
  return hits.length ? hits : commits.slice(-k);
}

// ---------- the medium (any OpenAI-compatible open-weight endpoint) ----------
const RULES = "You are the ghost of a software project, speaking from beyond its last commit. Speak in first person, quiet and a little wry. " +
  "You may ONLY state things supported by the EVIDENCE (commit records). After every factual claim cite the commit like [a1b2c3d]. " +
  "If the evidence does not say, answer exactly: 'The record is silent.' Never invent names, dates or reasons. Maximum 120 words.";

async function channel(user) {
  try {
    const r = await fetch(`${LLM_BASE}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(120000),
      headers: { 'Content-Type': 'application/json', ...(LLM_KEY && { Authorization: `Bearer ${LLM_KEY}` }) },
      body: JSON.stringify({ model: LLM_MODEL, temperature: 0.4, messages: [{ role: 'system', content: RULES }, { role: 'user', content: user }] })
    });
    if (!r.ok) return null;
    return (await r.json()).choices[0].message.content.trim();
  } catch { return null; }
}
async function mediumUp() {
  try { return (await fetch(`${LLM_BASE}/models`, { signal: AbortSignal.timeout(3000), headers: LLM_KEY ? { Authorization: `Bearer ${LLM_KEY}` } : {} })).ok; }
  catch { return false; }
}

async function speak(commits, question) {
  const hits = recall(commits, question);
  const evidence = hits.map(c => `[${c.h}] ${c.when.slice(0, 10)} ${c.author}: ${c.subject}`).join('\n');
  const reply = await channel(`EVIDENCE:\n${evidence}\n\nQUESTION: ${question}`);
  if (reply === null) return { medium: false, text: 'The lights are out and no medium answers. All I can do is repeat myself.',
    evidence: hits.slice(0, 5), cited: hits.slice(0, 5).map(c => c.h), bad: [], trust: 1 };
  const real = new Set(hits.map(c => c.h));
  const cited = [...reply.matchAll(/\[([0-9a-f]{7,})\]/g)].map(m => m[1]);
  const bad = cited.filter(h => !real.has(h));
  return { medium: true, text: reply, evidence: hits, cited, bad, trust: cited.length ? (cited.length - bad.length) / cited.length : 0 };
}

// ---------- http ----------
const cache = new Map();           // id -> { commits, base, name, ts }
const hitsByIp = new Map();
const limited = ip => { const now = Date.now(), a = (hitsByIp.get(ip) || []).filter(t => now - t < 6e4); a.push(now); hitsByIp.set(ip, a); return a.length > 20; };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((res, rej) => { let b = ''; req.on('data', d => { b += d; if (b.length > 1e4) { req.destroy(); rej(new Error('too large')); } }); req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch { rej(new Error('bad json')); } }); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, medium: await mediumUp(), model: LLM_MODEL });
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      if (limited(ip)) return send(res, 429, { error: 'The dead need rest. Try again in a minute.' });
      const b = await body(req);
      if (url.pathname === '/api/exhume') {
        const source = String(b.source || '').trim();
        const { commits, base } = await exhume(source);
        const id = crypto.randomBytes(8).toString('hex');
        if (cache.size >= 20) cache.delete(cache.keys().next().value);
        const name = source.replace(/\/$/, '').replace(/\.git$/, '').split('/').slice(-2).join('/');
        cache.set(id, { commits, base });
        return send(res, 200, { id, name, base, report: autopsy(commits) });
      }
      if (url.pathname === '/api/ask') {
        const entry = cache.get(b.id);
        if (!entry) return send(res, 410, { error: 'This grave has been closed. Dig it up again.' });
        const q = String(b.question || '').slice(0, 300).trim();
        if (!q) return send(res, 400, { error: 'Ask something.' });
        return send(res, 200, await speak(entry.commits, q));
      }
      return send(res, 404, { error: 'No such door.' });
    }
    // static
    let p = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!p.startsWith(PUBLIC) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  } catch (e) { send(res, 400, { error: e.message }); }
}).listen(PORT, '0.0.0.0', () => console.log(`Revenant listening on :${PORT}  (model ${LLM_MODEL} @ ${LLM_BASE})`));
