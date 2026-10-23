# OFFLINE_DEMO.md - Sloth Scribe Offline Demo Guide

This document describes the exact manual steps to run Sloth Scribe completely offline (Wi-Fi disconnected and telemetry disabled), and what evidence to screenshot for write-ups and verification.

---

## 1. Overview and Architecture Principles

Sloth Scribe is built to operate with strict local isolation:
- All git repository scanning is performed locally via child processes (git log, git show, git ls-files).
- The fact ledger is constructed purely in TypeScript without external services.
- The drafting layer invokes a local Ollama instance (defaulting to http://localhost:11434) using local Gemma models (gemma3:4b-it-q4_K_M or gemma3:1b).
- The claim verifier evaluates rules R1-R5 purely in memory using deterministic code.
- Telemetry (Sentry Agent Tracing) is completely disabled when SENTRY_DSN is empty, resulting in zero outbound HTTP requests or socket connections.

---

## 2. Prerequisites

Before going offline, ensure the required models and packages are cached locally:

1. Ensure Ollama is installed and running locally:
   ollama --version

2. Pull the required models:
   ollama pull gemma3:4b-it-q4_K_M
   ollama pull gemma3:1b

3. Confirm the models exist in local storage:
   ollama list

4. Install Node.js dependencies:
   npm install

5. Build the deterministic fixture repository:
   npm run fixture

---

## 3. Exact Manual Steps for Offline Execution

### Step 1: Disconnect Network / Turn Wi-Fi Off
- Windows: Open Settings -> Network & Internet -> Wi-Fi -> Toggle to Off (or enable Airplane Mode).
- macOS: Click the Wi-Fi icon in the menu bar -> Turn Wi-Fi Off.
- Linux: nmcli networking off or disable the active network interface.
- Verification: Attempt to ping an external server (e.g. ping 8.8.8.8) to verify that no internet connection is active.

### Step 2: Ensure SENTRY_DSN is Empty
- Open your .env file in the repository root (or inspect .env.example).
- Ensure the SENTRY_DSN variable is empty:
  SENTRY_DSN=""
- When SENTRY_DSN is empty, the Sentry telemetry wrapper functions as a zero-overhead no-op and never attempts network transmission.

### Step 3: Run the Local CLI Pipeline
Run the full draft pipeline against the synthetic fixture repository:
```bash
npm run draft:demo
```
Expected behavior:
- The script scans fixtures/demo-repo, generates claims via localhost:11434, runs the verifier, and outputs claim statuses.
- Seeded false claims (such as the 60% build time metric and dark mode) are labeled NEEDS_INPUT.
- The run completes and writes a run record to runs/<timestamp>-<model>.json without network errors.

### Step 4: Run the Model Swap Check Offline
Execute the model swap check script:
```bash
npx tsx scripts/model-swap-check.ts
```
Expected behavior:
- Runs fixtures/demo-repo with MODEL_PRIMARY (gemma3:4b-it-q4_K_M).
- Runs fixtures/demo-repo with MODEL_FALLBACK (gemma3:1b).
- Asserts that seeded claims (60% metric, dark mode, wrong count) are strictly NEEDS_INPUT in both runs.
- Asserts that verified claims never include false claims.
- Prints an ASCII comparison table of timings and claim counts.

### Step 5: Run the Web UI Offline
Start the Next.js development server:
```bash
npm run dev
```
Open a browser to http://localhost:3000:
- Enter fixtures/demo-repo in the repository path field.
- Select the model (gemma3:4b-it-q4_K_M or gemma3:1b).
- Click "Run Pipeline".
- Inspect the interactive draft on the left and the evidence panel on the right.

### Step 6: Test Recorded Replay Offline
Open http://localhost:3000/replay:
- Verify that the permanent banner "RECORDED RUN, NOT LIVE" appears at the top.
- Verify that the recorded run from public/demo-run.json loads completely from local static storage without network access.

---

## 4. What to Screenshot

Capture the following five screenshots to document offline verification:

1. Screenshot 1 - Network Disconnected State:
   - System tray / menu bar showing Wi-Fi disabled or Airplane Mode active.
   - A terminal window running "ping 8.8.8.8" showing network destination unreachable or general failure.

2. Screenshot 2 - Offline CLI Pipeline Execution:
   - Terminal showing the output of "npm run draft:demo".
   - Highlight the verified claims (commit count, dates) with evidence locations.
   - Highlight the seeded claims (60% metric and dark mode) labeled as NEEDS_INPUT.
   - Highlight the run record path saved to runs/.

3. Screenshot 3 - Interactive Web UI with Evidence Drilldown:
   - Browser at http://localhost:3000 with the completed run.
   - Sentence chip for "60% build time" clicked, showing status "NEEDS INPUT" and reason "metric needs measured evidence" in the evidence panel.
   - Sentence chip for "dark mode" clicked, showing status "NEEDS INPUT" and reason "feature 'dark mode' unproven: README text alone does not prove a feature".

4. Screenshot 4 - Recorded Run Replay:
   - Browser at http://localhost:3000/replay.
   - Highlight the amber banner at the top displaying "RECORDED RUN, NOT LIVE".
   - Highlight the stage timings and claim chips loaded from public/demo-run.json.

5. Screenshot 5 - Model Swap Comparison Table:
   - Terminal showing the output of "npx tsx scripts/model-swap-check.ts".
   - The ASCII table displaying wall times for Scan, Ledger, Generate, Verify, and Total per model.
   - Confirmation messages that both primary and fallback runs passed seeded claim assertions.
