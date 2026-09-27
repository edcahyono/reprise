# Experiment replication workspace

Copy `.env.example` to `.env`, then set `PARATERA_API_KEY` to your TokenHub key. The key stays on the server and is never entered in the website. Set `PARATERA_BASE_URL` to the OpenAI-compatible base URL shown in your Paratera dashboard. The example URL is a starting point; use the dashboard value if it differs. Start the website with `pnpm install` and `pnpm dev`.

Set the model IDs exactly as shown in your TokenHub account. The website has four optional routes:

| Website choice | Server setting |
| --- | --- |
| Qwen, thinking | `PARATERA_QWEN_THINKING_MODEL` |
| Qwen, non-thinking | `PARATERA_QWEN_NONTHINKING_MODEL` |
| DeepSeek, thinking | `PARATERA_DEEPSEEK_THINKING_MODEL` |
| DeepSeek, non-thinking | `PARATERA_DEEPSEEK_NONTHINKING_MODEL` |

Configure only the choices you plan to use. Within a family, thinking and non-thinking must point to different model IDs. The site does not send provider-specific thinking flags, because Paratera's forwarding of those flags has not been verified. If your TokenHub account offers one model that switches modes through an API parameter, that parameter needs to be confirmed from its API documentation before this site can use it.

For the hosted site, set the same variables as runtime environment variables in Sites, with `PARATERA_API_KEY` stored as a secret. The local `.env` file is ignored by Git and is not published. Deploy a new version after changing runtime settings.

The site extracts text from PDF, TXT, or Markdown files in the browser and sends the extracted text to the selected model when a role runs. A DOI lookup supplies bibliographic metadata and any available abstract; upload the paper for full-text source work. Outputs stay in the current browser session and can be exported as Markdown. The eight roles produce research drafts; empirical reproduction requires the original data and code.
