/**
 * AntigravityInfiniteFreeRouterV28 (Local OpenAI-Compatible Proxy :4000)
 * Ruota automaticamente a costo 0 EUR su tutti i 7 bacini gratuiti in caso di HTTP 429 / Quota Exceeded.
 */
import http from 'http';
import { execSync } from 'child_process';

let cachedGhToken = process.env.GITHUB_TOKEN || '';
if (!cachedGhToken) {
  try {
    cachedGhToken = execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {}
}

export const FREE_MODELS_MATRIX = [
  { provider: 'OpenRouter', model: 'deepseek/deepseek-r1:free', endpoint: 'https://openrouter.ai/api/v1/chat/completions', envKey: 'OPENROUTER_API_KEY' },
  { provider: 'OpenRouter', model: 'deepseek/deepseek-chat-v3-0324:free', endpoint: 'https://openrouter.ai/api/v1/chat/completions', envKey: 'OPENROUTER_API_KEY' },
  { provider: 'OpenRouter', model: 'qwen/qwen-2.5-coder-32b-instruct:free', endpoint: 'https://openrouter.ai/api/v1/chat/completions', envKey: 'OPENROUTER_API_KEY' },
  { provider: 'OpenRouter', model: 'qwen/qwq-32b:free', endpoint: 'https://openrouter.ai/api/v1/chat/completions', envKey: 'OPENROUTER_API_KEY' },
  { provider: 'OpenRouter', model: 'qwen/qwen3-235b-a22b:free', endpoint: 'https://openrouter.ai/api/v1/chat/completions', envKey: 'OPENROUTER_API_KEY' },
  { provider: 'Groq', model: 'qwen-qwq-32b', endpoint: 'https://api.groq.com/openai/v1/chat/completions', envKey: 'GROQ_API_KEY' },
  { provider: 'Groq', model: 'qwen-2.5-coder-32b', endpoint: 'https://api.groq.com/openai/v1/chat/completions', envKey: 'GROQ_API_KEY' },
  { provider: 'Groq', model: 'deepseek-r1-distill-llama-70b', endpoint: 'https://api.groq.com/openai/v1/chat/completions', envKey: 'GROQ_API_KEY' },
  { provider: 'Cerebras', model: 'qwen-3-32b', endpoint: 'https://api.cerebras.ai/v1/chat/completions', envKey: 'CEREBRAS_API_KEY' },
  { provider: 'Cerebras', model: 'deepseek-r1-distill-llama-70b', endpoint: 'https://api.cerebras.ai/v1/chat/completions', envKey: 'CEREBRAS_API_KEY' },
  { provider: 'Mistral', model: 'codestral-latest', endpoint: 'https://api.mistral.ai/v1/chat/completions', envKey: 'MISTRAL_API_KEY' },
  { provider: 'GitHubModels', model: 'DeepSeek-R1', endpoint: 'https://models.inference.ai.azure.com/chat/completions', envKey: 'GITHUB_TOKEN', fallbackToken: cachedGhToken },
  { provider: 'GitHubModels', model: 'Codestral-2501', endpoint: 'https://models.inference.ai.azure.com/chat/completions', envKey: 'GITHUB_TOKEN', fallbackToken: cachedGhToken },
  { provider: 'GoogleAIStudio', model: 'gemini-2.5-pro-exp-03-25', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', envKey: 'GEMINI_API_KEY' },
  { provider: 'OllamaLocal', model: 'qwen2.5-coder:32b', endpoint: 'http://localhost:11434/v1/chat/completions', envKey: null },
  { provider: 'OllamaLocal', model: 'deepseek-r1:14b', endpoint: 'http://localhost:11434/v1/chat/completions', envKey: null }
];

export async function routeCompletionWithFailover(messages, opts = {}) {
  const errors = [];
  for (const entry of FREE_MODELS_MATRIX) {
    const apiKey = entry.envKey ? (process.env[entry.envKey] || entry.fallbackToken || '') : 'ollama-local';
    if (entry.envKey && !apiKey) continue;
    try {
      const res = await fetch(entry.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: entry.model,
          messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.max_tokens ?? 2048
        })
      });
      if (res.status === 429 || res.status >= 500) {
        errors.push(`${entry.provider}:${entry.model} -> HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) {
        errors.push(`${entry.provider}:${entry.model} -> HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      return { provider: entry.provider, model: entry.model, data };
    } catch (e) {
      errors.push(`${entry.provider}:${entry.model} -> ${e.message}`);
    }
  }
  throw new Error('All free providers failed: ' + errors.join(' | '));
}

if (process.argv[1] && process.argv[1].endsWith('antigravity_infinite_free_router_v28.js')) {
  const port = parseInt(process.env.FREE_ROUTER_PORT || '4000', 10);
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const out = await routeCompletionWithFailover(parsed.messages || [], parsed);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ...out.data, _routed_by: `${out.provider}/${out.model}` }));
        } catch (err) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '28.0', models: FREE_MODELS_MATRIX.length }));
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`[AntigravityInfiniteFreeRouterV28] Listening on http://127.0.0.1:${port}/v1`);
  });
}
