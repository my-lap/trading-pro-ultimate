// ==========================================================================
// FREE LLM ROUTER v28.5 — INFINITE FREE FAILOVER (QWEN + DEEPSEEK 0€)
// OpenAI-compatible client with 50ms anti-429 rotation across free pools
// ==========================================================================
(function () {
  const OPENROUTER_MODELS = [
    { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 :free (Reasoning)' },
    { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 0324 :free (Coding/Fast)' },
    { id: 'qwen/qwen-2.5-coder-32b-instruct:free', label: 'Qwen 2.5 Coder 32B :free (JS/Python)' },
    { id: 'qwen/qwq-32b:free', label: 'Qwen QwQ 32B :free (Quant Reasoning)' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B :free (General)' }
  ];

  const EXTRA_PROVIDERS = [
    { id: 'groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'qwen-qwq-32b', storageKey: 'GROQ_FREE_KEY' },
    { id: 'cerebras', endpoint: 'https://api.cerebras.ai/v1/chat/completions', model: 'qwen-3-32b', storageKey: 'CEREBRAS_FREE_KEY' },
    { id: 'ollama', endpoint: 'http://localhost:11434/v1/chat/completions', model: 'qwen2.5-coder:32b', storageKey: null }
  ];

  const FreeLLMRouter = {
    version: '28.5',
    primaryModel: localStorage.getItem('FREE_LLM_PRIMARY_MODEL') || OPENROUTER_MODELS[0].id,

    getOpenRouterKey() {
      return (localStorage.getItem('OPENROUTER_FREE_KEY') || '').trim();
    },

    saveSettings() {
      const keyVal = (document.getElementById('v285-openrouter-key')?.value || '').trim();
      const modelVal = document.getElementById('v285-primary-model')?.value || OPENROUTER_MODELS[0].id;
      try {
        if (keyVal) localStorage.setItem('OPENROUTER_FREE_KEY', keyVal);
        else localStorage.removeItem('OPENROUTER_FREE_KEY');
        localStorage.setItem('FREE_LLM_PRIMARY_MODEL', modelVal);
      } catch (e) {}
      this.primaryModel = modelVal;
      const badge = document.getElementById('v285-status-badge');
      if (badge) badge.textContent = '🟢 0,00€ Free Router Ready';
      if (window.showToast) window.showToast('🟢 Impostazioni AI Free 0€ salvate in localStorage', 'success');
    },

    buildAttempts() {
      const orKey = this.getOpenRouterKey();
      const ordered = [
        this.primaryModel,
        ...OPENROUTER_MODELS.map(m => m.id).filter(id => id !== this.primaryModel)
      ];
      const attempts = [];
      if (orKey) {
        ordered.forEach(model => {
          attempts.push({
            provider: 'OpenRouter',
            endpoint: 'https://openrouter.ai/api/v1/chat/completions',
            model,
            key: orKey
          });
        });
      }
      EXTRA_PROVIDERS.forEach(p => {
        const k = p.storageKey ? (localStorage.getItem(p.storageKey) || '').trim() : 'ollama-local';
        if (k) attempts.push({ provider: p.id.toUpperCase(), endpoint: p.endpoint, model: p.model, key: k });
      });
      return attempts;
    },

    async chat(messages, opts = {}) {
      const attempts = this.buildAttempts();
      if (!attempts.length) {
        throw new Error('Inserisci la OpenRouter Free Key (sk-or-v1-...) oppure avvia Ollama locale :11434.');
      }
      const errors = [];
      for (const target of attempts) {
        try {
          const res = await fetch(target.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${target.key}`
            },
            body: JSON.stringify({
              model: target.model,
              messages,
              temperature: opts.temperature ?? 0.2,
              max_tokens: opts.max_tokens ?? 512
            })
          });
          if (res.status === 429 || !res.ok) {
            errors.push(`${target.provider}:${target.model}(${res.status})`);
            await new Promise(r => setTimeout(r, 50));
            continue;
          }
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content || '';
          return { content, provider: target.provider, model: target.model };
        } catch (e) {
          errors.push(`${target.provider}:${target.model}(${e.message})`);
          await new Promise(r => setTimeout(r, 50));
        }
      }
      throw new Error('Failover esaurito: ' + errors.slice(0, 3).join(' | '));
    },

    async testConnection() {
      this.saveSettings();
      const outEl = document.getElementById('v285-test-output');
      const badge = document.getElementById('v285-status-badge');
      if (outEl) outEl.textContent = '⏳ Ping in corso verso ' + this.primaryModel + '...';
      try {
        const res = await this.chat([
          { role: 'system', content: 'Sei il team dei 6 Agenti Quantitativi CED. Rispondi in italiano in massimo 2 righe.' },
          { role: 'user', content: 'Ping di verifica: conferma che i 6 Agenti sono connessi al router gratuito.' }
        ]);
        if (badge) badge.textContent = `🟢 0,00€ ${res.provider} (${res.model})`;
        if (outEl) outEl.textContent = `[${res.provider} • ${res.model}] ${res.content}`;
      } catch (err) {
        if (badge) badge.textContent = '🟡 Chiave OpenRouter Free richiesta';
        if (outEl) outEl.textContent = `⚠️ ${err.message}`;
      }
    },

    openModal() {
      let modal = document.getElementById('v285-free-router-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'v285-free-router-modal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(4,8,18,0.84); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; padding:14px;';
        document.body.appendChild(modal);
      }
      const savedKey = this.getOpenRouterKey();
      const opts = OPENROUTER_MODELS.map(m =>
        `<option value="${m.id}" ${m.id === this.primaryModel ? 'selected' : ''}>${m.label}</option>`
      ).join('');
      modal.innerHTML = `
        <div style="width:100%; max-width:560px; background:#0b1220; border:1.5px solid #00f2a1; border-radius:12px; padding:16px; color:#e2e8f0; font-family:var(--font-mono, monospace); box-shadow:0 20px 50px rgba(0,0,0,0.75);">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #1e293b;">
            <div style="font-size:14px; font-weight:900; color:#00f2a1;">🧠⚡ AI FREE 0€ (QWEN + DEEPSEEK ROUTER)</div>
            <span id="v285-status-badge" style="font-size:10px; font-weight:800; padding:3px 8px; border-radius:6px; background:rgba(0,242,161,0.16); border:1px solid #00f2a1; color:#00f2a1;">🟢 0,00€ Free Router Ready</span>
          </div>
          <div style="margin-bottom:10px;">
            <label style="display:block; font-size:11px; font-weight:700; color:#38bdf8; margin-bottom:4px;">OpenRouter Free API Key (sk-or-v1-...):</label>
            <input id="v285-openrouter-key" type="password" value="${savedKey}" placeholder="sk-or-v1-..." style="width:100%; padding:8px; background:#070b14; border:1px solid #334155; border-radius:6px; color:#fff; font-size:12px;">
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; font-size:11px; font-weight:700; color:#facc15; margin-bottom:4px;">Modello Primario (Failover automatico anti-429 50ms):</label>
            <select id="v285-primary-model" style="width:100%; padding:8px; background:#070b14; border:1px solid #334155; border-radius:6px; color:#fff; font-size:12px;">
              ${opts}
            </select>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
            <button type="button" onclick="document.getElementById('v285-free-router-modal').style.display='none'" style="padding:7px 12px; border-radius:6px; background:rgba(244,63,94,0.18); border:1px solid #f43f5e; color:#fda4af; font-weight:800; cursor:pointer;">✕ Chiudi</button>
            <div style="display:flex; gap:8px;">
              <button type="button" onclick="FreeLLMRouterV285.saveSettings()" style="padding:7px 12px; border-radius:6px; background:rgba(56,189,248,0.18); border:1px solid #38bdf8; color:#38bdf8; font-weight:800; cursor:pointer;">💾 Salva Key</button>
              <button type="button" onclick="FreeLLMRouterV285.testConnection()" style="padding:7px 14px; border-radius:6px; background:#00f2a1; border:none; color:#000; font-weight:900; cursor:pointer;">⚡ Test Connessione Free</button>
            </div>
          </div>
          <div id="v285-test-output" style="margin-top:10px; padding:8px; border-radius:6px; background:#070b14; border:1px solid #1e293b; font-size:11px; color:#cbd5e1; min-height:36px;">Pronto: fallback su OpenRouter (:free) ➔ Groq ➔ Cerebras ➔ Ollama (:11434).</div>
        </div>
      `;
      modal.style.display = 'flex';
    }
  };

  window.FreeLLMRouterV285 = FreeLLMRouter;
})();
