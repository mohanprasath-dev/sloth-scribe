# POST_BRIEF - DEV post for Week 3 (Slow and Steady)

The post is drafted with Claude in chat, not in Antigravity. Writing quality is weighted most heavily by the judges.

## Rules
- ASCII only. No em dashes, no curly quotes.
- First person. Tone: a senior engineer defending an intentional design, not a launch announcement.
- Claim only measured numbers. Every number must come from runs/*.json or a stopwatch the owner ran. Gaps stay as [NEEDS INPUT: ...] until filled.
- Do not claim to be the first git-to-write-up tool. State the narrower claim: the model cannot create facts, and unsupported claims are refused.
- Do not overstate privacy. Closed APIs have retention controls too. The honest advantages are offline operation, zero per-request cost, swappable models, and a transparent verifier boundary.
- No named reviewers. Credit teammates by DEV handle only if any exist (none expected, solo).
- Tags: devchallenge, hf26challenge. Title must be specific.
- One submission per challenge. Must be a new project built Oct 19-25.

## Lead with the blocked claim
Open the post with the moment the tool refused to publish "Cuts build time by 60%". Everything else explains why that refusal matters.

## Structure (maps to the DEV submission template)

### Title
[NEEDS INPUT: title that names the verifier idea, not "AI write-up generator"]

### What I Built
- One paragraph: local write-up compiler, Gemma phrases claims, code decides which are supported.
- The effort it saves: reconstructing what you built from git history.
- Who gets lazier: maintainers and hackathon builders who postpone write-ups.

### Demo
- Link to the .tech replay page, labeled as a recorded run.
- Short video or GIF: [NEEDS INPUT: demo capture, offline and model swap included].
- Screenshot: draft with chips, evidence panel open on the blocked 60% claim.

### Code
- Embed the GitHub repo: mohanprasath-dev/sloth-scribe.

### How I Built It
- Architecture in 5 lines: scan, ledger, generate, verify, export.
- Fact ledger and evidence locations (commit hash, file and line range).
- Verifier rules R1-R5 in plain words, one example each.
- Gemma via Ollama with structured output; claims reference ledger fact ids; model has no verdict power.
- Honest limits: covers numbers, dates, counts, named features; adjectives and causality are interpretation only.

### Why Does Open Innovation Matter?
Specific points, each tied to something the demo shows:
1. It ran with the network off. [NEEDS INPUT: confirm from offline demo]
2. Swapping 4B for 1B changed the prose but not the verdicts on the seeded claims. [NEEDS INPUT: measured from model-swap-check]
3. No per-request cost after the model download.
4. The verifier is plain code anyone can read; the model is replaceable.
Counterargument to address in one short paragraph: a closed API with a privacy setting can write fine prose. The answer is not "open is private". It is that the evidence boundary lives in code you control, runs offline, and works with whichever model you swap in.

### My Agent Session (optional)
- [NEEDS INPUT: DevRelay session link or skip]

### The Lazy Payoff
- Minutes to write a project post by hand for the fixture: [NEEDS INPUT: stopwatch]
- Minutes to run Sloth Scribe and review the draft: [NEEDS INPUT: stopwatch]
- Draft generation time, 4B vs 1B: [NEEDS INPUT: from runs/*.json]
- Peak VRAM during the 4B run: [NEEDS INPUT: nvidia-smi sample]
- Second real repo tested: [NEEDS INPUT: which repo, result]
If not measured, remove the row. Do not estimate.

### Prize Categories
- Best Use of Gemma
- Best Use of Sentry Agent Tracing (five spans, AI payload capture disabled)
- Best Use of a .tech Domain (replay page live on the domain)
Only list a category if it is genuinely used and visible in the post.

## Final checklist before publishing
- [ ] Every [NEEDS INPUT] resolved or removed
- [ ] ASCII check passes on the post text
- [ ] Every number traceable to runs/*.json or a stopwatch
- [ ] Replay page loads on a phone and shows the "Recorded run" banner
- [ ] Repo README states "Started Oct 23, 2026 (Week 3 window Oct 19-25)"
- [ ] Fresh clone test passed
- [ ] Tags set, post published before Oct 25, 11 PM IST
