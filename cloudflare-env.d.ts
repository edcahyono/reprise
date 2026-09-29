declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    PARATERA_BASE_URL?: string;
    PARATERA_API_KEY?: string;
    PARATERA_QWEN_THINKING_MODEL?: string;
    PARATERA_QWEN_NONTHINKING_MODEL?: string;
    PARATERA_DEEPSEEK_THINKING_MODEL?: string;
    PARATERA_DEEPSEEK_NONTHINKING_MODEL?: string;
  }
}
