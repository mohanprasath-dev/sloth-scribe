# PRD - Sloth Scribe

Started Oct 23, 2026 for DEV Hacktoberfest Open-Source AI Challenge Week 3 (Slow and Steady).
Internal submit target: Oct 25, 2026, 11 PM IST. Official deadline: Oct 25, 11:59 PM PDT.

## 1. Problem
People postpone write-ups (release notes, project posts, hackathon submissions) because rebuilding "what did I actually build" from git history is tedious.
AI write-up tools exist, but they let the model state facts. Those facts can be wrong, and nobody can see which sentences are safe.

## 2. Wedge (the only thing that matters)
Sloth Scribe is an evidence-constrained write-up compiler.
- Gemma may phrase claims. It cannot create them.
- Every claim cites ledger fact ids.
- Deterministic code verifies each claim and labels it: verified, interpretation, or needs_input.
- Unsupported claims are refused, not guessed.
Do NOT position this as "an AI that turns git history into a blog post". That space is occupied.

## 3. Scope
IN SCOPE (v1):
- Input: a local git repo path (commits, diffstat, README, package.json, optional bench/results.json).
- Fact ledger JSON with evidence locations.
- Verifier rules R1-R5 (section 6).
- Gemma draft layer returning claims JSON (structured output).
- UI: draft with per-sentence status chips and an evidence panel. Recorded-run replay page.
- 5 Sentry spans with AI input/output capture disabled.
- Fixture repo generator with seeded false claims.
- Offline run and 4B -> 1B model swap, with measured timings stored in runs/.

OUT OF SCOPE (do not build, do not suggest mid-phase):
- Trace file ingestion, GitHub API or remote repos, auth, accounts, database.
- Mastra, agent frameworks, tool-calling loops.
- Verifying adjectives, comparisons, or causal claims (these are only allowed as interpretation, without numbers).
- Multi-repo support, PDF export, editing UI, streaming.

## 4. Fixture ground truth (synthetic repo "tinytasks")
scripts/make-fixture.sh builds fixtures/demo-repo with a fixed author, fixed GIT_AUTHOR_DATE and GIT_COMMITTER_DATE per commit, so output is byte-reproducible.
- Exactly 14 commits, dates 2026-03-02 through 2026-03-13 (synthetic, say so in the README).
- Files: README.md, package.json (name "tinytasks", dependencies "commander" and "zod"), src/cli.js, src/store.js, src/export.js, src/format.js, tests/store.test.js, tests/export.test.js.
- Feature "CSV export" is really implemented (src/export.js, introduced in commit 9, subject mentions CSV export).
- README.md contains the line: "Cuts build time by 60% compared to the old pipeline." No benchmark file exists anywhere. SEEDED FALSE METRIC (must be NEEDS_INPUT).
- README.md also lists "dark mode" as a feature. No code or commit implements it. SEEDED PHANTOM FEATURE (must be NEEDS_INPUT).
- No bench/results.json in the fixture.
After building, a human confirms the counts and records them in fixtures/expected.json (committed). Tests read expected.json, never magic numbers.

## 5. Schemas

Fact (ledger entry):
{ "id": "F007", "type": "commit_total", "value": 14, "source": "git log", "evidence_location": "git:log" }

Fact types: repo_name, commit_total, first_commit_date, last_commit_date, commit (hash, subject, date), diffstat (commit hash, files_changed, insertions, deletions), file (path, line_count), dependency (name, version, location), script (name, command), readme_line (text, line number), measurement (only when a bench results file exists).

evidence_location formats: "git:log", "commit:<short hash>", "file:<path>:<start>-<end>", "readme:<line>".
Ids are stable for identical input (sorted deterministically).

Claim (Gemma output, after parsing):
{ "claim_id": "c3", "text": "...", "type": "count|date|feature|dependency|metric|interpretation", "fact_ids": ["F007"] }

Verified claim (verifier output):
{ "claim_id": "c3", "text": "...", "type": "...", "fact_ids": ["F007"], "status": "verified|interpretation|needs_input", "reason": "...", "evidence": [ { "fact_id": "F007", "location": "git:log" } ] }

Draft JSON from Gemma: { "paragraphs": [ { "claims": [ ...claims ] } ] }. Max 12 claims. Temperature 0.2.

## 6. Verifier rules (v1, pure code, no model)
R1 NUMERIC AND DATE EQUALITY: every numeral or date in a claim must equal the value of a cited fact (after normalizing formats). Any mismatch -> needs_input, reason "contradicted by Fxxx (value N)" or "number not in cited facts".
R2 COUNT SUPPORT: commit counts, changed-file counts, line counts must equal ledger values computed from git, not README text.
R3 NAMED FEATURE OR PACKAGE: a backticked identifier, file path, package name, or named feature must exist in dependencies, file paths, scripts, or commit subjects. README text alone does not prove a feature. Unproven -> needs_input.
R4 METRIC REFUSAL: any percentage, "x faster", latency, or build-time claim requires a measurement fact from a results file. README assertions never count. Otherwise needs_input, reason "metric needs measured evidence".
R5 NO CITATION, NO CLAIM: a non-interpretation claim with empty or unknown fact_ids -> needs_input.
INTERPRETATION: allowed only if the text contains no numerals, dates, paths, or identifiers. Otherwise it is downgraded to needs_input.
Verdicts are deterministic: same ledger plus same claims always gives the same result. Unit-test every rule with a passing and a failing case.

## 7. UI
Single page at "/":
- Inputs: repo path (default fixtures/demo-repo), model select (primary or fallback), Run button.
- Left: draft text. Each sentence is a chip with a text label (VERIFIED, INTERPRETATION, NEEDS INPUT), not color alone.
- Right: evidence panel for the selected sentence: fact ids, values, evidence locations (commit hash, file path with line range), and the reason for NEEDS INPUT.
- Top bar: counts of each status, model used, whether fallback was used, durations per stage.
- Export Markdown: verified and interpretation sentences as text, each needs_input sentence replaced by "[NEEDS INPUT: reason]".
- Page "/replay": renders public/demo-run.json (a recorded real run), with a visible banner "Recorded run, not live".
ASCII-only copy. No decorative animation. Keyboard accessible.

## 8. Telemetry (Sentry Agent Tracing)
Exactly five spans per run: sloth_scribe.scan, sloth_scribe.ledger, sloth_scribe.generate, sloth_scribe.verify, sloth_scribe.export.
Allowed span data: stage name, duration, model tag, counts (facts, claims, per-status), error flag.
Forbidden: repo text, commit subjects, ledger values, prompts, model output.
AI input/output capture must be turned off using the exact option named in the Sentry Node agent tracing docs (read the docs, do not guess). Telemetry is skipped entirely when SENTRY_DSN is empty.
A test with a fake transport asserts no ledger text or claim text appears in captured envelopes.

## 9. Measurements (only measured numbers may appear in the post)
runs/<timestamp>-<model>.json stores: model tag, fallback used, wall time per stage, Ollama eval counts and durations from the response, claim status counts.
VRAM is sampled by the owner with nvidia-smi during a run; the owner records it. Never estimate.

## 10. Demo script (what the post and video show)
1. Run on fixtures/demo-repo with the primary model. Show the draft: most sentences verified with commit hashes and file lines.
2. Show the README line "Cuts build time by 60%" appear as a claim and get blocked as NEEDS INPUT, with the reason.
3. Show the phantom "dark mode" claim blocked the same way.
4. Turn the network off (Wi-Fi off, Sentry DSN empty). Run again. It still works.
5. Switch MODEL_PRIMARY to the 1B fallback. Prose differs; the verdicts for the seeded claims are unchanged.
6. Run on a second, unrelated real repo (owner picks one) to show it is not tied to the fixture.

## 11. Acceptance tests (must pass at the end)
- npm run test, lint, ascii-check all clean.
- Ledger on the fixture matches fixtures/expected.json.
- Verifier: seeded metric -> needs_input; phantom dark mode -> needs_input; a wrong commit count (13) -> needs_input with "contradicted"; correct count (14) -> verified with evidence_location "git:log"; CSV export -> verified with src/export.js evidence.
- Same seeded verdicts with primary and fallback models.
- Telemetry test: no repo or claim text in captured envelopes.
- Fresh clone test: clone the repo to a new folder, npm install, npm run fixture, npm run dev works. (Do not trust the agent. The owner runs this.)

## 12. Known risks
- Gemma 4B may emit malformed JSON: use the schema, retry once, then fall back.
- Context size: only a compact ledger goes to the model, hard capped at 12000 characters.
- A hosted site cannot run Ollama. The public .tech page is the /replay recorded run, clearly labeled.
