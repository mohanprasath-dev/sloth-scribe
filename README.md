# Sloth Scribe

Local evidence-constrained write-up compiler. Reads a git repo into a deterministic fact ledger, a local Gemma model phrases claims citing fact IDs, and pure code verifier blocks anything unsupported as NEEDS INPUT. Runs 100% offline.

Started Oct 23, 2026 (Week 3 window Oct 19-25) for the DEV Hacktoberfest Open-Source AI Challenge, Week 3: Slow and Steady.

---

## What It Is

Sloth Scribe is a local tool that turns git history into reliable release notes and write-ups without hallucinated facts.

1. Scans a local git repository (commits, diffstat, README, package.json).
2. Builds a deterministic fact ledger where every fact has an ID, value, source, and exact evidence location (commit hash, file and line range).
3. Prompts a local Gemma model via Ollama to draft sentences as structured claims citing fact IDs.
4. Pure deterministic TypeScript verifies every claim against the ledger and labels each sentence: VERIFIED, INTERPRETATION, or NEEDS INPUT.
5. Unsupported claims are refused, never guessed.

---

## The Wedge

The model proposes, the code decides.

Existing AI write-up tools let LLMs freely declare what was built, leading to plausible-sounding false metrics, phantom features, and inaccurate dates. Sloth Scribe locks the evidence boundary:
- Gemma may phrase claims, but it cannot create facts.
- Every non-interpretation claim must cite specific fact IDs from the ledger.
- Deterministic code evaluates the claims against the ledger: verified, interpretation, or needs_input.
- Seeded false metrics (e.g. unmeasured "60% build speedup") and phantom features (e.g. uncommitted "dark mode") are blocked as NEEDS INPUT with transparent reasons.

---

## Quickstart

### Prerequisites
- Ollama 0.6 or later installed locally.
- Node.js 18+ and npm.

```bash
# 1. Pull the local Gemma models
ollama pull gemma3:4b-it-q4_K_M
ollama pull gemma3:1b

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env

# 4. Build the deterministic fixture repository
npm run fixture

# 5. Start the web UI
npm run dev
```

Open http://localhost:3000 to run the compiler interactively.

### Additional Commands
- `npm run verify:demo`: Runs the verifier against the hand-written test draft without invoking any LLM.
- `npm run draft:demo`: Runs the full pipeline end-to-end on the fixture using local Gemma.
- `npx tsx scripts/model-swap-check.ts`: Runs the pipeline with primary (4B) and fallback (1B) models and verifies that seeded false claims remain NEEDS_INPUT in both runs.
- `npm run save-replay`: Records a live run to public/demo-run.json for replay.
- `npm run ascii-check`: Enforces strict ASCII-only character encoding across all source code, docs, and configurations.
- `npm run test`: Runs the test suite via vitest.
- `npm run lint`: Runs ESLint checks.

---

## Verifier Rules Summary (v1)

- R1 NUMERIC AND DATE EQUALITY: Every numeral or date in a claim must match the value of a cited fact. Mismatches become NEEDS INPUT (e.g. contradicted).
- R2 COUNT SUPPORT: Commit counts, changed-file counts, and line counts must come from git facts, never README text.
- R3 NAMED FEATURE OR PACKAGE: Backticked identifiers, paths, package names, and named features must exist in dependencies, files, scripts, or commit subjects. README text alone does not prove a feature.
- R4 METRIC REFUSAL: Any percentage, speedup factor, latency, or build-time claim requires measured evidence from a benchmark results file. README assertions never count.
- R5 NO CITATION, NO CLAIM: Non-interpretation claims with empty or unknown fact IDs become NEEDS INPUT.
- INTERPRETATION: Subjective statements are allowed only if the text contains no numerals, dates, paths, or identifiers. Otherwise, they are downgraded to NEEDS INPUT.

---

## Privacy Notes

- Repo contents, commit messages, file paths, diffs, prompts, and model outputs never leave the local machine.
- Exactly what leaves the process: nothing, except optional Sentry counts and timings when SENTRY_DSN is configured.
- When SENTRY_DSN is empty (the default in .env.example), telemetry is a complete no-op and zero network calls are made.
- When enabled, exactly 5 performance spans are emitted (`sloth_scribe.scan`, `sloth_scribe.ledger`, `sloth_scribe.generate`, `sloth_scribe.verify`, `sloth_scribe.export`).
- AI input and output capture is explicitly disabled (`dataCollection.genAI.inputs = false` and `dataCollection.genAI.outputs = false`) in compliance with Sentry Node Agent Tracing standards.

---

## Measured Results

All values in this table are measured directly from runs/*.json recorded on the demo fixture repository:

| Model | Generate time | Claims | Verified | Interpretation | Needs input |
|---|---|---|---|---|---|
| gemma3:4b-it-q4_K_M | 11161ms | 12 | 3 | 0 | 9 |
| gemma3:1b | 60656ms | 12 | 1 | 0 | 11 |

- Source run 4B: runs/2026-10-23T11-40-34.317Z-gemma3-4b-it-q4_K_M.json
- Source run 1B: runs/2026-10-23T11-41-35.073Z-gemma3-1b.json
- Peak VRAM, 4B run: 5066 MiB (NVIDIA GeForce RTX 4050 Laptop GPU 6GB)

---

## Known Limitations

- Verifier covers numbers, dates, counts, and named features only; adjectives and causality are interpretation.
- The hosted page is a recorded run, not a live generator, because hosted environments cannot execute local Ollama instances.
- The demo repository (tinytasks) is synthetic, and its commit dates and author details are deterministic test data.

---

## Documentation

- docs/OFFLINE_DEMO.md: Step-by-step manual instructions for running completely offline without Wi-Fi, and screenshot instructions.
- AGENT.md: Operational guidelines and hard constraints.
- PRD.md: Product requirements, schema specifications, and verifier rules.
- phases.json: Phased execution plan.

---

## License

MIT
