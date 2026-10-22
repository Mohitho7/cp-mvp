# Career Entry Strategy — Algorithm Notes (Batch 2, maintainers only)

The strategy engine separates long-term **career fit** from realistic
**career entry**. It is deterministic: same answers + same student context +
same catalog version always yields the same strategy. No LLM, database,
network, clock, or random calls exist inside `careerStrategy/`
(a unit test scans the sources for banned tokens).

## Concepts

- **Target career**: the strongest long-term direction, scored primarily by
  profile fit (`0.80 * cosine(fit, career weights) + 0.20 * (targetPotential / 5) - targetAversionPenalty`).
  Tactical stepping stones (`targetPotential < 3`) are excluded from target selection.
  An explicit coding aversion applies a proportional penalty (`0.08 * codeIntensity`) so high-code
  careers cannot override stated preferences, while demonstrated high fit preserves valid targets.
- **Best entry career**: the most realistic first-job wedge toward the
  (already fixed) target, scored over the whole catalog:
  `0.20*accessibility + 0.15*degreeAlignment + 0.20*runwayFit + 0.20*targetConnection + 0.25*fit - entryAversionPenalty`.
  Strong fit and degree alignment can make a direct entry competitive when runway preparation time is sufficient.
- **Bridge career**: an intermediate step, only when the winning wedge is
  connected via one of the target's listed `bridgeCandidates`. Otherwise null — never
  invented to fill a field.
- **Alternative route**: the next-best distinct career (not target, entry,
  or bridge). When the highest-ranked raw entry role is incompatible with the target,
  it is preserved here as a defensible alternative pathway.
- **Route type**: `DIRECT` (entry == target, direct feasibility holds), `ADJACENT` (entry is explicitly
  listed in target's `entryCandidates`), or `BRIDGE` (documented bridge candidate exists).
  An unlisted role is never labeled `ADJACENT` or `BRIDGE`.

## Catalog (`catalog.ts`, version `batch2-v3`)

15 careers with: accessibility (`VERY_LOW..VERY_HIGH`, internal heuristic —
never a hiring probability), degree affinity lists (STRONG/MODERATE/WEAK,
default NEUTRAL), `runwayHours` (preparation heuristic, not a promise),
`targetPotential` 1–5, fit weights 0–1 over 10 dimensions, and curated
`entryCandidates` / `bridgeCandidates` edges. No salaries, openings, or
market statistics are attached — the honesty-first market rules are
unchanged. Bump `CATALOG_VERSION` on any catalog change.

Phase 1 catalog refinements:
- Added `associate-product-manager` (Associate Product Manager) and
  `ai-automation-specialist` (AI Automation / No-Code Solutions Specialist).
- Removed unsupported transition assuming IT Support Specialist is an entry
  candidate or bridge candidate toward Software Engineer. QA Engineer is the
  defensible entry candidate.
- Defined defensible entry routes for:
  - Product Manager: Associate Product Manager, Business Analyst, Project Coordinator, Data Analyst.
  - Data Analyst: Business Analyst, Operations Associate.
  - Business Analyst: Operations Associate, Data Analyst, AI Automation Specialist.
  - Software Engineer: QA Engineer.
  - AI Automation Specialist: Operations Associate, QA Engineer.
- IT Support Specialist categorized under Support with HIGH accessibility.

## Fit normalization (`fitProfile.ts`)

Categorical 13Q labels map to 10 dimensions via per-question keyword
fragments (per-question because the same word means different things in
different questions). Scoring is share-based: every answered question
contributes total weight 1.0, split equally among its selected labels;
each label's share splits equally among the dimensions it matches, and
labels matching nothing dilute the shares. Each dimension score is its
accumulated share divided by the number of answered questions — the share
of the student's expressed answers pointing at that dimension (0..1).

This replaced raw matched-label counts divided by 3, which measured
selection breadth instead of preference strength: broad multi-select
responders saturated 9 of 10 dimensions while focused responders scored
lower on the same leanings. The share form keeps relative order comparable
across response styles and mirrors the archetype classifier's
per-question normalization.

q8 (drains) is excluded by design; q13 free text counts as one more
question unit (at most 1.0 total to split).

## Degree alignment (`degreeAlignment.ts`)

Free text → 7 families via ordered keyword checks (CS_IT_DATA first so
"B.Tech CSE" beats generic "B.Tech" → ENGINEERING). Unknown/blank →
OTHER, always NEUTRAL. Values: STRONG 1, MODERATE 0.75, NEUTRAL 0.5,
WEAK 0.25. Accessibility values 1–5.

## Runway (`strategy.ts`)

`weeks = runwayHours / max(1, hoursPerWeek)`; fit value 1 / 0.8 / 0.6 /
0.4 / 0.2 at ≤8 / ≤16 / ≤26 / ≤52 / beyond weeks. Low hours penalize
heavy runways but never single-handedly force the easiest career.

## Tie-breaking

Entry ranking: score desc (epsilon 1e-9), accessibility desc, alignment
desc, runway asc, career id alphabetical. Target ranking: score desc,
targetPotential desc, id alphabetical.

## Insufficient context

Empty catalog, blank degree, invalid hours, or near-zero total fit signal
(< 0.05) → `insufficientContext: true` with all strategy fields null and
explanatory rationale. Nothing is fabricated.

`graduationYear` is collected/persisted as student context but is not scored
by the Batch 2 deterministic strategy engine.

## Phase 2 — Multi-Role Ranking and Work-Lane Alignment (`ranking.ts`)

Phase 2 builds upon the deterministic career entry strategy to produce two distinct,
deterministically ranked lists and a single coherent work lane for the report:

1. **5 Long-Term Career Options**:
   - **Eligibility**: Requires `targetPotential >= 3` and `fitCosine >= 0.01`.
     Tactical stepping stones (`qa-engineer`, `it-support`, `operations-associate` with `targetPotential: 2`)
     are strictly excluded from 5-year destination rankings.
   - **Scoring**: `targetScore = 0.80 * fitCosine + 0.20 * (targetPotential / 5) - (codeAversion ? 0.08 * codeIntensity : 0)`.
   - **Tie-breaking**: `targetScore` desc (epsilon 1e-9), `targetPotential` desc, `career.id` asc.
   - **Properties**: `#1` option strictly matches `strategy.targetCareer`.

2. **5 Entry-Level Job Options**:
   - **Eligibility**: Excludes roles requiring prior professional experience or graduate research
     (`accessibility === "LOW"` or `"VERY_LOW"`: `product-manager`, `data-scientist`, `cybersecurity-analyst`).
     Excludes the target if direct runway feasibility is at the floor level (`runwayFitValue <= 0.2`).
   - **Scoring**: `0.20 * (accessibility / 5) + 0.15 * degreeAlignment + 0.20 * runwayFit + 0.20 * connection + 0.25 * fitCosine - (codeAversion ? 0.10 * codeIntensity : 0)`.
   - **Tie-breaking**: `entryScore` desc, `accessibility` desc, `alignment` desc, `runwayHours` asc, `career.id` asc.
   - **Properties**: `#1` option strictly matches `strategy.bestEntryCareer`.

3. **Phase 2.1 Quality Fixes**:
   - **Fix A (Coding Aversion)**: High-code-intensity roles are penalized in both target ranking (`0.08 * codeIntensity`) and entry ranking (`0.10 * codeIntensity`). Stated aversion cannot be overridden by generic high `targetPotential`.
   - **Fix B (Transition Validity)**: A transition is never labeled `ADJACENT` unless explicitly listed in `target.entryCandidates`, and never labeled `BRIDGE` without a documented bridge role. Incompatible independently top-ranked entry roles are preserved as `alternativeRoute` while selecting a defensible compatible entry role.
   - **Fix C (Product & Leadership Mapping)**: Assessment answers reflecting project management (`q2`), client interactions (`q4`), low-code preferences (`q5`), and strategic management (`q10`, `q13`) register meaningful `product`, `business`, and `execution` shares.
   - **Fix D (Target Scoring Calibration)**: Shifted weights to `0.80 fit + 0.20 potential` so demonstrated profile fit dominates, preventing generic high-potential careers from outranking more relevant specialist roles.
   - **Fix E (Direct-Entry Feasibility)**: Entry fit weighted at `0.25` and degree alignment at `0.15`, enabling strong technical candidates with sufficient preparation time (e.g. 20h/wk) to achieve direct entry (`software-engineer` DIRECT) without suppressing QA Engineer for constrained-runway candidates (e.g. 4h/wk).

4. **Distinctness Guarantee**:
   - Stepping stones (`qa-engineer`, `it-support`, `operations-associate`) can only appear in Entry options.
   - Senior/experience-gated roles (`product-manager`, `data-scientist`, `cybersecurity-analyst`) can only appear in Long-Term options.
   - Dual-eligible roles rank according to fundamentally different objective functions (intrinsic fit vs. fresher readiness).
   - The two lists are guaranteed not to be identical duplicates.

5. **Role Justification & Non-Forcing**:
   - `associate-product-manager` (APM): included in both long-term and entry options when product, analytical, and business signals justify it; never forced into pure technical or design profiles.
   - `ai-automation-specialist`: included when automation, execution, and technical/business signals justify it; never forced into commerce or design profiles.

6. **Recommended Work Lane Alignment**:
   - Aligns deterministically to the 7 canonical tracks (`CareerReportRecommendedTrack`):
     `"Engineering"`, `"Product"`, `"Automation"`, `"Startup Ops"`, `"Technical Business"`, `"Design / UI-UX"`, `"Hybrid Tech-Generalist"`.
   - Career macro-domains:
     - **Engineering**: `software-engineer`, `cloud-devops-engineer`, `cybersecurity-analyst`, `qa-engineer`, `it-support`, `data-scientist`
     - **Product**: `product-manager`, `associate-product-manager`
     - **Automation**: `ai-automation-specialist`
     - **Technical Business**: `business-analyst`, `data-analyst`
     - **Startup Ops**: `project-coordinator`, `operations-associate`, `digital-marketer`
     - **Design / UI-UX**: `ux-designer`
   - **Hybrid Tech-Generalist Activation**:
     - Bridges across technical and commercial domains when Target and Entry cross macro domains with balanced student signals (`(technical >= 0.15 || analytical >= 0.2) && (business >= 0.15 || product >= 0.15 || execution >= 0.2)`), or
     - When top 2 targets span different macro domains with a close score gap (`<= 0.06`), strong fit (`>= 0.4`), and multi-domain profile signals (`(technical >= 0.14 || analytical >= 0.20 || technical + analytical >= 0.22) && (business >= 0.14 || product >= 0.14 || communication >= 0.20 || people >= 0.20)`).
   - Output contains: `lane` (canonical track), `why` (deterministic justification), `primaryCareer` (primary target), and `supportingCareers` (1-3 distinct references from ranked options).

## Batch 4 — Persistence, API, and UI contract

- **Table**: `career_strategies`, one row per submission (`submissionId`
  unique, cascading delete). Normalized columns for versions, career
  id/title pairs, route type (plain text, allowlisted at the API layer),
  rationale fields, and explanation fields. Nulls stay null.
- **Versions**: `strategy_version` = `CATALOG_VERSION` (`batch2-v1`);
  `explanation_version` = `EXPLANATION_VERSION` (`batch3-v1`). Historical
  rows stay interpretable after future catalog changes.
- **Worker**: the exact strategy + explanation sent to the model are
  upserted (`onConflictDoUpdate` on submission) in the SAME transaction as
  the report insert. A report never exists without its strategy; retries
  recompute identical values, so no duplicates arise. LLM output is never
  read back into the strategy.
- **API**: `CareerSubmissionResult.strategy` (`CareerStrategy | null`,
  same ownership filter as the report — students only ever see their own).
  Legacy rows without a strategy return `strategy: null`.
- **UI**: the frontend renders API data only and never recomputes
  strategy. DIRECT merges target+entry into one card; ADJACENT and BRIDGE
  render target-first chains; insufficient/outdated rows render safe
  states with no fabricated careers. No internal scores are displayed.

## Batch 3 — Deterministic explanation layer (`explanation.ts`)

`buildStrategyExplanation({ strategy, profile, context, catalog })` turns a
`CareerStrategy` into a `CareerStrategyExplanation`
`{ target, entry, route, academic, time, bridge, alternative }` using only
real inputs: the strategy's own selections, supporting fit dimensions
(profile ≥ 1 matched label among the career's weighted dims, top 2),
catalog attributes (accessibility band, listed/category connection,
runway band, degree alignment), and available hours. No scores, salaries,
timelines, or unassessed skills appear; accessibility never justifies the
target; NEUTRAL alignment is stated honestly; bridge/alternative are null
exactly when the strategy has none; insufficient strategies yield fixed
safe text with no career titles. The worker passes the explanation as
`strategyExplanation` alongside `entryStrategy`, both declared
authoritative — the model may use them but must not replace or contradict
the strategy. Nothing here is persisted (Batch 4) or shown in UI (Batch 4).

## LLM relationship

The worker computes the strategy BEFORE the model call and injects it as
`entryStrategy` JSON plus an authoritative system instruction ("Treat
these values as authoritative. Do not replace, recalculate, or
contradict them."). The model may use it, never change it. Rationale
strings are compact deterministic metadata for the future (Batch 3)
explanation layer — not user-facing copy. Strategy is logged server-side
on generation and is never persisted (Batch 4) nor exposed to the
dashboard or other students.

## Phase 3 — Redesigned Report Contract & Ownership Boundaries

Phase 3 establishes an authoritative 8-section report contract, strictly delineating deterministic vs. model-authored fields, enforcing server-side merge protection, and preserving full backwards compatibility for historical reports.

### 1. The Eight Canonical Sections

1. **Section 1 — Your Career Profile**:
   - `profile`: Summary, strengths, risks, survival environment, worker type, clarity level.
   - `workArchetype`: Deterministic archetype classification (name, definition, strength, evidence).
2. **Section 2 — Strengths and Working Style**:
   - `traits`: Evaluated scores (1..5), label (Low/Medium/High), and evidence-based reasons across Technical, Creative, People, Risk, and Learning dimensions.
   - `answerPatterns`: Clear patterns, conflicts (tag/text pairs), and worth exploring items.
3. **Section 3 — Your Current Readiness**:
   - `caliberVsEntry`: Delineates current preparation from long-term potential (`longTermCaliber`, `marketBarrier`, `marketBarrierLevel`, `firstEntryRoles`, `bridgePath`).
4. **Section 4 — Long-Term Careers and Entry-Level Jobs**:
   - `longTermOptions` (exactly 5): Ranked long-term destinations (`id`, `title`, `category`, `rank`: 1..5, `score`, `fitScore`, `rationale`).
   - `entryOptions` (exactly 5): Ranked immediate first-job options (`id`, `title`, `category`, `rank`: 1..5, `score`, `fitScore`, `accessibility`, `alignment`, `runwayWeeks`, `rationale`).
5. **Section 5 — Career Options Compared**:
   - `careerComparison`: Distinct comparative analysis for top 3 long-term careers and top 3 entry-level jobs (6 roles total, all drawn from Section 4).
   - Each comparison entry provides: `id`, `title`, `roleInvolves`, `whyFit`, `tradeOff`, and `differentiation`.
6. **Section 6 — Your Best-Fit Work Lane**:
   - `recommendedWorkLane`: Matches deterministic `recommendedWorkLane` (`lane`, `why`, `primaryCareer`, `supportingCareers`, `entryRoute`, `explanation`).
   - `recommendedTrack`: Mirrors the recommended lane name for backwards UI compatibility.
7. **Section 7 — A Practical Year**:
   - `roadmap` (exactly 5 ordered milestones): `order` (1..5), `monthRange`, `focus`, `actions` (1..4), and `measurableOutputs` (1..4) aligned with study hours and chosen work lane.
8. **Section 8 — A Candid Mentor's Note**:
   - `mentorNote`: Exactly one evidence-based pattern (`observedPattern`), one realistic risk (`realisticRisk`), and one concrete experiment (`actionableExperiment`).

*Note on `skillsGaps`*: The old `skillsGaps` section has been completely removed from the canonical report contract.

---

### 2. Ownership Boundaries

| Report Section / Field | Authoritative Owner | Generation / Validation Boundary |
|---|---|---|
| Section 1: `workArchetype` | **Deterministic Engine** | Computed by classifier; injected server-side. |
| Section 1: `profile` | **Language Model** | Validated against schema; model summarizes answers. |
| Section 2: `traits`, `answerPatterns` | **Language Model** | Integer scores 1..5 strictly validated. |
| Section 3: `caliberVsEntry` | **Language Model** | Validated against schema; grounded in assessment answers. |
| Section 3: `careerDirection` | **Deterministic Engine** | Composed from strategy target/entry/route; injected server-side. |
| Section 4: `longTermOptions` (IDs, ranks, scores) | **Deterministic Engine** | Top 5 target roles; model cannot alter IDs, ranks, or scores. |
| Section 4: `longTermOptions.rationale` | **Model / Engine** | Model provides personalized explanation; falls back to engine rationale. |
| Section 4: `entryOptions` (IDs, ranks, scores, accessibility, runway) | **Deterministic Engine** | Top 5 entry roles; model cannot alter IDs, ranks, or scores. |
| Section 4: `entryOptions.rationale` | **Model / Engine** | Model provides personalized explanation; falls back to engine rationale. |
| Section 5: Comparison role IDs and titles | **Deterministic Engine** | Strictly locked to top 3 long-term and top 3 entry roles from Section 4. |
| Section 5: `roleInvolves`, `whyFit`, `tradeOff`, `differentiation` | **Language Model** | Model writes comparative prose across the 6 selected roles. |
| Section 6: `lane`, `primaryCareer`, `supportingCareers`, `entryRoute` | **Deterministic Engine** | Injected from deterministic career-strategy and work-lane engine. |
| Section 6: `why`, `explanation` | **Model / Engine** | Model explains connection to Sections 4/5; falls back to strategy explanation. |
| Section 7: `order`, milestone sequence | **Deterministic Engine** | Enforced 1..5 order. |
| Section 7: `focus`, `actions`, `measurableOutputs` | **Language Model** | Model generates actionable deliverables scaled to available weekly hours. |
| Section 8: `mentorNote` | **Language Model** | Model generates 1 pattern, 1 risk, 1 experiment; validated for non-empty strings. |

---

### 3. Server-Side Merge and Validation Guard

The worker does not trust prompt compliance alone:
1. The AI provider returns structured JSON conforming to `careerReportJsonSchema`.
2. The worker unwraps the payload and calls `mergeDeterministicReport(rawParsed, strategy, explanation, answers, context, catalog)`.
3. `mergeDeterministicReport` enforces that all deterministic IDs, ranks, scores, work lane attributes, comparison role sets, and milestone orders overwrite any hallucinated or altered model fields.
4. After merge, `careerReportSchema.parse(report)` strictly validates the final object. Missing required profile fields, missing mentor notes, or out-of-range trait scores immediately trigger `ZodError`, driving the worker's retry loop and failing safely without persisting invalid data.

---

### 4. Historical Report Compatibility Strategy

- **Persisted Record Safety**: Existing reports in the database are never migrated, rewritten, or deleted.
- **OpenAPI Schema Union**: `CareerSubmissionResult.report` is defined as a union: `anyOf: [CareerReport, LegacyCareerReport, type: "null"]`.
- **Runtime Discriminator**: `isNewReport(report)` checks for the presence of 5 `longTermOptions`, 5 `entryOptions`, and `mentorNote`.
- Legacy reports continue to be parsed by `legacyCareerReportSchema` and `submissionReportSchema` without throwing schema errors.

