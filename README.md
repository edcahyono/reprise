# Experiment replication workspace

Copy `.env.example` to `.env`, then set `PARATERA_API_KEY` to your TokenHub key. The key stays on the server and is never entered in the website. Set `PARATERA_BASE_URL` to the OpenAI-compatible base URL shown in your Paratera dashboard. The example URL is a starting point; use the dashboard value if it differs. Start the website with `pnpm install` and `pnpm dev`.

Set the model IDs exactly as shown in your TokenHub account. The website has four optional routes:

| Website choice | Server setting |
| --- | --- |
| Qwen, thinking | `PARATERA_QWEN_THINKING_MODEL` |
| Qwen, non-thinking | `PARATERA_QWEN_NONTHINKING_MODEL` |
| DeepSeek, thinking | `PARATERA_DEEPSEEK_THINKING_MODEL` |
| DeepSeek, non-thinking | `PARATERA_DEEPSEEK_NONTHINKING_MODEL` |

The example uses the Qwen and DeepSeek model names visible on the owner's Paratera key page. Both modes may use the same model ID. When they do, the site sends `enable_thinking` for Qwen or `thinking.type` for DeepSeek. Four small calls with this account confirmed that Paratera returned reasoning in thinking mode and no reasoning in non-thinking mode for these two model IDs on 27 September 2026. If you use different dedicated model IDs for the two modes, the site selects between them without adding a mode switch.

For the hosted site, set the same variables as runtime environment variables in Sites, with `PARATERA_API_KEY` stored as a secret. The local `.env` file is ignored by Git and is not published. Deploy a new version after changing runtime settings.

The site extracts text from PDF, TXT, or Markdown files in the browser and sends the extracted text to the selected model when a role runs. A DOI lookup supplies bibliographic metadata and any available abstract; upload the paper for full-text source work. Outputs stay in the current browser session and can be exported as Markdown. The eight roles produce research drafts; empirical reproduction requires the original data and code.
