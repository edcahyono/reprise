# Experiment replication workspace

## Local setup

Install dependencies with `pnpm install`, then copy `.env.example` to `.env`. Set `QWEN_API_KEY` and/or `DEEPSEEK_API_KEY` in `.env`, matching the providers you want to use. Start the site with `pnpm dev`.

Qwen keys are region-specific. Choose the same Qwen region in the website as the region where the key was issued.

## Hosted setup

Set `QWEN_API_KEY` and `DEEPSEEK_API_KEY` as secret runtime environment variables in Sites. The local `.env` file is ignored by Git and is not published. Deploy a new site version after changing runtime variables.

The site extracts text from PDF, TXT, or Markdown files in the browser and sends that text to the selected model when a role runs. A DOI lookup supplies bibliographic metadata and any available abstract; upload the paper for full-text source work. Outputs stay in the current browser session and can be exported as Markdown.
