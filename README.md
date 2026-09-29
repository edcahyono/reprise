# Experiment replication workspace

The homepage runs a source-grounded AI experiment workflow in six sequential tabs. Upload the original article **and**, when available, its questionnaire or appendix as PDF, TXT, or Markdown. Select a configured Qwen or DeepSeek model and choose **Extract experiment rules**. The site reads uploaded text in sections, shows a readable protocol list, and checks the assignment arms, conditions, question nodes, branching routes, and outcome benchmarks. Source warnings remain visible; broken assignment or question paths block only the steps that need them.

**Search sources & recheck automatically** revisits the original uploaded text for each check. With `VOYAGE_API_KEY` set, it embeds document passages and issue-specific queries using Voyage semantic search; otherwise it uses keyword ranking. A model proposes minimal corrections with source quotes. The site validates the proposed protocol and offers one **Apply proposed repairs** action only when blockers decrease without introducing new blockers or unverified citations. This can correct extraction mistakes but cannot recover rules absent from the available paper and appendix. It does not claim exact replication from synthetic respondents.

When the checks pass, generate reproducible synthetic personas using the protocol's count. **Start experiment** runs the sample and **Continue experiment** resumes saved choices; the same button becomes **Pause run** while active. Qwen and DeepSeek runs use the same personas but separate response logs. Every answer is stored in browser IndexedDB and can be exported with the protocol and result summary as JSON. Keep the tab open while a run is active; pause/resume works after each answer. The former eight-role research workspace remains at `/research`.

The initial runner executes two-option question trees, delays later waves by the protocol's stated number of days, and computes sourced median/mean valuations, absolute log spreads, correlations, and choice shares. Valuation rules need numeric offers and the choice that places an upper bound on valuation. The browser must be reopened to continue a later wave; this is not a background scheduled job. It does not yet compute every possible paper-specific statistic. A compiled protocol may therefore remain blocked for a complex study until its full questionnaire and routing table have been represented. Source-quote checks establish traceability, not a guarantee that an AI reconstruction is identical to the original study. AI responses are new simulated data, not original participant data.

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

At Blueprint creation, enter `PARATERA_API_KEY` and the four model IDs exactly as listed in your Paratera dashboard. The model ID fields are prompted for because accounts can differ. `PARATERA_BASE_URL` defaults to the example URL in `.env.example`; change it in Render if your dashboard shows another URL. To enable semantic source search, add `VOYAGE_API_KEY` in the Render service's environment settings. Without it, source search uses keyword ranking. Do not put API keys in `render.yaml` or commit `.env`.

This is a public web app when deployed to a public Render URL. Anyone who can reach its AI routes can make calls billed to your configured keys. Restrict access before sharing the URL if that is not intended. Study files, personas, and results are stored in each browser's IndexedDB, so users must export their work to keep a separate copy.

The site extracts text from PDF, TXT, or Markdown files in the browser and sends the extracted text to the selected model when a role runs. A DOI lookup supplies bibliographic metadata and any available abstract; upload the paper for full-text source work. Outputs stay in the current browser session and can be exported as Markdown. The eight roles produce research drafts; empirical reproduction requires the original data and code.
