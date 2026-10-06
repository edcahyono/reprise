# Brown et al. annuity valuation instrument in Reprise

Source: *Cognitive Constraints on Valuing Annuities*, Online Appendix B, A-31–A-60. The importer verifies that the uploaded appendix contains all three amount matrices before creating a runnable protocol.

## Condition matrix

| Version | Wave 1 | Wave 2 |
| --- | --- | --- |
| A | CV-Sell for $100, $500, full monthly benefit, and one eligible random increment | CV-Buy, EV-Sell, EV-Buy in one of six randomized orders; CV-Sell without political risk |
| B | CV-Buy, EV-Sell, EV-Buy in one of six randomized orders | CV-Sell for $100, $500, full monthly benefit, and one eligible random increment; CV-Sell without political risk |

The $500 increment is omitted when monthly benefits are below $600. The random increment is omitted when benefits are below $300. Every CV-Sell $100 path asks five adaptive choices; other valuation paths ask four. Offered amounts follow the three 16-by-5 matrices in Appendix B. A participant's prior choice updates `ROW` by `2^(4-j)` when option 1 is selected. The importer assigns the starting matrix, answer display order, and increment order independently for each synthetic participant.

## Input and output fields

The AI persona setup asks for monthly Social Security benefit, current or expected benefit status, current age, claiming age, and marital status. These define one synthetic scenario; they are not original respondent records. Each saved choice records the condition, wave, offered lump sum, benefit increment, starting-value group, displayed prompt and options, selected option, and timestamp. The results panel calculates median elicited amounts from the recorded choice bounds. It does not attempt to match published estimates.

## Deviation log

- The original study used respondents' own benefit estimates, with a demographic default in specified cases. Reprise asks the user to set a benefit and profile for synthetic participants.
- The published experiment used two survey waves roughly two weeks apart. The run screen offers a 14-day wait; an AI pilot may run both waves in one session.
- The executable importer covers the valuation choices and no-political-risk manipulation that generated the reported run blockers. Appendix B also contains eligibility, background, financial-literacy, and follow-up questions. Those pages remain available as uploaded source material; they are not participant decisions in this AI run.
- AI choices are simulated and cannot be interpreted as observations from the original RAND American Life Panel respondents.
