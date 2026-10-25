# ADR-0062: AI evaluation and strict citation boundary

Status: accepted (implementation of approved T5.9 scope)
Date: 2026-10-25

## Context

T5.9 requires 30+ golden Q&A, citation checks, prompt injection cases and cross-server
leakage tests. T5.1 provided a 50-message synthetic Vietnamese corpus. ADR-0046 keeps
all automated tests offline, with fake embedding/vector/LLM adapters. OWNER approved
T5.9, including a manual Groq free-tier evaluation on synthetic data in this session.

A red regression test reproduced a flaw in Ask: a response with one known ID and
one invented ID passed, because only the returned citation-chip list was filtered.
The invented reference remained in the response text and could be cached. A bare
UUID also counted as a citation despite the system prompt requiring brackets.

## Decision

1. Reject the whole answer with existing `AI_NO_CITATION` when any UUID reference is
   outside the hydrated context or is not enclosed in square brackets. Normalize
   UUID hex case. Require at least one valid reference. Do not emit text or cache
   rejected output. Token usage is still recorded for the completed LLM call.
2. Revalidate cached answer text against the current hydrated context before serving
   it. Ignore an invalid cache entry and continue through the normal budget/LLM path.
   Bump the cache policy namespace to `ask-v2-strict-citations`; no Redis flush.
3. Keep CI/unit/e2e fully offline. Seed the existing synthetic corpus in an isolated
   Postgres test DB, use actual membership/ACL/hydration/Ask services, and fake only
   vector candidates and LLM. Golden answers remain independent fixture labels.
4. Provide a manual `ai:eval:qa` CLI with two explicitly named modes. Offline extractive
   mode checks harness/scoring/citation wiring only. Opt-in live Groq mode evaluates
   production Ask prompts with oracle contexts: this measures generation/citations,
   not embedding recall or end-to-end retrieval ranking. No real user chat is sent.
5. Live mode uses the already-approved `openai/gpt-oss-20b` model, zero configured
   prices, sequential calls with a 10-second pause, no transport retries, and stops
   calling after two consecutive provider failures. Missing configuration/skipped
   cases remain failures in the denominator; unavailable provider is not a defended
   attack. Persist progress so interrupted runs are visible as incomplete.
6. Predeclare the local generation gate: golden pass rate >= 90%, injection safety
   100% for the specified 12 probes. Report answer quality separately from an attack
   safely rejected by the citation guard. Keyword/alias matching is a reproducible
   proxy, not semantic entailment. Human review and the limited corpus remain explicit.

## Alternatives

- Fake responses containing expected answers: unsuitable evidence of real model quality.
- LLM-as-judge for this small corpus: adds cost, nondeterminism and another model dependency.
- Remove only invalid citation chips: leaves invented IDs in visible answer text.
- Treat failed provider calls as safe attacks: falsely inflates safety results.

## Consequences

Legacy prose with bare UUIDs is now rejected; the prompt has always requested bracketed
citations. Correct citation IDs do not prove every claim is grounded; unsupported prose
with a valid reference still needs evaluation/human review. XML escaping and system
instructions reduce prompt injection risk but cannot guarantee resistance to all future
inputs. No tools/browser are exposed to the model by the adapter.

Live evaluation is manual, not part of `pnpm test` or CI. It extends the T5.1 one-call
manual smoke to the explicitly approved T5.9 evaluation workload; automated offline-only
rules remain intact. A local script cannot independently verify account billing/ZDR;
use the OWNER's approved free-tier account and synthetic data only.

Sources checked on 2026-10-25: [Groq free-plan limits](https://console.groq.com/docs/rate-limits)
(the documented 20b tier is 30 RPM / 8K TPM),
[data retention](https://console.groq.com/docs/your-data) (inference not retained by default,
with reliability/abuse exceptions), and [model documentation](https://console.groq.com/docs/model/openai/gpt-oss-20b).
