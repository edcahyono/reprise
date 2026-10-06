# A verified instrument importer: Brown et al. annuity valuation

Reprise reconstructs any uploaded paper with the model-driven pipeline. A *verified instrument importer* is an optional shortcut for a questionnaire whose branching tables have been checked by hand, so the adaptive ladder runs exactly as published instead of being re-derived each time. This file documents the one importer that ships today. Nothing outside `lib/brown-annuity.ts` knows about this study: the audit, the runner, persona generation, and the result views are paper-agnostic.

Source: *Cognitive Constraints on Valuing Annuities*, Online Appendix B, A-31-A-60. The importer verifies that the uploaded appendix contains all three amount matrices before creating a runnable protocol.

## Condition matrix

| Version | Wave 1 | Wave 2 |
| --- | --- | --- |
| A | CV-Sell for $100, $500, full monthly benefit, and one eligible random increment | CV-Buy, EV-Sell, EV-Buy in one of six randomized orders; CV-Sell without political risk |
| B | CV-Buy, EV-Sell, EV-Buy in one of six randomized orders | CV-Sell for $100, $500, full monthly benefit, and one eligible random increment; CV-Sell without political risk |

The $500 increment is omitted when monthly benefits are below $600. The random increment is omitted when benefits are below $300. Every CV-Sell $100 path asks five adaptive choices; other valuation paths ask four. Offered amounts follow the three 16-by-5 matrices in Appendix B. A participant's prior choice updates `ROW` by `2^(4-j)` when option 1 is selected. The importer assigns the starting matrix, answer display order, and increment order independently for each synthetic participant.

## Input and output fields

The instrument needs each respondent's monthly Social Security benefit, benefit status, current age, claiming age, and marital status. The paper does not publish those individual records, so the importer declares them as persona attributes and every synthetic respondent draws its own at random: the benefit uniformly over $400-$3,200, current age over 50-75, claiming age over the statutory 62-70 window, and status and marital state with equal weight. A drawn claiming age is never earlier than the drawn current age. Only the number of personas is configurable in the interface. Each saved choice records the condition, wave, offered lump sum, benefit increment, starting-value group, displayed prompt and options, selected option, and timestamp. The results panel calculates median elicited amounts from the recorded choice bounds. It does not attempt to match published estimates.

## Deviation log

- The original study used respondents' own benefit estimates, with a demographic default in specified cases. Reprise draws a benefit and profile at random for each synthetic participant, within plausible ranges. These are not observed values and the whole sample no longer shares one hand-entered scenario.
- The published experiment used two survey waves roughly two weeks apart. The run screen offers a 14-day wait; an AI pilot may run both waves in one session.
- The executable importer covers the valuation choices and the no-political-risk manipulation. Appendix B also contains eligibility, background, financial-literacy, and follow-up questions. Those pages remain available as uploaded source material; they are not participant decisions in this AI run.
- AI choices are simulated and cannot be interpreted as observations from the original RAND American Life Panel respondents.

## Published values

The importer builds the instrument, not the paper's results. Published values are matched to each calculated measure by the `extract_benchmarks` pass, which reads the article's own result tables and requires an exact quote containing the number. A measure with no quotable published value is shown as an AI result only; nothing is estimated or converted to fill the column.
