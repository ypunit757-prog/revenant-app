---
title: Revenant: I held a séance for a dead repo, and it can't lie
published: false
tags: devchallenge, hf26challenge
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 4: Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26)*

## What I Built

Every dead repository is a small grave with a very good diary. Revenant is a command-line séance for git repos. It does three things:

- `autopsy`: a coroner's report. Born, last breath, longest sleep, how many TODOs were left in the bones, and a cause of death (*bus factor of one*, *abandoned by its only keeper*).
- `ask`: you question the repo and it answers in first person, as the ghost.
- `ofrenda`: a self-contained page for Día de los Muertos. One flickering candle per contributor, sized by how much they gave, then the project's last words and an epitaph.

The twist is the rule of the dead: **the ghost may only say what the record says.** Each claim must carry a commit hash. Revenant then checks every citation against the evidence it retrieved and strikes out any hash that was invented. A ghost story where the ghost can't make things up.

It ships as a zero-dependency Node web app (paste a repo URL, get the report, candles and séance in the browser) plus the original Python CLI in `cli/`.

## Demo

<!-- TODO: paste a terminal recording / screenshots of `ask` and the ofrenda page, run on a real abandoned repo you picked -->

## Code

<!-- TODO: {% embed https://github.com/YOU/revenant %} -->

## How I Built It

- **Open-weight model, local inference:** Gemma through Ollama. The server talks to any OpenAI-compatible endpoint (`LLM_BASE_URL`), so swapping models or hosts is one environment variable. No SDKs.
- **Web app:** plain Node `http` server and vanilla JS, no framework and no npm dependencies. Commit text is rendered with `textContent` only, so hostile commit messages can't inject HTML.
- **Retrieval:** BM25 over commit subjects, written in about 12 lines of stdlib Python. No vector DB and no embeddings download, so it runs on a plane.
- **Grounding:** the system prompt forces `[hash]` citations and the exact refusal "The record is silent." A post-pass (`seal()`) strikes unverified hashes and reports citation integrity per answer.
- **Graceful death:** if no model is reachable, the ghost still speaks, but can only repeat its own commit messages. I liked that failure mode more than an error.
- **The ofrenda:** one HTML file, system fonts only, `prefers-reduced-motion` respected, so it still opens in ten years.

## Why Does Open Innovation Matter?

A repo's history is often the only surviving memory of what its people were thinking. Sending that to a closed API for "resurrection" means the memorial depends on someone else's servers, terms and pricing. Here the model sits on your disk, the page is one file, and the whole thing works with the lights and the internet off. I could also set the temperature, swap models in one environment variable, and enforce the citation rule in my own post-pass. That is what makes a ghost trustworthy rather than merely spooky.

## The Spirit of It

<!-- TODO: after running it on a repo that mattered to you, write the moment it landed: the commit message that stopped you cold. Real, not invented. -->

## Prize Categories

<!-- List ONLY what you truly did before publishing:
- Best Use of Gemma (runs Gemma locally via Ollama)
- Best Use of a .tech Domain (only if you host the ofrenda there and claimed the domain)
- Best Use of Entire / DevRelay session (only if you embed your session)
- Best Use of GitHub Copilot (only if you used it)
-->
