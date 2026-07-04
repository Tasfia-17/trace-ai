# Trace Vision

## Product Thesis

Trace is an AI engineering desk that turns messy customer bug reports into
verified code fixes. It combines Cerebras-powered Gemma agents, multimodal
evidence, sandboxed browser reproduction, constrained patching, and verification
into one fast workflow.

The core promise:

> Customer report to reproduced bug to verified patch in under a minute.

## Hackathon Goals

- Show Cerebras speed as a user-experience advantage, not just a benchmark.
- Demonstrate meaningful collaboration across multiple specialized agents.
- Use multimodal evidence: customer text, logs, UI screenshot/state, browser
  repro screenshots, and source code.
- Prove enterprise impact for support-to-engineering workflows.
- Keep the implementation credible: no arbitrary model file writes, no hidden
  fake patching, no canned model fallbacks, and no recorded baseline numbers.

## Target Story

1. A customer reports that the checkout button disappears on mobile after using
   coupon `SAVE20`.
2. Six agents analyze the report, visual evidence, logs, repro path, code
   target, and maintainer handoff.
3. A warm sandbox reproduces the bug in an isolated mobile browser context.
4. A Patch Agent proposes the fix through the selected live provider.
5. A constrained patch engine applies only allowlisted source edits.
6. The sandbox reruns and proves the mobile checkout CTA is fixed.
7. Trace produces a PR-ready summary, diff, before/after screenshots, and reset
   path for repeated demos.

## Current Architecture

- Frontend: Next.js App Router, TypeScript, Tailwind, Lucide icons.
- Agent runtime: custom typed orchestrator with selectable Cerebras/Gemini
  providers.
- Default models: `CEREBRAS_MODEL=gemma-4-31b` and
  `GEMINI_MODEL=gemini-3-flash-preview`.
- Workflow stream: Server-Sent Events from `/api/trace/workflow/run`.
- Repro runtime: warm Playwright Chromium process with fresh isolated contexts.
- Patch runtime: allowlisted exact replacements only, with `.trace` state for
  reset.
- Failure policy: selected live provider must succeed; missing keys, invalid
  JSON, or provider errors fail the workflow.

## Completed Stages

### Stage 1: Controlled Bug App

- Built `/checkout` with deterministic `SAVE20` mobile-only bug.
- Desktop remains normal; mobile hides the checkout CTA.
- Added stable `data-testid` selectors for automation.

### Stage 2: Agent Swarm UI

- Added six visible agents: Triage, Vision, Log, Repro, Code, Maintainer.
- Added live terminal-style output per agent.
- Added a shared agent output stream.

### Stage 3: Live Cerebras Agents

- Added real Cerebras/Gemma calls through `/api/trace/run`.
- Validates model JSON with typed schemas.
- Falls back per-agent only when necessary and labels it visibly.

### Stage 4: Real Sandbox Repro

- Added `/api/trace/repro`.
- Proves desktop CTA visible and mobile CTA hidden after `SAVE20`.
- Captures mobile screenshot evidence.
- Reuses a warm Chromium process for fast isolated browser contexts.

### Stage 5: Constrained Patch + Verify

- Added Patch Agent plan route.
- Added allowlisted patch apply route.
- Added reset route for repeated recordings.
- Verifies patch with the same sandbox and shows fixed screenshot evidence.

### Stage 6: Workflow Director + GitHub Handoff

- Added dependency-aware workflow DAG.
- Added fullscreen investigation window with logs, screenshots, diff, and
  GitHub issue/PR artifacts.
- Added selectable Cerebras and Gemini 3 Flash provider modes.
- Added real GitHub issue/branch/PR handoff for `divagr18/mobile-demo`.

## Current Status

- Live Cerebras and Gemini provider paths are wired through `.env`.
- The app starts in the intentionally buggy state.
- Investigation flow is verified:
  - selected-provider agents complete
  - sandbox reproduces
  - patch is planned
  - patch is applied and verified
  - fixed screenshot appears
  - GitHub issue and PR are created or updated
- Reset restores the bug for a fresh recording.

## Remaining Work

- Record the final 60-second video.
- Add a clean side-by-side comparison board if time allows.
- Add deployment notes for the required provider and GitHub credentials.

## 60-Second Demo Script

- 0-5s: Show Trace with customer report and live mobile repro viewport.
- 5-12s: Choose Cerebras and click **Run Investigation**.
- 12-24s: Show triage, vision, and log agents running with live provider
  badges.
- 24-34s: Show sandbox repro: desktop visible, mobile hidden, screenshot proof.
- 34-46s: Show Patch Agent plan and allowlisted diff.
- 46-55s: Show fixed sandbox verification and mobile CTA visible.
- 55-60s: Show GitHub issue/PR and final line: customer report to verified
  patch.

## Demo Positioning

Trace should be presented as:

> A support-to-engineering agent system that uses Cerebras speed to collapse
> customer bug triage, reproduction, patching, and verification into one fast
> multimodal workflow.

Primary tracks:

- Multiverse Agents: six coordinated agents, multimodal evidence, visible
  collaboration.
- Enterprise Impact: customer support, QA, engineering handoff, verified fixes.
- People's Choice: strong visual story with before/after screenshots and
  obvious speed contrast.
