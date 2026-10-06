# Experiment replication workspace

Reprise reconstructs a published behavioral experiment from its own paper and runs it on synthetic AI respondents. It is built for behavioral work in insurance and actuarial science but reads any uploaded study: the arms, stages, repeated decisions, question wording, participant attributes, outcome calculations, and published values all come from the files you upload. No study is special-cased in the audit, the runner, persona generation, or the result views.

The homepage runs the workflow in seven sequential tabs.

**01 Source materials.** Upload the article, and its questionnaire or appendix when one exists, as PDF, TXT, or Markdown. The paper and the additional resources have their own **Extract** button and their own progress bar, and both can run at the same time. Once every uploaded file has been read, the study protocol is built automatically: a design plan, then the questions for each decision occasion, then the outcome calculations, then a search of the paper's result tables for the published value of every calculated measure, then the layout the paper used to present its results, then a plain-language explanation of the study. Work is checkpointed in the browser, so **Resume extraction** continues after a failed step.

**02 Read the study.** The plain-language explanation, with a source quote and page number behind each section. It is written during extraction; **Create study guide** rewrites it, and a Chinese version is generated on request.

**03 Protocol & evidence.** Everything extracted, with its citation. Findings are separated by what they actually prevent. A **run blocker** means the question graph cannot be walked: a condition with no entry question, a broken route, a routing loop. Only these stop a run. A **replication fidelity** finding means the reconstruction departs from the design the paper reported, for example a stage with fewer decision occasions than the paper describes or a missing choice default. These never block the run; they are carried through and printed beside the results, so a partial reconstruction produces reported results with its limits attached rather than nothing at all. Source-backed corrections, a retrieval-based recheck, and a repeat search for published values are all available here.

**04 AI personas.** Only the number of personas is configurable. Every attribute the study actually uses is drawn at random for each persona: a categorical attribute from the paper's reported distribution, a numeric one from its reported mean and SD, and an attribute the instrument needs but the paper never described uniformly across a stated plausible range. Every draw is then constrained by what the attribute can be, from the attribute's own name: no respondent is under 21, a claiming or retirement age never precedes the respondent's current age, a probability stays in its interval, and a monetary amount is never negative. Each click draws an independent sample. Personas export to CSV.

**05 Experiment run.** **Start experiment** runs the sample and **Continue experiment** resumes saved choices; the same button becomes **Pause run** while active. Qwen and DeepSeek runs use the same personas but separate response logs. Every answer is stored in browser IndexedDB. Keep the tab open while a run is active; pause and resume work after each answer. A study with later waves can honour the paper's stated interval or complete in one session.

**06 Experiment results.** The AI run's own results, laid out the way the paper lays out its results: the paper's table titles, row labels, and column headings when they were extracted, and one table per study stage otherwise. **Download AI results (PDF)** writes this view, with the design departures and open source details, to its own file.

**07 Results comparison.** The AI result and the published human result side by side, with the signed difference, the number of scored observations, and an agreement label for each measure. Below the table: a short executive summary, computed from the comparison without a model, and a longer measure-by-measure reading that **Write the detailed comparison** generates. **Download comparison (PDF)** writes this view to a second, separate file.

**Search sources & recheck automatically** revisits the original uploaded text for each check. With `VOYAGE_API_KEY` set, it embeds document passages and issue-specific queries using Voyage semantic search; otherwise it uses keyword ranking. A model proposes minimal corrections with source quotes. The site validates the proposed protocol and offers one **Apply proposed repairs** action only when blockers decrease without introducing new blockers or unverified citations. This can correct extraction mistakes but cannot recover rules absent from the available paper and appendix.

A published value is attached to a measure only when the model can quote the number from an uploaded file; a measure without one is reported as an AI result alone, and nothing is estimated or converted to fill the column. Source-quote checks establish traceability, not a guarantee that an AI reconstruction is identical to the original study. AI responses are new simulated data, not original participant data, and agreement in magnitude is not evidence that a published finding replicates.

A *verified instrument importer* can build a runnable protocol directly from a questionnaire whose branching tables have been checked by hand, skipping the model reconstruction for that study. One ships today, for Brown et al.'s annuity valuation ladder; see [docs/brown-annuity-instrument.md](docs/brown-annuity-instrument.md). The rest of the application does not know it exists.

The former eight-role research workspace remains at `/research`.

Run `pnpm test` for the test suite. Set `BROWN_PAPER_PDF` and `BROWN_APPENDIX_PDF` to run the end-to-end test against that paper and its appendix.

Copy `.env.example` to `.env`, then set `PARATERA_API_KEY` to your TokenHub key. Set `VOYAGE_API_KEY` to enable semantic source search. Both keys stay on the server and are never entered in the website. Set `PARATERA_BASE_URL` to the OpenAI-compatible base URL shown in your Paratera dashboard. The example URL is a starting point; use the dashboard value if it differs. Start the website with `pnpm install` and `pnpm dev`.

Set the model IDs exactly as shown in your TokenHub account. The website has four optional routes:

| Website choice | Server setting |
| --- | --- |
| Qwen, thinking | `PARATERA_QWEN_THINKING_MODEL` |
| Qwen, non-thinking | `PARATERA_QWEN_NONTHINKING_MODEL` |
| DeepSeek, thinking | `PARATERA_DEEPSEEK_THINKING_MODEL` |
| DeepSeek, non-thinking | `PARATERA_DEEPSEEK_NONTHINKING_MODEL` |

The example uses the Qwen and DeepSeek model names visible on the owner's Paratera key page. Both modes may use the same model ID. When they do, the site sends `enable_thinking` for Qwen or `thinking.type` for DeepSeek. Four small calls with this account confirmed that Paratera returned reasoning in thinking mode and no reasoning in non-thinking mode for these two model IDs on 27 September 2026. If you use different dedicated model IDs for the two modes, the site selects between them without adding a mode switch.

For the hosted site, set the same variables as runtime environment variables in Sites, with `PARATERA_API_KEY` stored as a secret. The local `.env` file is ignored by Git and is not published. Deploy a new version after changing runtime settings.

## Publish on Render

This repository includes a [Render Blueprint](render.yaml) for a Node web service. In Render, create a Blueprint from this Git repository. Render will install the locked pnpm dependencies, build the Next.js app, and start it on the port Render assigns. The `/api/health` endpoint is used for deployment health checks.

At Blueprint creation, enter `PARATERA_API_KEY` and the four model IDs exactly as listed in your Paratera dashboard. The model ID fields are prompted for because accounts can differ. `PARATERA_BASE_URL` defaults to the example URL in `.env.example`; change it in Render if your dashboard shows another URL. To enable semantic source search, open the Render service's **Environment** settings, add `VOYAGE_API_KEY` as a secret environment variable, save, and redeploy or restart the service. `VOYAGE_EMBEDDING_MODEL` defaults to `voyage-4-lite`. The recheck report should then show **Voyage semantic search**; without the key, it shows **keyword**. Do not put API keys in `render.yaml` or commit `.env`.

This is a public web app when deployed to a public Render URL. Anyone who can reach its AI routes can make calls billed to your configured keys. Restrict access before sharing the URL if that is not intended. Study files, personas, and results are stored in each browser's IndexedDB, so users must export their work to keep a separate copy.

The site extracts text from PDF, TXT, or Markdown files in the browser and sends the extracted text to the selected model when a role runs. A DOI lookup supplies bibliographic metadata and any available abstract; upload the paper for full-text source work. Outputs stay in the current browser session and can be exported as Markdown. The eight roles produce research drafts; empirical reproduction requires the original data and code.
