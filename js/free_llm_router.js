// ==========================================================================
// FREE LLM ROUTER v28.6 — AUTO-DISCOVERY :FREE LIVE + openrouter/free
// Zero-404 OpenAI-compatible client with 50ms anti-429/404 failover
// ==========================================================================
(function () {
  const FALLBACK_STATIC_MODELS = [
    { id: 'openrouter/free', label: 'openrouter/free (Router Universale Auto-Free 0€)' },
    { id: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder :free' },
    { id: 'deepseek/deepseek-r1-0528:free', label: 'DeepSeek R1 :free' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B :free' }
  ];

  const PRIORITY_PREFIXES = ['qwen', 'deepseek', 'llama', 'gemini', 'mistral'];

  const EXTRA_PROVIDERS = [
    { id: 'groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'qwen-qwq-32b', storageKey: 'GROQ_FREE_KEY' },
    { id: 'cerebras', endpoint: 'https://api.cerebras.ai/v1/chat/completions', model: 'qwen-3-32b', storageKey: 'CEREBRAS_FREE_KEY' },
    { id: 'ollama', endpoint: 'http://localhost:11434/v1/chat/completions', model: 'qwen2.5-coder:32b', storageKey: null }
  ];

  const FreeLLMRouter = {
    version: '28.6',
    discoveredModels: [...FALLBACK_STATIC_MODELS],
    discoveryLoaded: false,
    primaryModel: localStorage.getItem('FREE_LLM_PRIMARY_MODEL') || 'openrouter/free',

    getOpenRouterKey() {
      return (localStorage.getItem('OPENROUTER_FREE_KEY') || '').trim();
    },

    scoreModelPriority(id) {
      const low = (id || '').toLowerCase();
      if (low === 'openrouter/free') return -1;
      for (let i = 0; i < PRIORITY_PREFIXES.length; i++) {
        if (low.includes(PRIORITY_PREFIXES[i])) return i;
      }
      return PRIORITY_PREFIXES.length + 1;
    },

    async discoverFreeModels(force = false) {
      if (this.discoveryLoaded && !force && this.discoveredModels.length > 1) {
        return this.discoveredModels;
      }
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const list = Array.isArray(json?.data) ? json.data : [];
        const freeOnes = list
          .filter(m => {
            const id = m?.id || '';
            const promptPrice = String(m?.pricing?.prompt ?? '');
            return id.endsWith(':free') || promptPrice === '0';
          })
          .sort((a, b) => {
            const sa = this.scoreModelPriority(a.id);
            const sb = this.scoreModelPriority(b.id);
            if (sa !== sb) return sa - sb;
            return (a.id || '').localeCompare(b.id || '');
          })
          .slice(0, 40)
          .map(m => ({
            id: m.id,
            label: `${m.name || m.id} (${m.id})`
          }));

        const merged = [
          { id: 'openrouter/free', label: 'openrouter/free (Router Universale Auto-Free 0€)' },
          ...freeOnes.filter(m => m.id !== 'openrouter/free')
        ];
        if (merged.length > 1) {
          this.discoveredModels = merged;
          this.discoveryLoaded = true;
          this.populateModelSelectDOM();
        }
      } catch (e) {
        // Keep fallback list on network hiccup
      }
      return this.discoveredModels;
    },

    populateModelSelectDOM() {
      const sel = document.getElementById('free-llm-model-select');
      if (!sel) return;
      const current = this.primaryModel || 'openrouter/free';
      sel.innerHTML = this.discoveredModels.map(m =>
        `<option value="${m.id}" ${m.id === current ? 'selected' : ''}>${m.label}</option>`
      ).join('');
      if (!this.discoveredModels.some(m => m.id === current)) {
        sel.value = 'openrouter/free';
        this.primaryModel = 'openrouter/free';
      }
    },

    saveSettings() {
      const keyInput = document.getElementById('v285-openrouter-key');
      const modelSel = document.getElementById('free-llm-model-select');
      const keyVal = (keyInput?.value || '').trim();
      const modelVal = modelSel?.value || this.primaryModel || 'openrouter/free';
      try {
        if (keyVal) localStorage.setItem('OPENROUTER_FREE_KEY', keyVal);
        else localStorage.removeItem('OPENROUTER_FREE_KEY');
        localStorage.setItem('FREE_LLM_PRIMARY_MODEL', modelVal);
      } catch (e) {}
      this.primaryModel = modelVal;
      const badge = document.getElementById('v285-status-badge');
      if (badge) badge.textContent = '🟢 0,00€ Free Router Ready';
      if (window.showToast) window.showToast('🟢 0,00€ Free Router Ready — Chiave e modello salvati', 'success');
    },

    async buildAttempts() {
      await this.discoverFreeModels(false);
      const orKey = this.getOpenRouterKey();
      const liveIds = this.discoveredModels.map(m => m.id);
      const ordered = [];
      const pushUnique = (id) => { if (id && !ordered.includes(id)) ordered.push(id); };

      pushUnique(this.primaryModel);
      pushUnique('openrouter/free');
      liveIds.forEach(pushUnique);

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
      let attempts = await this.buildAttempts();
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
          if (res.status === 404 || res.status === 429 || !res.ok) {
            errors.push(`${target.provider}:${target.model}(${res.status})`);
            await new Promise(r => setTimeout(r, 50));
            continue;
          }
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content || '';
          return { content, provider: target.provider, model: data?.model || target.model };
        } catch (e) {
          errors.push(`${target.provider}:${target.model}(${e.message})`);
          await new Promise(r => setTimeout(r, 50));
        }
      }
      throw new Error('Failover esaurito: ' + errors.slice(0, 4).join(' | '));
    },

    async testConnection() {
      this.saveSettings();
      const outEl = document.getElementById('v285-test-output');
      const badge = document.getElementById('v285-status-badge');
      if (outEl) outEl.textContent = '⏳ Auto-discovery :free & ping live in corso...';
      try {
        const res = await this.chat([
          { role: 'system', content: 'Sei il team dei 6 Agenti Quantitativi CED. Rispondi in italiano in massimo 2 righe.' },
          { role: 'user', content: 'Ping di verifica: conferma che i 6 Agenti sono connessi al router gratuito.' }
        ]);
        if (badge) badge.textContent = `🟢 0,00€ Connesso (${res.model})`;
        if (outEl) outEl.textContent = `✅ Connesso a ${res.model} (0,00€): ${res.content}`;
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
      const opts = this.discoveredModels.map(m =>
        `<option value="${m.id}" ${m.id === this.primaryModel ? 'selected' : ''}>${m.label}</option>`
      ).join('');
      modal.innerHTML = `
        <div style="width:100%; max-width:580px; background:#0b1220; border:1.5px solid #00f2a1; border-radius:12px; padding:16px; color:#e2e8f0; font-family:var(--font-mono, monospace); box-shadow:0 20px 50px rgba(0,0,0,0.75);">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #1e293b;">
            <div style="font-size:14px; font-weight:900; color:#00f2a1;">🧠⚡ AI FREE 0€ (AUTO-DISCOVERY :FREE + openrouter/free)</div>
            <span id="v285-status-badge" style="font-size:10px; font-weight:800; padding:3px 8px; border-radius:6px; background:rgba(0,242,161,0.16); border:1px solid #00f2a1; color:#00f2a1;">🟢 0,00€ Free Router Ready</span>
          </div>
          <div style="margin-bottom:10px;">
            <label style="display:block; font-size:11px; font-weight:700; color:#38bdf8; margin-bottom:4px;">OpenRouter Free API Key (sk-or-v1-...):</label>
            <input id="v285-openrouter-key" type="password" value="${savedKey}" placeholder="sk-or-v1-..." style="width:100%; padding:8px; background:#070b14; border:1px solid #334155; border-radius:6px; color:#fff; font-size:12px;">
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; font-size:11px; font-weight:700; color:#facc15; margin-bottom:4px;">Modello Primario Live (:free Auto-Discovery + Failover 404/429):</label>
            <select id="free-llm-model-select" style="width:100%; padding:8px; background:#070b14; border:1px solid #334155; border-radius:6px; color:#fff; font-size:12px;">
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
          <div id="v285-test-output" style="margin-top:10px; padding:8px; border-radius:6px; background:#070b14; border:1px solid #1e293b; font-size:11px; color:#cbd5e1; min-height:36px;">Pronto: auto-discovery live su /api/v1/models + paracadute universale openrouter/free.</div>
        </div>
      `;
      modal.style.display = 'flex';
      this.discoverFreeModels(true);
    }
  };

  window.FreeLLMRouterV285 = FreeLLMRouter;
})();
