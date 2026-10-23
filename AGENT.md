# AGENT.md - Sloth Scribe

You are building Sloth Scribe, a local evidence-constrained write-up compiler.
Read PRD.md before any task. Execute ONLY the phase id you are given from phases.json. Stop after it.

## One-line product
A local Gemma model phrases claims about a git repo. It cannot create facts.
Deterministic code checks every claim against a fact ledger. Anything unsupported becomes NEEDS INPUT.

## Hard rules (never break)
1. SCOPE LOCK: build only what PRD.md lists under IN SCOPE. If a task seems to need something under OUT OF SCOPE, stop and ask.
2. ONE PHASE PER RUN: do not start the next phase, do not refactor earlier phases unless the phase says so.
3. NO SELF-REPORTS: finish every phase by running each command in that phase's "verify" list and pasting the raw output. "Build passes" is not evidence. If a command was not run, write NOT RUN. Never write "done" without output.
4. ASCII ONLY: all code strings, UI text, docs, comments, and commit messages. No em dashes, no curly quotes, no special arrows. Use "->" and "-".
5. NO INVENTED FACTS: never put a number, date, percentage, or claim into UI copy, README, fixtures, or docs unless the ledger produced it or it was measured and stored in runs/. Gaps are written as [NEEDS INPUT: what is missing].
6. THE MODEL NEVER CREATES FACTS: LLM output is claims that cite ledger fact ids. All verdicts are computed by code. No LLM call inside the verifier. No network call inside the verifier.
7. PRIVACY: repo contents, prompts, and model outputs must never go to Sentry or any remote host. Allowed network: OLLAMA_HOST (default localhost) and Sentry telemetry (spans with counts and timings only; fully disabled when SENTRY_DSN is empty).
8. DEPENDENCIES: only next, react, react-dom, typescript, tailwindcss, vitest, zod, @sentry/node (or the Sentry SDK the Sentry agent-tracing docs require; confirm from docs, do not guess), tsx, eslint. Ask before adding anything else.
9. NEVER COMMIT: .env, fixtures/demo-repo/, runs/ (except public/demo-run.json).
10. GIT: small commits, message format "phaseN: short summary". Do not rewrite history. Do not backdate commits.
11. FAILURE PROTOCOL: if a verify command fails twice, stop and report the exact error. Never weaken, skip, or delete a test to make it pass.

## Stack
Next.js (App Router) + TypeScript + Tailwind. Framework-agnostic core in src/core (ledger, verifier, draft, telemetry) so the same code runs from the CLI and from API routes.
Local model via Ollama HTTP API (structured output with a JSON schema).
Models: primary MODEL_PRIMARY (gemma3:4b-it-q4_K_M), fallback MODEL_FALLBACK (gemma3:1b). Never hardcode tags outside config.

## Commands (create these in P0, keep them working)
- npm run dev
- npm run lint
- npm run test
- npm run ascii-check      (fails on any non-ASCII byte in src, app, scripts, docs, README.md, AGENT.md, PRD.md)
- npm run fixture          (builds fixtures/demo-repo deterministically)
- npm run ledger -- <repo path>
- npm run verify:demo      (verifier on the hand-written draft, no model)
- npm run draft:demo       (full pipeline on the fixture with Gemma)

## Model policy for Antigravity
Gemini Flash by default. Escalate to Claude Sonnet after one failed loop. P2 (verifier) is correctness-critical: start on Sonnet.

## Definition of done for any phase
All verify commands run with raw output pasted, npm run ascii-check clean, npm run lint clean, tests green, one commit made.

## Kill gate (owner decision, not yours)
Two hours after repo creation, npm run verify:demo must print evidence-linked verdicts including the seeded false metric as NEEDS_INPUT. If it cannot, report that plainly. Do not pivot to a generic generator.
