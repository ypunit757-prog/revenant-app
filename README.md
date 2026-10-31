# Revenant: a séance for dead git repositories

Paste a repo URL. Get a coroner's report, one candle per contributor, the project's last words,
and a ghost you can question. The ghost may only say what the commits say; every claim cites a
commit hash and invented hashes are struck out. Open-weight model, zero npm dependencies.

## 1. Run it in VS Code (5 minutes)

Install: Node 18+ (https://nodejs.org), Git, and Ollama (https://ollama.com).

```bash
# unzip, then:
cd revenant-app
code .                         # opens VS Code; use Terminal > New Terminal

ollama pull gemma3:4b          # or gemma3:1b on a weak laptop
cp .env.example .env           # optional; defaults already work for local Ollama
npm start                      # Windows PowerShell: npm start (same)
```
Open http://localhost:3000, paste e.g. `https://github.com/owner/repo`, press **Dig it up**.
For live reload while editing: `npm run dev`.

No Ollama running? The app still works; the ghost just repeats commit messages (header shows "No medium connected").
To allow local folders on your own machine: `ALLOW_LOCAL=1 npm start` (macOS/Linux) or
`$env:ALLOW_LOCAL=1; npm start` (PowerShell), then paste a folder path.

## 2. Push to GitHub

```bash
git init
git add .
git commit -m "Revenant: a seance for dead repositories"
git branch -M main
git remote add origin https://github.com/YOUR_USER/revenant.git   # create the empty repo on github.com first
git push -u origin main
```

## 3. Deploy on Render

1. Sign in at https://render.com with GitHub.
2. **New +  >  Blueprint**, pick your `revenant` repo. Render reads `render.yaml` and builds the Dockerfile.
   (Or **New + > Web Service**, runtime **Docker**, plan **Free**, health check path `/api/health`.)
3. When asked for environment variables, set:
   - `LLM_BASE_URL`: an OpenAI-compatible endpoint serving an open-weight model, ending in `/v1`
   - `LLM_MODEL`: the model name on that endpoint (e.g. `gemma3:4b`)
   - `LLM_API_KEY`: only if your endpoint needs one
4. Click **Deploy**. You get `https://revenant-xxxx.onrender.com`. Test it by pasting a public repo URL.
5. Optional: Settings > Custom Domains to attach your free .tech domain.

### Important: where does the model live?
Render's free web service has no GPU and too little RAM to run Gemma. Without `LLM_BASE_URL` pointing at a
model, your deployed site works in "repeat myself" mode. Options:
- **Cheap demo:** run Ollama on your laptop and expose it with a tunnel (`cloudflared tunnel --url http://localhost:11434`),
  set `LLM_BASE_URL=https://<tunnel>/v1`. Works only while your laptop is on.
- **Always-on:** a separate paid Render private service (Docker, `ollama/ollama` image, persistent disk,
  `OLLAMA_HOST=0.0.0.0:11434`, then `ollama pull gemma3:1b` in its shell) and `LLM_BASE_URL=http://<service-name>:11434/v1`.
- **Hosted open-weight provider** of your choice with an OpenAI-compatible API.

Free web services sleep after ~15 minutes idle; the first request afterwards takes about a minute.
Do the final demo recording from your local run with Gemma for the most reliable result.

## Files
`server.js` API + git + retrieval + citation check · `public/` UI · `cli/revenant.py` terminal version ·
`Dockerfile`, `render.yaml` deploy · `POST.md` your DEV submission draft (fill the TODOs).
