// ==========================================================================
// ANTIGRAVITY INFINITE FREE LLM ROUTER v28.0 (QWEN + DEEPSEEK + 7 FREE POOLS)
// Zero-Cost Multi-Provider Failover Engine for CED & 6 Quantitative Agents
// ==========================================================================

(function () {
  const STORAGE_KEYS = 'tpu_free_llm_keys_v28';
  const STORAGE_PRIMARY = 'tpu_free_llm_primary_v28';

  const FREE_POOL_CHAIN = [
    { id: 'deepseek-r1-or', label: 'DeepSeek-R1 (:free OpenRouter)', provider: 'OpenRouter', model: 'deepseek/deepseek-r1:free', endpoint: 'https://openrouter.ai/api/v1/chat/completions', keyField: 'openrouter', cost: '0.00 EUR' },
    { id: 'deepseek-v3-or', label: 'DeepSeek-V3 0324 (:free OpenRouter)', provider: 'OpenRouter', model: 'deepseek/deepseek-chat-v3-0324:free', endpoint: 'https://openrouter.ai/api/v1/chat/completions', keyField: 'openrouter', cost: '0.00 EUR' },
    { id: 'qwen-coder-or', label: 'Qwen 2.5 Coder 32B (:free OpenRouter)', provider: 'OpenRouter', model: 'qwen/qwen-2.5-coder-32b-instruct:free', endpoint: 'https://openrouter.ai/api/v1/chat/completions', keyField: 'openrouter', cost: '0.00 EUR' },
    { id: 'qwen3-235b-or', label: 'Qwen3-235B MoE (:free OpenRouter)', provider: 'OpenRouter', model: 'qwen/qwen3-235b-a22b:free', endpoint: 'https://openrouter.ai/api/v1/chat/completions', keyField: 'openrouter', cost: '0.00 EUR' },
    { id: 'qwq-32b-or', label: 'Qwen QwQ-32B Reasoning (:free OpenRouter)', provider: 'OpenRouter', model: 'qwen/qwq-32b:free', endpoint: 'https://openrouter.ai/api/v1/chat/completions', keyField: 'openrouter', cost: '0.00 EUR' },
    { id: 'groq-qwq', label: 'Groq LPU (Qwen QwQ-32B / DeepSeek-R1)', provider: 'Groq', model: 'qwen-qwq-32b', endpoint: 'https://api.groq.com/openai/v1/chat/completions', keyField: 'groq', cost: '0.00 EUR' },
    { id: 'cerebras-qwen3', label: 'Cerebras Wafer (Qwen3-32B 1M tok/day)', provider: 'Cerebras', model: 'qwen-3-32b', endpoint: 'https://api.cerebras.ai/v1/chat/completions', keyField: 'cerebras', cost: '0.00 EUR' },
    { id: 'mistral-codestral', label: 'Mistral Codestral (Coding Free)', provider: 'Mistral', model: 'codestral-latest', endpoint: 'https://api.mistral.ai/v1/chat/completions', keyField: 'mistral', cost: '0.00 EUR' },
    { id: 'github-deepseek', label: 'GitHub Models (DeepSeek-R1 / Codestral)', provider: 'GitHubModels', model: 'DeepSeek-R1', endpoint: 'https://models.inference.ai.azure.com/chat/completions', keyField: 'github', cost: '0.00 EUR' },
    { id: 'ollama-local', label: 'Ollama Locale (qwen2.5-coder / deepseek-r1)', provider: 'Ollama', model: 'qwen2.5-coder:32b', endpoint: 'http://localhost:11434/v1/chat/completions', keyField: 'ollamaUrl', cost: '0.00 EUR Offline' }
  ];

  const RouterV28 = {
    version: '28.0.0',
    chain: FREE_POOL_CHAIN,
    activePrimaryId: 'deepseek-r1-or',
    keys: {
      openrouter: '',
      groq: '',
      cerebras: '',
      mistral: '',
      github: '',
      ollamaUrl: 'http://localhost:11434/v1/chat/completions',
      localProxyUrl: 'http://127.0.0.1:4000/v1/chat/completions'
    },
    lastRouteInfo: 'Pronto (Failover 7 Provider 0 EUR)',

    init() {
      try {
        const savedKeys = JSON.parse(localStorage.getItem(STORAGE_KEYS) || '{}');
        this.keys = { ...this.keys, ...savedKeys };
        const savedPrimary = localStorage.getItem(STORAGE_PRIMARY);
        if (savedPrimary && FREE_POOL_CHAIN.some(m => m.id === savedPrimary)) {
          this.activePrimaryId = savedPrimary;
        }
      } catch (e) {}
    },

    saveConfig() {
      const getVal = (id) => (document.getElementById(id)?.value || '').trim();
      const prim = getVal('v28-primary-model-select');
      if (prim) this.activePrimaryId = prim;
      this.keys.openrouter = getVal('v28-key-openrouter');
      this.keys.groq = getVal('v28-key-groq');
      this.keys.cerebras = getVal('v28-key-cerebras');
      this.keys.mistral = getVal('v28-key-mistral');
      this.keys.github = getVal('v28-key-github');
      this.keys.ollamaUrl = getVal('v28-url-ollama') || 'http://localhost:11434/v1/chat/completions';
      this.keys.localProxyUrl = getVal('v28-url-proxy') || 'http://127.0.0.1:4000/v1/chat/completions';
      try {
        localStorage.setItem(STORAGE_KEYS, JSON.stringify(this.keys));
        localStorage.setItem(STORAGE_PRIMARY, this.activePrimaryId);
      } catch (e) {}
      this.updateStatusBadge();
      if (window.showToast) {
        window.showToast('🧠⚡ Configurazione Router AI Free v28.0 salvata in localStorage (0,00 €)', 'success');
      }
    },

    getOrderedChain() {
      const idx = FREE_POOL_CHAIN.findIndex(m => m.id === this.activePrimaryId);
      if (idx <= 0) return [...FREE_POOL_CHAIN];
      return [FREE_POOL_CHAIN[idx], ...FREE_POOL_CHAIN.slice(0, idx), ...FREE_POOL_CHAIN.slice(idx + 1)];
    },

    async completeWithFailover(messages, opts = {}) {
      const ordered = this.getOrderedChain();
      const errors = [];
      for (const entry of ordered) {
        const endpoint = entry.id === 'ollama-local' ? (this.keys.ollamaUrl || entry.endpoint) : entry.endpoint;
        const apiKey = entry.keyField === 'ollamaUrl' ? 'ollama-local' : (this.keys[entry.keyField] || '');
        if (entry.keyField !== 'ollamaUrl' && !apiKey) continue;

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: entry.model,
              messages,
              temperature: opts.temperature ?? 0.25,
              max_tokens: opts.max_tokens ?? 1024
            })
          });
          if (res.status === 429 || !res.ok) {
            errors.push(`${entry.provider}(${res.status})`);
            continue;
          }
          const data = await res.json();
          const text = data?.choices?.[0]?.message?.content || '';
          this.lastRouteInfo = `✅ ${entry.provider} • ${entry.model} (0,00 €)`;
          this.updateStatusBadge();
          return { text, provider: entry.provider, model: entry.model, raw: data };
        } catch (e) {
          errors.push(`${entry.provider}(offline)`);
        }
      }

      // Fallback via local AntigravityInfiniteFreeRouterV28 proxy (:4000) if running
      if (this.keys.localProxyUrl) {
        try {
          const resP = await fetch(this.keys.localProxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, temperature: opts.temperature ?? 0.25 })
          });
          if (resP.ok) {
            const dP = await resP.json();
            const txtP = dP?.choices?.[0]?.message?.content || '';
            this.lastRouteInfo = `✅ Proxy Locale :4000 (${dP._routed_by || 'FreePool'})`;
            this.updateStatusBadge();
            return { text: txtP, provider: 'LocalProxy', model: dP._routed_by || 'free', raw: dP };
          }
        } catch (e) {}
      }

      this.lastRouteInfo = `⚠️ Nessuna chiave/proxy attivo (${errors.slice(0, 3).join(', ') || 'configura 1 chiave gratuita'})`;
      this.updateStatusBadge();
      throw new Error(this.lastRouteInfo);
    },

    async testRouterLive() {
      const logEl = document.getElementById('v28-router-test-log');
      if (logEl) logEl.innerText = '⏳ Test failover su catena Qwen + DeepSeek + 7 Provider in corso...';
      try {
        const res = await this.completeWithFailover([
          { role: 'system', content: 'Sei il Sotto-Direttore CED Quantitativo. Rispondi in 1 riga in italiano.' },
          { role: 'user', content: 'Conferma stato operativo router gratuito.' }
        ]);
        if (logEl) logEl.innerText = `${this.lastRouteInfo} ➔ "${res.text.slice(0, 140)}"`;
      } catch (e) {
        if (logEl) logEl.innerText = `ℹ️ Catena pronta in standby: inserisci almeno 1 API Key gratuita (OpenRouter/Groq/Cerebras/GitHub) oppure avvia "node free-llm-router/antigravity_infinite_free_router_v28.js".`;
      }
    },

    updateStatusBadge() {
      const el = document.getElementById('v28-router-status-pill');
      if (el) el.innerText = this.lastRouteInfo;
    },

    openModal() {
      this.init();
      let modal = document.getElementById('v28-free-llm-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'v28-free-llm-modal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(4,8,18,0.86); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; padding:14px;';
        document.body.appendChild(modal);
      }

      const optsHtml = FREE_POOL_CHAIN.map(m =>
        `<option value="${m.id}" ${m.id === this.activePrimaryId ? 'selected' : ''}>${m.label} — ${m.cost}</option>`
      ).join('');

      modal.innerHTML = `
        <div style="width:100%; max-width:780px; max-height:90vh; overflow-y:auto; background:#0b1220; border:1.5px solid #00f2a1; border-radius:12px; padding:16px; color:#e2e8f0; font-family:var(--font-mono, monospace); box-shadow:0 20px 50px rgba(0,0,0,0.7);">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; border-bottom:1px solid #1e293b; padding-bottom:10px; margin-bottom:12px;">
            <div>
              <div style="font-size:15px; font-weight:900; color:#00f2a1;">🧠⚡ MOTORE AI FREE v28.0 — QWEN + DEEPSEEK + 7 PROVIDER (0,00 €)</div>
              <div style="font-size:11px; color:#94a3b8;">Rotazione automatica anti-429 per Sotto-Direttore CED &amp; 6 Agenti Quantitativi</div>
            </div>
            <button type="button" onclick="document.getElementById('v28-free-llm-modal').style.display='none'" style="padding:4px 10px; border-radius:6px; background:rgba(244,63,94,0.2); border:1px solid #f43f5e; color:#fda4af; font-weight:800; cursor:pointer;">✕ Chiudi</button>
          </div>

          <div style="margin-bottom:10px;">
            <label style="display:block; font-size:11px; font-weight:800; color:#facc15; margin-bottom:4px;">Modello Primario &amp; Ordine Fallback Automatico:</label>
            <select id="v28-primary-model-select" style="width:100%; padding:8px; background:#070b14; border:1px solid #334155; border-radius:6px; color:#fff; font-size:12px;">
              ${optsHtml}
            </select>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:8px; margin-bottom:12px; font-size:11px;">
            <div>
              <label style="color:#38bdf8; font-weight:700;">OpenRouter Key (:free DeepSeek/Qwen)</label>
              <input id="v28-key-openrouter" type="password" value="${this.keys.openrouter || ''}" placeholder="sk-or-v1-... (opzionale)" style="width:100%; margin-top:3px; padding:6px; background:#070b14; border:1px solid #334155; border-radius:5px; color:#fff;">
            </div>
            <div>
              <label style="color:#00f2a1; font-weight:700;">Groq LPU Free Key (800 tok/s)</label>
              <input id="v28-key-groq" type="password" value="${this.keys.groq || ''}" placeholder="gsk_... (opzionale)" style="width:100%; margin-top:3px; padding:6px; background:#070b14; border:1px solid #334155; border-radius:5px; color:#fff;">
            </div>
            <div>
              <label style="color:#a855f7; font-weight:700;">Cerebras Free Key (1M tok/giorno)</label>
              <input id="v28-key-cerebras" type="password" value="${this.keys.cerebras || ''}" placeholder="csk-... (opzionale)" style="width:100%; margin-top:3px; padding:6px; background:#070b14; border:1px solid #334155; border-radius:5px; color:#fff;">
            </div>
            <div>
              <label style="color:#f59e0b; font-weight:700;">Mistral Codestral Free Key</label>
              <input id="v28-key-mistral" type="password" value="${this.keys.mistral || ''}" placeholder="Key Codestral (opzionale)" style="width:100%; margin-top:3px; padding:6px; background:#070b14; border:1px solid #334155; border-radius:5px; color:#fff;">
            </div>
            <div>
              <label style="color:#e2e8f0; font-weight:700;">GitHub Models Token (DeepSeek/Codestral)</label>
              <input id="v28-key-github" type="password" value="${this.keys.github || ''}" placeholder="ghp_... / github_pat_..." style="width:100%; margin-top:3px; padding:6px; background:#070b14; border:1px solid #334155; border-radius:5px; color:#fff;">
            </div>
            <div>
              <label style="color:#2dd4bf; font-weight:700;">Ollama Locale / Proxy :4000</label>
              <input id="v28-url-ollama" type="text" value="${this.keys.ollamaUrl || ''}" style="width:100%; margin-top:3px; padding:6px; background:#070b14; border:1px solid #334155; border-radius:5px; color:#fff;">
              <input id="v28-url-proxy" type="hidden" value="${this.keys.localProxyUrl || 'http://127.0.0.1:4000/v1/chat/completions'}">
            </div>
          </div>

          <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px; padding-top:8px; border-top:1px solid #1e293b;">
            <span id="v28-router-status-pill" style="font-size:11px; color:#7dd3fc;">${this.lastRouteInfo}</span>
            <div style="display:flex; gap:8px;">
              <button type="button" onclick="AntigravityInfiniteFreeRouterV28.testRouterLive()" style="padding:7px 12px; border-radius:6px; background:rgba(56,189,248,0.18); border:1px solid #38bdf8; color:#38bdf8; font-weight:800; cursor:pointer;">🧪 Test Live Failover</button>
              <button type="button" onclick="AntigravityInfiniteFreeRouterV28.saveConfig()" style="padding:7px 14px; border-radius:6px; background:#00f2a1; border:none; color:#000; font-weight:900; cursor:pointer;">💾 Salva &amp; Attiva 0€</button>
            </div>
          </div>
          <div id="v28-router-test-log" style="margin-top:8px; padding:7px; border-radius:6px; background:#070b14; border:1px solid #1e293b; font-size:10.5px; color:#cbd5e1;">Catena attiva: DeepSeek-R1 (:free) ➔ DeepSeek-V3 (:free) ➔ Qwen-2.5-Coder-32B (:free) ➔ Qwen3-235B (:free) ➔ Groq LPU ➔ Cerebras ➔ Codestral ➔ GitHub Models ➔ Ollama Locale.</div>
        </div>
      `;
      modal.style.display = 'flex';
    }
  };

  RouterV28.init();
  window.AntigravityInfiniteFreeRouterV28 = RouterV28;
})();
