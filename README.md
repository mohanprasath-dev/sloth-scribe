# Sloth Scribe

Local write-up compiler. Reads a git repo into a fact ledger, a local Gemma model phrases claims by ID, and a code verifier blocks anything unsupported as NEEDS INPUT. Runs offline.

Started Oct 23, 2026 (Week 3 window Oct 19-25) for the DEV Hacktoberfest Open-Source AI Challenge, Week 3: Slow and Steady.

## What it does
1. Scans a local git repo (commits, diffstat, README, package.json).
2. Builds a deterministic fact ledger. Every fact has an id, a value, a source, and an evidence location (commit hash, file and line range).
3. Gemma drafts claims that cite fact ids. It cannot create facts and has no verdict power.
4. Plain code verifies each claim and labels it VERIFIED, INTERPRETATION, or NEEDS INPUT.
5. Unsupported claims are refused, not guessed.

Git-to-write-up tools already exist. The difference here is the evidence boundary: the model proposes, the code decides.

## Quickstart
```bash
ollama pull gemma3:4b-it-q4_K_M
ollama pull gemma3:1b
npm install
cp .env.example .env
npm run fixture       # builds the synthetic demo repo
npm run verify:demo   # verifier only, no model
npm run draft:demo    # full pipeline with Gemma
npm run dev           # UI at http://localhost:3000
```
Requires Ollama 0.6 or later.

### Environment and Telemetry Setup
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
- By default, `SENTRY_DSN` is empty. When empty, telemetry functions are no-ops and zero network calls are made.
- To enable agent tracing, set `SENTRY_DSN` in `.env` to your Sentry project DSN (never commit real DSN keys).
- AI input and output capture is turned off per official Sentry Node Agent Tracing docs (`dataCollection.genAI.inputs = false` and `dataCollection.genAI.outputs = false`).
- Exactly five spans are recorded per run (`sloth_scribe.scan`, `sloth_scribe.ledger`, `sloth_scribe.generate`, `sloth_scribe.verify`, `sloth_scribe.export`).
- Only counts, durations, and model tags are sent. Repo text, commit subjects, ledger values, prompts, and model output are never transmitted.

## Verifier rules (v1)
- R1 Numbers and dates must equal a cited fact.
- R2 Counts come from git, not README text.
- R3 Named features and packages must exist in dependencies, files, scripts, or commit subjects.
- R4 Metrics (percent, speedups, build time) need a measurement file. README assertions never count.
- R5 No citation, no claim.
Interpretations are allowed only when they contain no numbers, dates, paths, or identifiers.

## Privacy
Repo contents, prompts, and model output stay on your machine. The only optional outbound traffic is Sentry spans with counts and timings, and it is disabled when SENTRY_DSN is empty. AI input and output capture is turned off.

## Measured results
Only measured values appear here. Source: runs/*.json.

| Model | Generate time | Claims | Verified | Interpretation | Needs input |
|---|---|---|---|---|---|
| gemma3:4b-it-q4_K_M | [NEEDS INPUT] | [NEEDS INPUT] | [NEEDS INPUT] | [NEEDS INPUT] | [NEEDS INPUT] |
| gemma3:1b | [NEEDS INPUT] | [NEEDS INPUT] | [NEEDS INPUT] | [NEEDS INPUT] | [NEEDS INPUT] |

Peak VRAM, 4B run: [NEEDS INPUT: nvidia-smi sample]

## Known limitations
- The verifier covers numbers, dates, counts, and named features. Adjectives and causal statements are interpretation only.
- The hosted page is a recorded run, not a live demo. A hosted page cannot run Ollama.
- The demo repo (tinytasks) is synthetic and its commit dates are fixed test data.

## Project docs
AGENT.md (agent rules), PRD.md (requirements and schemas), phases.json (build prompts), docs/POST_BRIEF.md (post rules).

## License
MIT
