#!/usr/bin/env python3
"""revenant — hold a séance with any git repository. Offline. Open-weight. Stdlib only.

  python revenant.py autopsy  PATH            # coroner's report
  python revenant.py ask      PATH "question" # the dead answer, with receipts
  python revenant.py ofrenda  PATH [-o out.html]  # candle-lit memorial page

The ghost may only say what the commit record says. Every claim must cite a commit
hash; hashes that are not in the evidence are struck from the reply (the dead cannot lie).
Model: any Ollama model (default gemma3:4b, override with REVENANT_MODEL). No model? The
ghost still speaks, but can only repeat its own words.
"""
import argparse, collections, datetime as dt, html, json, math, os, re, subprocess, sys, time, urllib.request

MODEL = os.environ.get("REVENANT_MODEL", "gemma3:4b")
HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
D, B, Y, R, X = "\033[2m", "\033[1m", "\033[33m", "\033[31m", "\033[0m"
FX = True

def say(text, delay=0.012):
    for ch in text:
        sys.stdout.write(ch); sys.stdout.flush()
        if FX and sys.stdout.isatty(): time.sleep(delay)
    print()

# ---------- the record ----------
Commit = collections.namedtuple("Commit", "h author when subject")

def exhume(path):
    out = subprocess.run(["git", "-C", path, "log", "--reverse", "--no-merges",
        "--pretty=format:%h%x1f%an%x1f%aI%x1f%s"], capture_output=True, text=True)
    if out.returncode: sys.exit(f"{R}not a grave I can open:{X} {out.stderr.strip()}")
    cs = []
    for line in out.stdout.splitlines():
        h, a, w, s = line.split("\x1f", 3)
        cs.append(Commit(h, a, dt.datetime.fromisoformat(w), s))
    if not cs: sys.exit("The repository has never lived.")
    return cs

def autopsy(path, cs):
    first, last = cs[0], cs[-1]
    now = dt.datetime.now(last.when.tzinfo)
    silent = (now - last.when).days
    authors = collections.Counter(c.author for c in cs)
    gaps = [(b.when - a.when).days for a, b in zip(cs, cs[1:])]
    todo = subprocess.run(["git", "-C", path, "grep", "-I", "-c", "-E", "TODO|FIXME|HACK"],
                          capture_output=True, text=True).stdout.split()
    todos = sum(int(l.rsplit(":", 1)[1]) for l in todo if ":" in l)
    top_share = authors.most_common(1)[0][1] / len(cs)
    cause = ("still breathing" if silent < 90 else
             "abandoned by its only keeper" if len(authors) == 1 else
             "bus factor of one" if top_share > .8 else "died of a thousand maintainers' other priorities")
    return dict(born=first.when.date(), last_breath=last.when.date(), silent_days=silent,
                commits=len(cs), authors=authors, longest_sleep=max(gaps, default=0),
                todos=todos, cause=cause, last_words=[c for c in cs[-5:]][::-1])

# ---------- retrieval: BM25 over commit subjects ----------
tok = lambda s: re.findall(r"[a-z0-9_]+", s.lower())

def recall(cs, q, k=12):
    docs = [tok(f"{c.subject} {c.author} {c.when.year} {c.when:%B}") for c in cs]
    avg = sum(map(len, docs)) / len(docs)
    df = collections.Counter(t for d in docs for t in set(d))
    def score(d):
        tf = collections.Counter(d)
        return sum(math.log(1 + (len(docs) - df[t] + .5) / (df[t] + .5)) * tf[t] * 2.2 /
                   (tf[t] + 1.2 * (.25 + .75 * len(d) / avg)) for t in tok(q) if t in tf)
    ranked = sorted(zip(cs, docs), key=lambda p: -score(p[1]))
    hits = [c for c, d in ranked[:k] if score(d) > 0]
    return hits or cs[-k:]   # no match: the last words are all it has

# ---------- the medium (a local open-weight model) ----------
def channel(system, user):
    body = json.dumps({"model": MODEL, "stream": False, "options": {"temperature": .4},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}).encode()
    try:
        r = urllib.request.urlopen(urllib.request.Request(f"{HOST}/api/chat", body,
            {"Content-Type": "application/json"}), timeout=180)
        return json.load(r)["message"]["content"].strip()
    except Exception:
        return None

RULES = ("You are the ghost of a software project, speaking from beyond its last commit. "
         "Speak in first person, quiet and a little wry. You may ONLY state things supported by the "
         "EVIDENCE (commit records). After every factual claim cite the commit like [a1b2c3d]. "
         "If the evidence does not say, answer exactly: 'The record is silent.' Never invent names, "
         "dates or reasons. Maximum 120 words.")

def evidence_block(hits):
    return "\n".join(f"[{c.h}] {c.when:%Y-%m-%d} {c.author}: {c.subject}" for c in hits)

def seal(reply, hits):
    """The dead cannot lie: strike citations that are not in the evidence."""
    real = {c.h for c in hits}
    cited = re.findall(r"\[([0-9a-f]{7,})\]", reply)
    bad = [h for h in cited if h not in real]
    for h in bad: reply = reply.replace(f"[{h}]", f"{R}[unverified]{X}")
    trust = (len(cited) - len(bad)) / len(cited) if cited else 0.0
    return reply, trust

def speak(cs, question):
    hits = recall(cs, question)
    reply = channel(RULES, f"EVIDENCE:\n{evidence_block(hits)}\n\nQUESTION: {question}")
    if reply is None:   # no medium available: the ghost can only repeat itself
        lines = [f"[{c.h}] {c.subject}" for c in hits[:5]]
        return ("The lights are out and no medium answers. All I can do is repeat myself:\n  "
                + "\n  ".join(lines)), 1.0, hits
    reply, trust = seal(reply, hits)
    return reply, trust, hits

# ---------- commands ----------
def cmd_autopsy(path):
    a = autopsy(path, exhume(path))
    say(f"{B}CORONER'S REPORT{X}  {os.path.basename(os.path.abspath(path))}")
    print(f"  born          {a['born']}\n  last breath   {a['last_breath']}  ({a['silent_days']} days ago)")
    print(f"  heartbeats    {a['commits']} commits, longest sleep {a['longest_sleep']} days")
    print(f"  unfinished    {a['todos']} TODO/FIXME/HACK left in the bones")
    print(f"  cause         {Y}{a['cause']}{X}\n  mourners      " +
          ", ".join(f"{n} ({c})" for n, c in a["authors"].most_common(5)))
    say(f"\n{D}last words:{X}")
    for c in a["last_words"]: say(f'  “{c.subject}”  {D}— {c.author}, {c.when:%Y-%m-%d} [{c.h}]{X}')

def cmd_ask(path, q):
    cs = exhume(path)
    say(f"{D}…the candle gutters…{X}", .03)
    reply, trust, hits = speak(cs, q)
    say(reply, .02)
    print(f"\n{D}grounded in {len(hits)} commits · citation integrity {trust:.0%} · model {MODEL}{X}")

def cmd_ofrenda(path, out):
    cs = exhume(path); a = autopsy(path, cs)
    name = html.escape(os.path.basename(os.path.abspath(path)))
    epitaph, _, _ = speak(cs, "In three sentences, say who you were, what you tried to be, and why you went quiet.")
    epitaph = html.escape(re.sub(r"\x1b\[[0-9;]*m", "", epitaph))
    top = a["authors"].most_common(12); mx = top[0][1]
    candles = "".join(f'<li style="--h:{28 + 72 * n / mx:.0f}px;--d:{i * .37:.2f}s"><b></b><i>{html.escape(who)}</i>'
                      f'<small>{n}</small></li>' for i, (who, n) in enumerate(top))
    words = "".join(f'<li><q>{html.escape(c.subject)}</q><small>{html.escape(c.author)}, {c.when:%d %b %Y}</small></li>'
                    for c in a["last_words"])
    page = f"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Ofrenda · {name}</title><style>
:root{{--ink:#15112b;--wax:#f3e8cf;--gold:#f0a30a;--rose:#c2306f;--smoke:#8d86a8}}
*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(ellipse at 50% 0,#2b2050,var(--ink) 60%);color:var(--wax);
font:19px/1.6 Georgia,'Palatino Linotype',serif;padding:0 20px 80px}}
main{{max-width:44rem;margin:auto}}
h1{{font-weight:400;font-size:clamp(2.4rem,9vw,4.6rem);margin:12vh 0 .2em;letter-spacing:.01em;color:var(--gold)}}
.dates{{color:var(--smoke);font-style:italic;margin:0 0 2.5rem}}
.epitaph{{border-left:3px solid var(--rose);padding:.2em 0 .2em 1.2rem;font-size:1.25rem;white-space:pre-wrap}}
h2{{font-weight:400;color:var(--gold);margin:4rem 0 1rem;font-size:1.3rem}}
.candles{{list-style:none;display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap;padding:0;min-height:170px}}
.candles li{{width:56px;text-align:center;position:relative;padding-top:34px}}
.candles li:before{{content:"";display:block;height:var(--h);background:linear-gradient(90deg,#d9c9a3,var(--wax),#cdbb92);border-radius:3px 3px 0 0;margin-top:0}}
.candles b{{position:absolute;top:0;left:50%;width:14px;height:26px;margin-left:-7px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;
background:radial-gradient(circle at 50% 70%,#fff6c8,var(--gold) 55%,transparent 72%);animation:f 1.6s var(--d) infinite alternate ease-in-out;
filter:drop-shadow(0 0 10px var(--gold))}}
.candles i{{display:block;font-size:.72rem;line-height:1.2;color:var(--smoke);margin-top:.5rem;word-break:break-word}}
.candles small{{color:var(--gold)}}
@keyframes f{{from{{transform:scale(1,.92) translateX(-1px)}}to{{transform:scale(.94,1.06) translateX(1px)}}}}
@media(prefers-reduced-motion:reduce){{.candles b{{animation:none}}}}
.words{{list-style:none;padding:0}}.words li{{margin:0 0 1.2rem}}.words q{{display:block;font-size:1.15rem}}
small{{color:var(--smoke)}}footer{{margin-top:5rem;color:var(--smoke);font-size:.85rem}}
</style><main>
<h1>{name}</h1>
<p class=dates>{a['born']} – {a['last_breath']} · {a['commits']} commits · {html.escape(a['cause'])}</p>
<p class=epitaph>{epitaph}</p>
<h2>One candle for each who kept it alive</h2><ul class=candles>{candles}</ul>
<h2>Last words</h2><ul class=words>{words}</ul>
<footer>Spoken only from the commit record, by {html.escape(MODEL)}, running on the keeper’s own machine. {a['todos']} things were left unfinished.</footer>
</main>"""
    open(out, "w", encoding="utf-8").write(page)
    say(f"An ofrenda has been laid at {out}")

if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("cmd", choices=["autopsy", "ask", "ofrenda"]); p.add_argument("path")
    p.add_argument("question", nargs="?"); p.add_argument("-o", default="ofrenda.html")
    p.add_argument("--no-fx", action="store_true")
    a = p.parse_args(); FX = not a.no_fx
    if a.cmd == "autopsy": cmd_autopsy(a.path)
    elif a.cmd == "ask": cmd_ask(a.path, a.question or sys.exit("ask what?"))
    else: cmd_ofrenda(a.path, a.o)
