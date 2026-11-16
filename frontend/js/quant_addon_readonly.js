/**
 * QUANT ADDON READ-ONLY v29.5-PRO (ZERO-TOUCH ARCHITECTURE)
 * - Zero modifiche a app.js, chart.js o orderflow_engine.js (Grafico 1 intatto al 100%).
 * - Legge in sola lettura le candele e il range visibile per allineare al pixel e al secondo.
 * - Gestione completa delle altezze, dei sub-grafici e dei parametri regolabili in tempo reale.
 */

(function() {
  'use strict';

  const QuantReadonlyAddon = {
    version: '30.2-PROFIT-GUARD',
    isVisible: true,
    storageKey: 'QRO_LAYOUT_PARAMS_V302',
    params: {
      drawerHeight: 680,
      subChart1Height: 180,     // 120..340px
      subChart2Height: 260,     // 180..460px
      vrvpZoneW: 115,           // 80..240px
      rightAxisW: 68,           // 55..115px
      candleWidthPct: 72,       // 40..92%
      efSplitPct: 55,           // 35..75%
      timeGridSteps: 8,         // 4..16
      mtfMult: 1,               // 1 | 3 | 5 | 15
      minConfidenceGate: 70,    // 50..90%
      beepEnabled: false,
      showAvwap: true,
      showPocLine: true,
      showValueArea: true,
      showFreeRideLevels: true,
      vpLookback: 60,
      vpRows: 24,
      vwapSigmaSpike: 2.5,
      vpinBucketSize: 1200,
      vpinToxicThreshold: 0.68,
      vsaFrictionThreshold: 2.2,
      subChart1Mode: 'CVD_VPIN',
      tradingMode: 'SEMI'
    },
    state: {
      candles: [],
      metrics: [],
      vpLevels: { poc: 0, vah: 0, val: 0, hvn: [], lvn: [], bins: [] },
      signal: { score: 0, action: 'NEUTRALE', reasons: [], modeAction: '' },
      hoverIdx: -1,
      lastVis: null,
      lastHash: '',
      isScrolling: false,
      scrollTimer: null,
      rafPending: false,
      lastBeepTs: 0,
      audioCtx: null
    },

    loadSavedParams() {
      try {
        const raw = localStorage.getItem(this.storageKey) || localStorage.getItem('QRO_LAYOUT_PARAMS_V298');
        if (raw) Object.assign(this.params, JSON.parse(raw));
      } catch (e) {}
    },

    saveParams() {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.params));
      } catch (e) {}
    },

    init() {
      this.loadSavedParams();
      this.injectDrawerDOM();
      this.applyEfSplit();
      const onScroll = () => {
        this.state.isScrolling = true;
        if (this.state.scrollTimer) clearTimeout(this.state.scrollTimer);
        this.state.scrollTimer = setTimeout(() => { this.state.isScrolling = false; }, 180);
      };
      window.addEventListener('scroll', onScroll, { passive: true, capture: true });
      this.bindGlobalCrosshair();
      this.checkAndSync(true);
      setInterval(() => {
        this.bindGlobalCrosshair();
        if (this.isVisible && !this.state.isScrolling) this.checkAndSync(false);
      }, 500);
    },

    bindGlobalCrosshair() {
      if (this.state._hostCrosshairBound) return;
      const mc = window.mainChart || window.mainChartInstance;
      if (!mc || typeof mc.subscribeCrosshairMove !== 'function') return;
      this.state._hostCrosshairBound = true;
      mc.subscribeCrosshairMove((param) => {
        if (!this.state.lastVis || !this.state.lastVis.candles.length || this.state.isScrolling) return;
        let nextIdx = -1;
        if (param && param.time) {
          const tMs = Number(param.time) < 1e11 ? Number(param.time) * 1000 : Number(param.time);
          nextIdx = this.state.lastVis.candles.findIndex(c => Math.abs(c.time - tMs) < 1500);
        }
        if (nextIdx === this.state.hoverIdx) return;
        this.state.hoverIdx = nextIdx;
        if (!this.state.rafPending) {
          this.state.rafPending = true;
          requestAnimationFrame(() => {
            this.state.rafPending = false;
            if (this.state.lastVis) {
              this.drawCharts(this.state.lastVis);
              this.updateCrosshairHUD(this.state.lastVis);
            }
          });
        }
      });
    },

    applyEfSplit() {
      document.documentElement.style.setProperty('--qro-ef-split', `${this.params.efSplitPct}%`);
      const dock = document.getElementById('v27-orderblock-scanner-dock');
      if (dock) dock.style.maxHeight = `${Math.round(this.params.efSplitPct * 6.5)}px`;
    },

    injectDrawerDOM() {
      if (document.getElementById('quant-readonly-drawer')) return;
      if (!document.getElementById('qro-v298-resizable-css')) {
        const st = document.createElement('style');
        st.id = 'qro-v298-resizable-css';
        st.textContent = `
          #qro-kpi-grid > div { resize: horizontal; overflow: auto; min-width: 125px; }
          #v27-orderblock-scanner-dock th, #bybit-orderbook-card th, .ef-live-table th {
            resize: horizontal; overflow: hidden; min-width: 58px;
          }
        `;
        document.head.appendChild(st);
      }
      const drawer = document.createElement('section');
      drawer.id = 'quant-readonly-drawer';
      drawer.style.cssText = `background:#060a12; border-top:2px solid #00e5ff; padding:12px 14px; font-family:system-ui,monospace; color:#e2e8f0; margin-top:8px; box-sizing:border-box; contain:layout style paint;`;
      
      drawer.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; background:#0b121e; padding:8px 12px; border-radius:6px; border:1px solid rgba(0,229,255,0.25);">
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
            <b style="color:#ffab00; font-size:13.5px;">🛡️ SALA QUANT v30.2-PROFIT-GUARD (5-GATE + FREE-RIDE + KELLY)</b>
            <span id="qro-bot-arm-pill" style="font-size:10.5px; font-weight:800; padding:2px 8px; border-radius:4px; background:rgba(245,158,11,0.16); border:1px solid #f59e0b; color:#fbbf24;">🔒 BOT IN VERIFICA</span>
            <span id="qro-regime-pill" style="font-size:10.5px; padding:2px 7px; border-radius:4px; background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.35); color:#7dd3fc;">Regime: --</span>
            <span id="qro-backtest-pill" style="font-size:10.5px; padding:2px 7px; border-radius:4px; background:rgba(0,230,118,0.10); border:1px solid rgba(0,230,118,0.35); color:#00e676;">WR --% | PF -- | Kelly --%</span>
            <span id="qro-alert-pill" style="font-size:10.5px; padding:2px 7px; border-radius:4px; background:rgba(0,230,118,0.12); border:1px solid rgba(0,230,118,0.4); color:#00e676;">🟢 Flusso Normale</span>
            <span id="qro-nextbar-pill" style="font-size:10.5px; padding:2px 7px; border-radius:4px; background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.35); color:#7dd3fc;">⏱️ Next bar: --:--</span>
            <span id="qro-askbid-pill" style="font-size:10.5px; padding:2px 7px; border-radius:4px; background:rgba(15,23,42,0.8); border:1px solid #334155; color:#cbd5e1;">Ask --% | Bid --%</span>
          </div>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
            <select id="qro-mtf-select" title="Aggregazione Multi-Timeframe in sola lettura" style="background:#050911; color:#38bdf8; border:1px solid #38bdf8; padding:4px 7px; border-radius:5px; font-weight:700; font-size:11px;">
              <option value="1" ${this.params.mtfMult == 1 ? 'selected' : ''}>MTF: Sync 1:1</option>
              <option value="3" ${this.params.mtfMult == 3 ? 'selected' : ''}>MTF: x3 Ciclo</option>
              <option value="5" ${this.params.mtfMult == 5 ? 'selected' : ''}>MTF: x5 Ciclo</option>
              <option value="15" ${this.params.mtfMult == 15 ? 'selected' : ''}>MTF: x15 Ciclo</option>
            </select>
            <button id="qro-beep-btn" type="button" style="background:${this.params.beepEnabled ? 'rgba(255,171,0,0.22)' : '#1e293b'}; color:${this.params.beepEnabled ? '#ffab00' : '#cbd5e1'}; border:1px solid ${this.params.beepEnabled ? '#ffab00' : '#475569'}; padding:4px 8px; border-radius:5px; cursor:pointer; font-weight:700; font-size:11px;">
              🔔 Beep POC/VPIN: ${this.params.beepEnabled ? 'ON' : 'OFF'}
            </button>
            <select id="qro-mode-select" style="background:#050911; color:#00e676; border:1px solid #00e676; padding:4px 8px; border-radius:5px; font-weight:700; font-size:11.5px;">
              <option value="MANUAL">1. Trading Manuale (Livelli POC/HVN/LVN)</option>
              <option value="SEMI" selected>2. Trading Semiautomatico (1-Click CED)</option>
              <option value="AUTO">3. Trading Automatizzato (Auto-Bot VPIN/CVD)</option>
            </select>
            <button id="qro-audit-btn" style="background:#006064; color:#fff; border:1px solid #00e5ff; padding:4px 10px; border-radius:5px; cursor:pointer; font-weight:700; font-size:11.5px;">
              🏛️ Audit Sotto-Direttore CED (0€)
            </button>
            <button id="qro-toggle-btn" style="background:#1e293b; color:#cbd5e1; border:1px solid #475569; padding:4px 10px; border-radius:5px; cursor:pointer; font-size:11.5px;">
              🔽 Nascondi / Mostra Pannello
            </button>
          </div>
        </div>

        <div id="qro-body">
          <!-- BARRA LAYOUT & GRIGLIA (SALVATA IN LOCALSTORAGE) -->
          <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; background:#08101c; border:1px solid rgba(56,189,248,0.25); padding:7px 10px; border-radius:6px; margin-bottom:8px; font-size:10.5px;">
            <b style="color:#38bdf8;">🎛️ Layout & Griglia:</b>
            <label>Alt. A: <b id="qro-lbl-subChart1Height">${this.params.subChart1Height}</b>px <input type="range" min="120" max="340" step="10" value="${this.params.subChart1Height}" data-param="subChart1Height" class="qro-slider" style="width:65px; accent-color:#38bdf8;" /></label>
            <label>Alt. B: <b id="qro-lbl-subChart2Height">${this.params.subChart2Height}</b>px <input type="range" min="180" max="460" step="10" value="${this.params.subChart2Height}" data-param="subChart2Height" class="qro-slider" style="width:65px; accent-color:#38bdf8;" /></label>
            <label>Largh. VRVP: <b id="qro-lbl-vrvpZoneW">${this.params.vrvpZoneW}</b>px <input type="range" min="80" max="240" step="5" value="${this.params.vrvpZoneW}" data-param="vrvpZoneW" class="qro-slider" style="width:65px; accent-color:#ffd54f;" /></label>
            <label>Asse Prezzi: <b id="qro-lbl-rightAxisW">${this.params.rightAxisW}</b>px <input type="range" min="55" max="115" step="5" value="${this.params.rightAxisW}" data-param="rightAxisW" class="qro-slider" style="width:60px; accent-color:#ffd54f;" /></label>
            <label>Spessore Candele: <b id="qro-lbl-candleWidthPct">${this.params.candleWidthPct}</b>% <input type="range" min="40" max="92" step="2" value="${this.params.candleWidthPct}" data-param="candleWidthPct" class="qro-slider" style="width:60px; accent-color:#00e676;" /></label>
            <label>Split Campo 1s: <b id="qro-lbl-efSplitPct">${this.params.efSplitPct}</b>% <input type="range" min="35" max="75" step="5" value="${this.params.efSplitPct}" data-param="efSplitPct" class="qro-slider" style="width:60px; accent-color:#e040fb;" /></label>
            <label>Griglia Tempo: <b id="qro-lbl-timeGridSteps">${this.params.timeGridSteps}</b> <input type="range" min="4" max="16" step="1" value="${this.params.timeGridSteps}" data-param="timeGridSteps" class="qro-slider" style="width:55px; accent-color:#00e5ff;" /></label>
            <label>Gate Bot: <b id="qro-lbl-minConfidenceGate">${this.params.minConfidenceGate}</b>% <input type="range" min="50" max="90" step="5" value="${this.params.minConfidenceGate}" data-param="minConfidenceGate" class="qro-slider" style="width:55px; accent-color:#00e676;" /></label>
            <label style="cursor:pointer;"><input type="checkbox" data-check="showAvwap" class="qro-check" ${this.params.showAvwap ? 'checked' : ''} /> VWAP Anc.</label>
            <label style="cursor:pointer;"><input type="checkbox" data-check="showPocLine" class="qro-check" ${this.params.showPocLine ? 'checked' : ''} /> POC Oro</label>
            <label style="cursor:pointer;"><input type="checkbox" data-check="showValueArea" class="qro-check" ${this.params.showValueArea ? 'checked' : ''} /> VA 70%</label>
            <label style="cursor:pointer;"><input type="checkbox" data-check="showFreeRideLevels" class="qro-check" ${this.params.showFreeRideLevels ? 'checked' : ''} /> Free-Ride TP1→BE</label>
          </div>

          <!-- BARRA HUD MIRINO MAGNETICO SINCRONIZZATO -->
          <div id="qro-crosshair-hud" style="background:#050911; border:1px solid rgba(0,229,255,0.22); padding:5px 10px; border-radius:5px; margin-bottom:8px; font-size:11px; font-family:monospace; color:#cbd5e1;">
            🎯 <b>Mirino Sincronizzato:</b> passa il mouse sui Sub-Grafici per ispezionare Ora HH:MM:SS, Close, Delta, CVD, VPIN %, VSA e VWAP.
          </div>

          <div id="qro-kpi-grid" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
            <div style="background:#0a101a; padding:6px 10px; border-radius:5px; border:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:10px; color:#94a3b8;">PUNTEGGIO PONDERATO</div>
              <div id="qro-kpi-score" style="font-size:13px; font-weight:800; color:#00e676;">+0/100</div>
            </div>
            <div style="background:#0a101a; padding:6px 10px; border-radius:5px; border:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:10px; color:#94a3b8;">SEGNALE OPERATIVO</div>
              <div id="qro-kpi-action" style="font-size:12.5px; font-weight:800; color:#00e5ff;">NEUTRALE</div>
            </div>
            <div style="background:#0a101a; padding:6px 10px; border-radius:5px; border:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:10px; color:#94a3b8;">TOSSICITÀ VPIN</div>
              <div id="qro-kpi-vpin" style="font-size:12.5px; font-weight:800; color:#ffab00;">0.0%</div>
            </div>
            <div style="background:#0a101a; padding:6px 10px; border-radius:5px; border:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:10px; color:#94a3b8;">ATTRITO VSA</div>
              <div id="qro-kpi-vsa" style="font-size:12.5px; font-weight:800; color:#e040fb;">1.00</div>
            </div>
            <div style="background:#0a101a; padding:6px 10px; border-radius:5px; border:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:10px; color:#94a3b8;">VWAP & POC</div>
              <div id="qro-kpi-avwap" style="font-size:12px; font-weight:700; color:#ffd54f;">--</div>
            </div>
            <div style="background:#0a101a; padding:6px 10px; border-radius:5px; border:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:10px; color:#94a3b8;">ASSORBIMENTO</div>
              <div id="qro-kpi-abs" style="font-size:11.5px; font-weight:700; color:#fff;">NESSUNO</div>
            </div>
          </div>

          <!-- SUB-GRAFICO A: FLUSSI -->
          <div style="background:#0a101a; border:1px solid rgba(0,229,255,0.2); border-radius:6px; padding:8px; margin-bottom:0;">
            <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; font-size:11px; margin-bottom:4px; gap:6px;">
              <span style="color:#00e5ff; font-weight:700;">
                SUB-GRAFICO A — Flussi Delta Ask/Bid + Curva CVD Cumulativa + Tossicità VPIN
              </span>
              <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                <span style="color:#94a3b8;">Alt A:</span>
                <button type="button" class="qro-h-btn" data-target="subChart1Height" data-delta="-25" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 6px;cursor:pointer;">-</button>
                <button type="button" class="qro-h-btn" data-target="subChart1Height" data-val="90" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 5px;cursor:pointer;">90px</button>
                <button type="button" class="qro-h-btn" data-target="subChart1Height" data-val="140" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 5px;cursor:pointer;">140px</button>
                <button type="button" class="qro-h-btn" data-target="subChart1Height" data-val="185" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 5px;cursor:pointer;">185px</button>
                <button type="button" class="qro-h-btn" data-target="subChart1Height" data-val="260" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 5px;cursor:pointer;">260px</button>
                <button type="button" class="qro-h-btn" data-target="subChart1Height" data-val="360" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 5px;cursor:pointer;">360px</button>
                <button type="button" class="qro-h-btn" data-target="subChart1Height" data-delta="25" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 6px;cursor:pointer;">+</button>
                <select id="qro-sub1-mode" style="background:#050911; color:#fff; border:1px solid #334155; border-radius:4px; padding:2px 6px; font-size:11px;">
                  <option value="CVD_VPIN">Vista: Delta + CVD + VPIN</option>
                  <option value="VSA_EFFORT">Vista: Attrito VSA (Vol / Range)</option>
                </select>
              </div>
            </div>
            <canvas id="qro-subchart-flows" height="${this.params.subChart1Height}" style="width:100%; min-height:${this.params.subChart1Height}px; display:block; border-radius:4px;"></canvas>
          </div>

          <!-- LEVETTA CENTRALE TRASCINABILE (NS-RESIZE) -->
          <div id="qro-center-splitter" title="Trascina su/giù per ridimensionare Sub-Grafico A e B" style="height:10px; margin:4px 0; background:rgba(0,229,255,0.10); border-top:1px solid rgba(0,229,255,0.28); border-bottom:1px solid rgba(255,213,79,0.28); cursor:ns-resize; display:flex; align-items:center; justify-content:center; user-select:none; touch-action:none; border-radius:3px;">
            <div style="width:48px; height:3px; border-radius:2px; background:#00e5ff;"></div>
          </div>

          <!-- SUB-GRAFICO B: BASE PARAMETRIZZATA -->
          <div style="background:#0a101a; border:1px solid rgba(255,213,79,0.25); border-radius:6px; padding:8px; margin-bottom:10px;">
            <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; font-size:11px; margin-bottom:4px; gap:6px;">
              <span style="color:#ffd54f; font-weight:700;">
                SUB-GRAFICO B — Candele Reali Filtrate (VPIN/VSA) + VWAP Ancorato ±1σ + VRVP Ordini
              </span>
              <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                <span style="color:#94a3b8;">Alt B:</span>
                <button type="button" class="qro-h-btn" data-target="subChart2Height" data-delta="-25" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 6px;cursor:pointer;">-</button>
                <button type="button" class="qro-h-btn" data-target="subChart2Height" data-val="140" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 5px;cursor:pointer;">140px</button>
                <button type="button" class="qro-h-btn" data-target="subChart2Height" data-val="220" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 5px;cursor:pointer;">220px</button>
                <button type="button" class="qro-h-btn" data-target="subChart2Height" data-val="260" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 5px;cursor:pointer;">260px</button>
                <button type="button" class="qro-h-btn" data-target="subChart2Height" data-val="360" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 5px;cursor:pointer;">360px</button>
                <button type="button" class="qro-h-btn" data-target="subChart2Height" data-val="500" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 5px;cursor:pointer;">500px</button>
                <button type="button" class="qro-h-btn" data-target="subChart2Height" data-delta="25" style="background:#111827;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:1px 6px;cursor:pointer;">+</button>
              </div>
            </div>
            <canvas id="qro-subchart-base" height="${this.params.subChart2Height}" style="width:100%; min-height:${this.params.subChart2Height}px; display:block; border-radius:4px;"></canvas>

            <div style="display:flex; flex-wrap:wrap; gap:14px; align-items:center; background:#050911; padding:8px 12px; border-radius:5px; margin-top:8px; font-size:11px;">
              <label>Finestra Candele VP: <b id="qro-lbl-vpLookback">${this.params.vpLookback}</b>
                <input type="range" min="20" max="150" step="5" value="${this.params.vpLookback}" data-param="vpLookback" class="qro-slider" style="width:85px; accent-color:#00e5ff;" />
              </label>
              <label>Livelli Prezzo VRVP: <b id="qro-lbl-vpRows">${this.params.vpRows}</b>
                <input type="range" min="12" max="48" step="4" value="${this.params.vpRows}" data-param="vpRows" class="qro-slider" style="width:85px; accent-color:#00e5ff;" />
              </label>
              <label>Picco VWAP (σ): <b id="qro-lbl-vwapSigmaSpike">${this.params.vwapSigmaSpike}</b>
                <input type="range" min="1.5" max="4.0" step="0.1" value="${this.params.vwapSigmaSpike}" data-param="vwapSigmaSpike" class="qro-slider" style="width:85px; accent-color:#00e5ff;" />
              </label>
              <label>Soglia VPIN: <b id="qro-lbl-vpinToxicThreshold">${this.params.vpinToxicThreshold}</b>
                <input type="range" min="0.40" max="0.90" step="0.02" value="${this.params.vpinToxicThreshold}" data-param="vpinToxicThreshold" class="qro-slider" style="width:85px; accent-color:#00e5ff;" />
              </label>
              <label>Soglia VSA: <b id="qro-lbl-vsaFrictionThreshold">${this.params.vsaFrictionThreshold}</b>
                <input type="range" min="1.2" max="3.8" step="0.1" value="${this.params.vsaFrictionThreshold}" data-param="vsaFrictionThreshold" class="qro-slider" style="width:85px; accent-color:#00e5ff;" />
              </label>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <div style="background:#0a101a; border-left:3px solid #00e676; padding:8px; border-radius:4px; font-size:11.5px;">
              <div id="qro-mode-banner" style="font-weight:700; color:#00e676; margin-bottom:4px;"></div>
              <ul id="qro-reasons-list" style="padding-left:16px; line-height:1.4; color:#cbd5e1; font-size:11px;"></ul>
              <div id="qro-audit-output" style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.08); color:#ffd54f;">
                🟢 Clicca "🏛️ Audit Sotto-Direttore CED (0€)" per interrogare l'AI sui dati reali.
              </div>
            </div>
            <div style="background:#0a101a; border:1px solid rgba(0,229,255,0.2); padding:8px; border-radius:4px; font-size:11px; line-height:1.45; color:#cbd5e1;">
              <b style="color:#00e5ff;">📖 GUIDA RAPIDA AL CONTROLLO:</b><br/>
              • <b>Grafico 1 (Sopra):</b> Resta intatto. Usa <code>Ctrl + Rotellina</code> per stringere/allargare; i grafici sotto seguono in tempo reale.<br/>
              • <b>Sub-Grafico A:</b> Monitora se comprano (verde) o vendono (rosso), la pendenza CVD e i picchi di tossicità VPIN.<br/>
              • <b>Sub-Grafico B:</b> Mostra il profilo ordini a destra (es. <code>19k+4.6k</code>) con il POC d'oro e colora le candele in arancione nei momenti di alto rischio.
            </div>
          </div>
        </div>
      `;
      const mountTarget = document.getElementById('bybit-chart-column-wrap')
        || document.getElementById('bb-col-chart')
        || document.getElementById('tab-terminal')
        || document.body;
      mountTarget.appendChild(drawer);
      // Assicura che nessun contenitore padre tagli fuori lo scroll del pannello
      let p = drawer.parentElement;
      while (p && p !== document.documentElement) {
        const cs = window.getComputedStyle(p);
        if (cs && (cs.overflowY === 'hidden' || cs.overflow === 'hidden')) {
          p.style.overflowY = 'auto';
        }
        p = p.parentElement;
      }

      document.getElementById('qro-toggle-btn').addEventListener('click', () => {
        this.isVisible = !this.isVisible;
        document.getElementById('qro-body').style.display = this.isVisible ? 'block' : 'none';
      });
      document.getElementById('qro-mtf-select').addEventListener('change', (e) => {
        this.params.mtfMult = parseInt(e.target.value, 10) || 1;
        this.saveParams();
        this.checkAndSync(true);
      });
      document.getElementById('qro-beep-btn').addEventListener('click', () => {
        this.params.beepEnabled = !this.params.beepEnabled;
        const btn = document.getElementById('qro-beep-btn');
        if (btn) {
          btn.textContent = `🔔 Beep POC/VPIN: ${this.params.beepEnabled ? 'ON' : 'OFF'}`;
          btn.style.background = this.params.beepEnabled ? 'rgba(255,171,0,0.22)' : '#1e293b';
          btn.style.color = this.params.beepEnabled ? '#ffab00' : '#cbd5e1';
          btn.style.borderColor = this.params.beepEnabled ? '#ffab00' : '#475569';
        }
        if (this.params.beepEnabled) this.triggerWebAudioBeep(660, 0.08, true);
        this.saveParams();
      });
      document.getElementById('qro-mode-select').addEventListener('change', (e) => {
        this.params.tradingMode = e.target.value;
        this.saveParams();
        this.checkAndSync(true);
      });
      document.getElementById('qro-sub1-mode').addEventListener('change', (e) => {
        this.params.subChart1Mode = e.target.value;
        this.saveParams();
        this.checkAndSync(true);
      });
      document.querySelectorAll('.qro-slider').forEach(sl => {
        sl.addEventListener('input', (e) => {
          const p = e.target.getAttribute('data-param');
          const v = parseFloat(e.target.value);
          this.params[p] = v;
          const lbl = document.getElementById(`qro-lbl-${p}`);
          if (lbl) lbl.textContent = e.target.value;
          if (p === 'efSplitPct') this.applyEfSplit();
          this.saveParams();
          this.checkAndSync(true);
        });
      });
      document.querySelectorAll('.qro-check').forEach(ch => {
        ch.addEventListener('change', (e) => {
          const p = e.target.getAttribute('data-check');
          this.params[p] = !!e.target.checked;
          this.saveParams();
          this.checkAndSync(true);
        });
      });
      ['qro-subchart-flows', 'qro-subchart-base'].forEach(id => {
        const cv = document.getElementById(id);
        if (!cv) return;
        cv.addEventListener('mousemove', (e) => {
          if (!this.state.lastVis || !this.state.lastVis.candles.length) return;
          const rect = cv.getBoundingClientRect();
          const plotW = Math.max(40, (cv.width - this.params.rightAxisW) - this.params.vrvpZoneW);
          const relX = (e.clientX - rect.left) * (cv.width / (rect.width || cv.width));
          const n = this.state.lastVis.candles.length;
          const idx = Math.floor((relX / plotW) * n);
          const nextIdx = (idx >= 0 && idx < n) ? idx : -1;
          if (nextIdx === this.state.hoverIdx) return;
          this.state.hoverIdx = nextIdx;
          if (!this.state.rafPending) {
            this.state.rafPending = true;
            requestAnimationFrame(() => {
              this.state.rafPending = false;
              if (this.state.lastVis) {
                this.drawCharts(this.state.lastVis);
                this.updateCrosshairHUD(this.state.lastVis);
              }
            });
          }
        });
        cv.addEventListener('mouseleave', () => {
          this.state.hoverIdx = -1;
          if (this.state.lastVis) this.drawCharts(this.state.lastVis);
        });
      });
      document.querySelectorAll('.qro-h-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-target');
          const val = btn.getAttribute('data-val');
          const delta = btn.getAttribute('data-delta');
          const minH = target === 'subChart1Height' ? 70 : 120;
          const maxH = target === 'subChart1Height' ? 420 : 540;
          const cur = parseInt(this.params[target], 10) || 180;
          const next = val !== null ? parseInt(val, 10) : Math.max(minH, Math.min(maxH, cur + parseInt(delta, 10)));
          this.params[target] = next;
          const lbl = document.getElementById(`qro-lbl-${target}`);
          if (lbl) lbl.textContent = next;
          this.saveParams();
          this.checkAndSync(true);
        });
      });

      const splitter = document.getElementById('qro-center-splitter');
      if (splitter) {
        let dragY = null, startH1 = 180, startH2 = 260;
        const onMove = (clientY) => {
          if (dragY === null) return;
          const dy = clientY - dragY;
          this.params.subChart1Height = Math.max(70, Math.min(420, startH1 + dy));
          this.params.subChart2Height = Math.max(120, Math.min(540, startH2 - dy));
          this.checkAndSync(true);
        };
        splitter.addEventListener('mousedown', (e) => {
          dragY = e.clientY;
          startH1 = parseInt(this.params.subChart1Height, 10) || 180;
          startH2 = parseInt(this.params.subChart2Height, 10) || 260;
        });
        window.addEventListener('mousemove', (e) => { if (dragY !== null) onMove(e.clientY); });
        window.addEventListener('mouseup', () => {
          if (dragY !== null) { dragY = null; this.saveParams(); }
        });
        splitter.addEventListener('touchstart', (e) => {
          if (e.touches && e.touches[0]) {
            dragY = e.touches[0].clientY;
            startH1 = parseInt(this.params.subChart1Height, 10) || 180;
            startH2 = parseInt(this.params.subChart2Height, 10) || 260;
          }
        }, { passive: true });
        splitter.addEventListener('touchmove', (e) => {
          if (dragY !== null && e.touches && e.touches[0]) { e.preventDefault(); onMove(e.touches[0].clientY); }
        }, { passive: false });
        splitter.addEventListener('touchend', () => {
          if (dragY !== null) { dragY = null; this.saveParams(); }
        });
      }

      document.getElementById('qro-audit-btn').addEventListener('click', () => this.runFreeAIAudit());
    },

    readHostCandlesReadOnly() {
      const candidates = [window.chartCandles, window.klineData, window.candlesData, window.currentCandles, window.ohlcData];
      for (const arr of candidates) {
        if (Array.isArray(arr) && arr.length > 5) {
          return arr.map(c => {
            const open = Number(c.open ?? c.o ?? c.close);
            const high = Number(c.high ?? c.h ?? open);
            const low = Number(c.low ?? c.l ?? open);
            const close = Number(c.close ?? c.c ?? open);
            const volume = Number(c.volume ?? c.vol ?? c.v ?? 12000);
            const isBull = close >= open;
            const askVol = c.askVol !== undefined ? Number(c.askVol) : volume * (isBull ? 0.57 : 0.43);
            const bidVol = c.bidVol !== undefined ? Number(c.bidVol) : (volume - askVol);
            let time = Number(c.time ?? c.timestamp ?? c.t ?? Date.now());
            if (time < 1e11) time *= 1000;
            return { time, open, high, low, close, volume, askVol, bidVol };
          });
        }
      }
      return [];
    },

    getAlignedVisibleSlice() {
      const n = this.state.candles.length;
      if (!n) return { candles: [], metrics: [] };
      let start = Math.max(0, n - (window.chartVisibleBars || 45));
      let end = n;
      try {
        const mainChartObj = window.mainChart || window.chart || window.tvChart;
        if (mainChartObj && typeof mainChartObj.timeScale === 'function') {
          const lr = mainChartObj.timeScale().getVisibleLogicalRange();
          if (lr && typeof lr.from === 'number' && typeof lr.to === 'number') {
            start = Math.max(0, Math.floor(lr.from));
            end = Math.min(n, Math.ceil(lr.to) + 1);
          }
        }
      } catch (e) {}
      if (end - start < 5) start = Math.max(0, end - 30);
      return {
        candles: this.state.candles.slice(start, end),
        metrics: this.state.metrics.slice(start, end)
      };
    },

    drawPlaceholderCanvases() {
      const drawEmpty = (id, h, title) => {
        const cv = document.getElementById(id);
        if (!cv) return;
        const ctx = cv.getContext('2d');
        const W = cv.width = cv.clientWidth || 960;
        const H = cv.height = h;
        ctx.fillStyle = '#060a10';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(0,229,255,0.08)';
        for (let i = 1; i < 4; i++) {
          const y = (H / 4) * i;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px monospace';
        ctx.fillText(title, 16, H / 2);
      };
      drawEmpty('qro-subchart-flows', this.params.subChart1Height, '⏳ Sub-Grafico A (180px): in attesa dati candele WebSocket/API...');
      drawEmpty('qro-subchart-base', this.params.subChart2Height, '⏳ Sub-Grafico B (260px): in attesa dati candele + VRVP...');
    },

    aggregateCandlesMTF(raw, mult) {
      if (!mult || mult <= 1 || raw.length < mult) return raw;
      const out = [];
      for (let i = 0; i < raw.length; i += mult) {
        const chunk = raw.slice(i, i + mult);
        if (!chunk.length) continue;
        out.push({
          time: chunk[0].time,
          open: chunk[0].open,
          high: Math.max(...chunk.map(c => c.high)),
          low: Math.min(...chunk.map(c => c.low)),
          close: chunk[chunk.length - 1].close,
          volume: chunk.reduce((a, c) => a + c.volume, 0),
          askVol: chunk.reduce((a, c) => a + c.askVol, 0),
          bidVol: chunk.reduce((a, c) => a + c.bidVol, 0)
        });
      }
      return out;
    },

    triggerWebAudioBeep(freq = 880, dur = 0.11, bypassCooldown = false) {
      const now = Date.now();
      if (!bypassCooldown && (!this.params.beepEnabled || (now - this.state.lastBeepTs < 15000))) return;
      this.state.lastBeepTs = now;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!this.state.audioCtx) this.state.audioCtx = new AC();
        if (this.state.audioCtx.state === 'suspended') this.state.audioCtx.resume();
        const osc = this.state.audioCtx.createOscillator();
        const gain = this.state.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.08, this.state.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.state.audioCtx.currentTime + dur);
        osc.connect(gain);
        gain.connect(this.state.audioCtx.destination);
        osc.start();
        osc.stop(this.state.audioCtx.currentTime + dur);
      } catch (e) {}
    },

    checkAndSync(force = false) {
      const rawHost = this.readHostCandlesReadOnly();
      if (!rawHost.length) {
        if (!this.state.lastHash) {
          this.state.lastHash = 'EMPTY';
          this.drawPlaceholderCanvases();
        }
        return;
      }
      const mult = parseInt(this.params.mtfMult, 10) || 1;
      const lastRaw = rawHost[rawHost.length - 1];
      let lrStr = '';
      try {
        const mc = window.mainChart || window.chart || window.tvChart;
        const lr = mc && mc.timeScale ? mc.timeScale().getVisibleLogicalRange() : null;
        if (lr) lrStr = `${Math.round(lr.from)}:${Math.round(lr.to)}`;
      } catch (e) {}
      const hash = `${rawHost.length}|${lastRaw.time}|${lastRaw.close}|${lastRaw.high}|${lastRaw.low}|${lastRaw.volume}|${lrStr}|${window.chartVisibleBars || 45}|${mult}|${JSON.stringify(this.params)}`;
      if (!force && hash === this.state.lastHash) return;
      this.state.lastHash = hash;
      this.syncAndRender(rawHost);
    },

    syncAndRender(rawHost) {
      const hostCandles = rawHost || this.readHostCandlesReadOnly();
      if (!hostCandles.length) {
        this.drawPlaceholderCanvases();
        return;
      }
      this.state.candles = this.aggregateCandlesMTF(hostCandles, parseInt(this.params.mtfMult, 10) || 1);
      this.computeMetrics();
      const vis = this.getAlignedVisibleSlice();
      this.state.lastVis = vis;
      this.computeVRVP(vis.candles);
      this.computeCompositeSignal(vis);
      this.drawCharts(vis);
      this.updateHUD();
      this.updateCrosshairHUD(vis);
      this.evaluateAlertStatus(vis);
    },

    evaluateAlertStatus(vis) {
      if (!vis || !vis.candles.length) return;
      const lastC = vis.candles[vis.candles.length - 1];
      const lastM = vis.metrics[vis.metrics.length - 1];
      const totBuy = vis.candles.reduce((a, c) => a + c.askVol, 0);
      const totSell = vis.candles.reduce((a, c) => a + c.bidVol, 0);
      const totVol = (totBuy + totSell) || 1;
      const askPct = ((totBuy / totVol) * 100).toFixed(1);
      const bidPct = ((totSell / totVol) * 100).toFixed(1);
      const askBidEl = document.getElementById('qro-askbid-pill');
      if (askBidEl) askBidEl.innerHTML = `<b style="color:#00e676;">🟢 Ask ${askPct}%</b> | <b style="color:#ff5252;">🔴 Bid ${bidPct}%</b>`;
      const nbEl = document.getElementById('qro-nextbar-pill');
      if (nbEl && vis.candles.length > 1) {
        const dt = Math.max(1000, Math.abs(vis.candles[vis.candles.length - 1].time - vis.candles[vis.candles.length - 2].time));
        const remSec = Math.max(0, Math.floor((lastC.time + dt - Date.now()) / 1000) % Math.max(1, Math.round(dt / 1000)));
        const mm = String(Math.floor(remSec / 60)).padStart(2, '0');
        const ss = String(remSec % 60).padStart(2, '0');
        nbEl.textContent = `⏱️ Next bar: ${mm}:${ss}`;
      }
      const poc = this.state.vpLevels.poc || 0;
      const nearPoc = poc > 0 && Math.abs(lastC.close - poc) / poc < 0.0012;
      const highVpin = lastM && lastM.vpin >= this.params.vpinToxicThreshold;
      const pill = document.getElementById('qro-alert-pill');
      if (highVpin) {
        if (pill) {
          pill.textContent = `🔴 VPIN ${(lastM.vpin * 100).toFixed(0)}% TOSSICO`;
          pill.style.color = '#ff5252';
          pill.style.borderColor = '#ff5252';
          pill.style.background = 'rgba(255,82,82,0.14)';
        }
        this.triggerWebAudioBeep(920, 0.12);
      } else if (nearPoc) {
        if (pill) {
          pill.textContent = `🟡 Prezzo su POC`;
          pill.style.color = '#ffd54f';
          pill.style.borderColor = '#ffd54f';
          pill.style.background = 'rgba(255,213,79,0.14)';
        }
        this.triggerWebAudioBeep(660, 0.10);
      } else if (pill) {
        pill.textContent = `🟢 Flusso Normale`;
        pill.style.color = '#00e676';
        pill.style.borderColor = 'rgba(0,230,118,0.4)';
        pill.style.background = 'rgba(0,230,118,0.12)';
      }
    },

    computeMetrics() {
      const candles = this.state.candles;
      const n = candles.length;
      const vols = candles.map(c => c.volume);
      const meanVol = vols.reduce((a, b) => a + b, 0) / n;
      const stdVol = Math.sqrt(vols.reduce((a, v) => a + Math.pow(v - meanVol, 2), 0) / n) || 1;
      const ranges = candles.map(c => Math.max(1e-8, c.high - c.low));
      const meanRange = ranges.reduce((a, b) => a + b, 0) / n;

      let cvd = 0, cumPV = 0, cumV = 0, cumPV2 = 0;
      let bFill = 0, bBuy = 0, bSell = 0;
      const bucketImb = [];
      this.state.metrics = [];

      for (let i = 0; i < n; i++) {
        const c = candles[i];
        const delta = c.askVol - c.bidVol;
        cvd += delta;

        let absorption = 'NESSUNO';
        if (i >= 5) {
          const pC = candles[i - 4];
          const pCVD = this.state.metrics[i - 4].cvd;
          if (c.high > pC.high && cvd < pCVD) absorption = 'ASSORBIMENTO VENDITE (SHORT)';
          else if (c.low < pC.low && cvd > pCVD) absorption = 'ASSORBIMENTO ACQUISTI (LONG)';
        }

        const volZ = (c.volume - meanVol) / stdVol;
        if (volZ >= this.params.vwapSigmaSpike && i > 4) { cumPV = 0; cumV = 0; cumPV2 = 0; }
        const typ = (c.high + c.low + c.close) / 3;
        cumPV += typ * c.volume; cumV += c.volume; cumPV2 += typ * typ * c.volume;
        const avwap = cumPV / (cumV || 1);
        const stdev = Math.sqrt(Math.max(0, (cumPV2 / (cumV || 1)) - avwap * avwap));

        bFill += c.volume; bBuy += c.askVol; bSell += c.bidVol;
        if (bFill >= this.params.vpinBucketSize) {
          bucketImb.push(Math.abs(bBuy - bSell) / (bFill || 1));
          if (bucketImb.length > 10) bucketImb.shift();
          bFill = 0; bBuy = 0; bSell = 0;
        }
        const curImb = Math.abs(c.askVol - c.bidVol) / (c.volume || 1);
        const vpin = bucketImb.length ? (bucketImb.reduce((a, b) => a + b, 0) + curImb) / (bucketImb.length + 1) : curImb;
        const vsaFriction = (c.volume / (meanVol || 1)) / Math.max(0.1, (c.high - c.low) / (meanRange || 1));

        this.state.metrics.push({
          time: c.time, delta, cvd, absorption, avwap,
          avwapUp1: avwap + stdev, avwapDn1: avwap - stdev,
          vpin: Math.min(0.99, Math.max(0.05, vpin)), vsaFriction
        });
      }
    },

    computeVRVP(visCandles) {
      const slice = visCandles.length ? visCandles : this.state.candles.slice(-this.params.vpLookback);
      const rows = parseInt(this.params.vpRows, 10) || 24;
      const minP = Math.min(...slice.map(c => c.low));
      const maxP = Math.max(...slice.map(c => c.high));
      const step = Math.max(1e-8, (maxP - minP) / rows);

      const bins = Array.from({ length: rows }, (_, i) => ({
        priceLow: minP + i * step, priceHigh: minP + (i + 1) * step, priceMid: minP + (i + 0.5) * step,
        vol: 0, buyVol: 0, sellVol: 0, type: 'NORMAL', intensityLabel: ''
      }));

      slice.forEach(c => {
        const idx = Math.min(rows - 1, Math.max(0, Math.floor(((c.close - minP) / (maxP - minP || 1e-8)) * rows)));
        bins[idx].vol += c.volume; bins[idx].buyVol += c.askVol; bins[idx].sellVol += c.bidVol;
      });

      const maxV = Math.max(...bins.map(b => b.vol), 1);
      const avgV = bins.reduce((a, b) => a + b.vol, 0) / rows;
      let pocBin = bins[0];
      const hvn = [], lvn = [];

      bins.forEach(b => {
        b.pct = b.vol / maxV;
        b.intensityLabel = `${(b.vol / 1000).toFixed(1)}k+${(b.buyVol / 1000).toFixed(1)}k`;
        if (b.vol > pocBin.vol) pocBin = b;
        if (b.vol >= avgV * 1.35) { b.type = 'HVN'; hvn.push(b.priceMid); }
        else if (b.vol <= avgV * 0.50) { b.type = 'LVN'; lvn.push(b.priceMid); }
      });
      pocBin.type = 'POC';
      // Calcolo Value Area 70% (VAH / VAL) attorno al POC
      const totalVol = bins.reduce((a, b) => a + b.vol, 0) || 1;
      const pocIdx = bins.indexOf(pocBin);
      let lo = pocIdx, hi = pocIdx, acc = pocBin.vol;
      while (acc < totalVol * 0.70 && (lo > 0 || hi < bins.length - 1)) {
        const vLo = lo > 0 ? bins[lo - 1].vol : -1;
        const vHi = hi < bins.length - 1 ? bins[hi + 1].vol : -1;
        if (vHi >= vLo && hi < bins.length - 1) { hi++; acc += bins[hi].vol; }
        else if (lo > 0) { lo--; acc += bins[lo].vol; }
        else break;
      }
      const vah = bins[hi].priceHigh;
      const val = bins[lo].priceLow;
      this.state.vpLevels = { poc: pocBin.priceMid, vah, val, hvn, lvn, bins };
    },

    computeCompositeSignal(vis) {
      if (!vis.candles.length) return;
      const lastC = vis.candles[vis.candles.length - 1];
      const lastM = vis.metrics[vis.metrics.length - 1];
      const totBuy = vis.candles.reduce((a, c) => a + c.askVol, 0);
      const totSell = vis.candles.reduce((a, c) => a + c.bidVol, 0);
      const totVol = (totBuy + totSell) || 1;
      const askPct = ((totBuy / totVol) * 100).toFixed(1);
      const bidPct = ((totSell / totVol) * 100).toFixed(1);
      const askBidEl = document.getElementById('qro-askbid-pill');
      if (askBidEl) askBidEl.innerHTML = `<b style="color:#00e676;">🟢 Ask ${askPct}%</b> | <b style="color:#ff5252;">🔴 Bid ${bidPct}%</b>`;
      const nbEl = document.getElementById('qro-nextbar-pill');
      if (nbEl && vis.candles.length > 1) {
        const dt = Math.max(1000, Math.abs(vis.candles[vis.candles.length - 1].time - vis.candles[vis.candles.length - 2].time));
        const remSec = Math.max(0, Math.floor((lastC.time + dt - Date.now()) / 1000) % Math.max(1, Math.round(dt / 1000)));
        const mm = String(Math.floor(remSec / 60)).padStart(2, '0');
        const ss = String(remSec % 60).padStart(2, '0');
        nbEl.textContent = `⏱️ Next bar: ${mm}:${ss}`;
      }
      let score = 0;
      const reasons = [];
      const vp = this.state.vpLevels || {};
      const vah = vp.vah || lastC.high;
      const val = vp.val || lastC.low;
      const poc = vp.poc || lastC.close;

      // Regime: RANGE VA Mean-Reversion vs TREND Breakout
      const inVA = lastC.close >= val && lastC.close <= vah;
      const regime = inVA ? 'RANGE VA Mean-Reversion' : 'TREND Breakout';

      // Anti-Fakeout 5-Gate Filter + Stop-Hunt VSA
      const range = Math.max(1e-8, lastC.high - lastC.low);
      const upperWick = lastC.high - Math.max(lastC.open, lastC.close);
      const lowerWick = Math.min(lastC.open, lastC.close) - lastC.low;
      const isBullTrap = upperWick > range * 0.42 && lastM.delta < 0;
      const isBearTrap = lowerWick > range * 0.42 && lastM.delta > 0;
      const isStopHuntVSA = lastM.vsaFriction >= this.params.vsaFrictionThreshold && (isBullTrap || isBearTrap);
      const trapLabel = isStopHuntVSA ? 'STOP-HUNT VSA' : (isBullTrap ? '⚠️ BULL TRAP' : (isBearTrap ? '⚠️ BEAR TRAP' : 'OK'));

      if (lastM.absorption.includes('SHORT')) { score -= 35; reasons.push('Divergenza CVD: Assorbimento Vendite (Short)'); }
      else if (lastM.absorption.includes('LONG')) { score += 35; reasons.push('Divergenza CVD: Assorbimento Acquisti (Long)'); }
      else if (lastM.delta >= 0) { score += 15; reasons.push('Delta Ordini Positivo (Compratori aggressivi)'); }
      else { score -= 15; reasons.push('Delta Ordini Negativo (Venditori aggressivi)'); }

      if (lastC.close >= lastM.avwap) { score += 18; reasons.push('Prezzo sopra VWAP Ancorato'); }
      else { score -= 18; reasons.push('Prezzo sotto VWAP Ancorato'); }

      const isToxic = lastM.vpin >= this.params.vpinToxicThreshold;
      if (isToxic) reasons.push(`Flusso VPIN Tossico (${(lastM.vpin * 100).toFixed(1)}%): Protezione Anti-Fakeout`);
      if (isBullTrap || isBearTrap) {
        score = Math.round(score * 0.4);
        reasons.push(`🚫 Blocco 5-Gate: Rilevato ${trapLabel} su ombra di rigetto con Delta opposto`);
      }

      // 5 Gates evaluation
      let gates = 0;
      if (Math.abs(score) >= 15) gates++; // Gate 1: Struttura/Regime
      if ((score >= 0 && lastC.close >= lastM.avwap) || (score <= 0 && lastC.close <= lastM.avwap)) gates++; // Gate 2: VWAP
      if ((score >= 0 && lastM.delta >= 0) || (score <= 0 && lastM.delta <= 0)) gates++; // Gate 3: Delta/CVD
      if (!isBullTrap && !isBearTrap && !isStopHuntVSA) gates++; // Gate 4: Anti-Trap/Stop-Hunt
      if (!isToxic) gates++; // Gate 5: VPIN Guard
      const confidencePct = Math.min(100, Math.round((gates / 5) * 60 + Math.min(40, Math.abs(score) * 0.5)));

      // Rolling Backtest Live & Half-Kelly
      let wins = 0, losses = 0, grossWin = 0, grossLoss = 0;
      for (let i = 3; i < vis.candles.length - 1; i++) {
        const c = vis.candles[i], m = vis.metrics[i], next = vis.candles[i + 1];
        const bias = (m.delta >= 0 && c.close >= m.avwap) ? 1 : ((m.delta < 0 && c.close < m.avwap) ? -1 : 0);
        if (!bias) continue;
        const ret = ((next.close - c.close) / (c.close || 1)) * bias;
        if (ret > 0) { wins++; grossWin += ret; } else { losses++; grossLoss += Math.abs(ret); }
      }
      const totTrades = wins + losses;
      const winRate = totTrades ? (wins / totTrades) : 0.55;
      const avgWin = wins ? (grossWin / wins) : 0.012;
      const avgLoss = losses ? (grossLoss / losses) : 0.008;
      const pf = grossLoss > 0 ? (grossWin / grossLoss) : 1.45;
      const rr = avgLoss > 0 ? (avgWin / avgLoss) : 1.5;
      const rawKelly = winRate - ((1 - winRate) / Math.max(0.2, rr));
      const kellyPct = Math.max(0.5, Math.min(12.0, +(rawKelly * 50).toFixed(1))); // Half-Kelly prudenziale

      score = Math.max(-100, Math.min(100, Math.round(score)));
      let action = score >= 25 ? 'LONG' : (score <= -25 ? 'SHORT' : 'NEUTRALE');
      if (isBullTrap || isBearTrap) action = `BLOCCATO (${trapLabel})`;

      const dir = score >= 0 ? 1 : -1;
      const atrProxy = Math.max(lastC.close * 0.004, range * 1.4);
      const entry = lastC.close;
      const sl = entry - dir * atrProxy * 1.1;
      const be = entry * (1 + dir * 0.0015);
      const tp1 = entry + dir * atrProxy * 1.2;
      const tp2 = entry + dir * atrProxy * 2.4;
      const tp3 = entry + dir * atrProxy * 3.8;
      this.state.freeRide = { entry, sl, be, tp1, tp2, tp3, dir };

      const minGate = parseInt(this.params.minConfidenceGate, 10) || 70;
      const botArmed = confidencePct >= minGate && !isBullTrap && !isBearTrap && !isToxic && Math.abs(score) >= 25;

      const regEl = document.getElementById('qro-regime-pill');
      if (regEl) regEl.textContent = `Regime: ${regime}`;
      const btEl = document.getElementById('qro-backtest-pill');
      if (btEl) btEl.textContent = `WR ${(winRate * 100).toFixed(0)}% | PF ${pf.toFixed(2)} | Kelly ${kellyPct}%`;
      const armEl = document.getElementById('qro-bot-arm-pill');
      if (armEl) {
        if (botArmed) {
          armEl.textContent = `🟢 AUTO-BOT ARMATO (${confidencePct}% | ${gates}/5 Gate)`;
          armEl.style.color = '#00e676'; armEl.style.borderColor = '#00e676'; armEl.style.background = 'rgba(0,230,118,0.16)';
        } else {
          armEl.textContent = `🔒 BOT BLOCCATO (${confidencePct}% < ${minGate}% | ${trapLabel})`;
          armEl.style.color = '#fbbf24'; armEl.style.borderColor = '#f59e0b'; armEl.style.background = 'rgba(245,158,11,0.16)';
        }
      }

      const dec = this.getPriceDec(lastC.close);
      this.state.signal = {
        score, action, isToxic, confidencePct, gates, botArmed,
        vpinPct: (lastM.vpin * 100).toFixed(1),
        vsaFriction: lastM.vsaFriction.toFixed(2),
        avwap: lastM.avwap.toFixed(dec),
        poc: poc.toFixed(dec),
        absorption: lastM.absorption,
        reasons,
        modeAction: `[${this.params.tradingMode}] ${regime} | Gate ${gates}/5 (${confidencePct}%) | TP1(40%): ${tp1.toFixed(dec)} → 🛡️BE ${be.toFixed(dec)} | Kelly ${kellyPct}%`
      };
    },

    formatTime(ts, withSec = false) {
      const d = new Date(ts);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return withSec ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
    },

    getPriceDec(price) {
      if (window.getDynamicPrecision) return window.getDynamicPrecision(price, window.currentSymbol);
      return Math.abs(price) < 1 ? 5 : (Math.abs(price) < 10 ? 4 : 2);
    },

    updateCrosshairHUD(vis) {
      const hud = document.getElementById('qro-crosshair-hud');
      if (!hud || !vis || !vis.candles.length) return;
      const idx = (this.state.hoverIdx >= 0 && this.state.hoverIdx < vis.candles.length)
        ? this.state.hoverIdx
        : vis.candles.length - 1;
      const c = vis.candles[idx];
      const m = vis.metrics[idx];
      if (!c || !m) return;
      const dec = this.getPriceDec(c.close);
      hud.innerHTML = `🎯 <b>Mirino (${this.state.hoverIdx >= 0 ? 'Cursore' : 'Live'}):</b> Ora <b style="color:#fff;">${this.formatTime(c.time, true)}</b> | Close <b style="color:#00e676;">${c.close.toFixed(dec)}</b> | Delta <b style="color:${m.delta >= 0 ? '#00e676' : '#ff5252'};">${(m.delta / 1000).toFixed(2)}k</b> | CVD <b style="color:#00e5ff;">${(m.cvd / 1000).toFixed(1)}k</b> | VPIN <b style="color:#ffab00;">${(m.vpin * 100).toFixed(1)}%</b> | VSA <b style="color:#e040fb;">${m.vsaFriction.toFixed(2)}</b> | VWAP <b style="color:#38bdf8;">${m.avwap.toFixed(dec)}</b>`;
    },

    drawTimeGrid(ctx, candles, plotW, topPad, botY, H, steps) {
      const n = candles.length;
      if (!n) return;
      const spanMs = Math.abs(candles[n - 1].time - candles[0].time);
      const useSubMin = spanMs < 20 * 60 * 1000;
      let drawn = 0;
      let lastLabelX = -100;
      for (let i = 1; i < n; i++) {
        const dPrev = new Date(candles[i - 1].time);
        const dCur = new Date(candles[i].time);
        let isMajor = false, isMinor = false;
        if (useSubMin) {
          isMajor = dCur.getMinutes() !== dPrev.getMinutes();
          isMinor = !isMajor && Math.floor(dCur.getSeconds() / 15) !== Math.floor(dPrev.getSeconds() / 15);
        } else {
          isMajor = dCur.getHours() !== dPrev.getHours() || dCur.getMinutes() === 0;
          const mCur = dCur.getMinutes(), mPrev = dPrev.getMinutes();
          isMinor = !isMajor && ((mCur >= 30 && mPrev < 30) || (spanMs < 4 * 3600000 && Math.floor(mCur / 15) !== Math.floor(mPrev / 15)));
        }
        if (isMajor || isMinor) {
          const x = (i + 0.5) * (plotW / n);
          ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.035)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, topPad); ctx.lineTo(x, botY); ctx.stroke();
          if (x - lastLabelX >= 44) {
            ctx.fillStyle = isMajor ? '#cbd5e1' : '#64748b';
            ctx.font = isMajor ? 'bold 10px monospace' : '9.5px monospace';
            ctx.fillText(this.formatTime(candles[i].time, useSubMin && isMinor), Math.max(2, x - 14), H - 5);
            lastLabelX = x;
          }
          drawn++;
        }
      }
      if (drawn < 2) {
        const every = Math.max(1, Math.floor(n / Math.max(4, Math.min(16, steps))));
        for (let i = 0; i < n; i += every) {
          const x = (i + 0.5) * (plotW / n);
          ctx.strokeStyle = 'rgba(255,255,255,0.06)';
          ctx.beginPath(); ctx.moveTo(x, topPad); ctx.lineTo(x, botY); ctx.stroke();
          ctx.fillStyle = '#94a3b8';
          ctx.font = '10px monospace';
          ctx.fillText(this.formatTime(candles[i].time), Math.max(2, x - 14), H - 5);
        }
      }
    },

    drawAxisPill(ctx, x, y, w, text, bgColor, textColor = '#020617') {
      const py = Math.max(9, y);
      ctx.fillStyle = bgColor;
      ctx.fillRect(x, py - 8, Math.max(46, w - 4), 15);
      ctx.fillStyle = textColor;
      ctx.font = 'bold 9.5px monospace';
      ctx.fillText(text, x + 4, py + 3);
    },

    drawMagneticCrosshair(ctx, candles, plotW, topPad, botY) {
      const idx = this.state.hoverIdx;
      if (idx < 0 || idx >= candles.length) return;
      const x = (idx + 0.5) * (plotW / candles.length);
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.72)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, topPad); ctx.lineTo(x, botY); ctx.stroke();
      ctx.restore();
    },

    drawCharts(vis) {
      const candles = vis.candles;
      const metrics = vis.metrics;
      if (!candles.length) return;

      const dec = this.getPriceDec(candles[candles.length - 1].close);
      const rightAxisW = parseInt(this.params.rightAxisW, 10) || 68;
      const vrvpZoneW = parseInt(this.params.vrvpZoneW, 10) || 115;
      const candleRatio = (parseFloat(this.params.candleWidthPct) || 72) / 100;
      const gridSteps = parseInt(this.params.timeGridSteps, 10) || 8;

      const cv1 = document.getElementById('qro-subchart-flows');
      if (cv1) {
        cv1.style.minHeight = `${this.params.subChart1Height}px`;
        const ctx = cv1.getContext('2d');
        const W = cv1.width = cv1.clientWidth || 960;
        const H = cv1.height = parseInt(this.params.subChart1Height, 10) || 180;
        ctx.fillStyle = '#060a10'; ctx.fillRect(0, 0, W, H);

        const chartW = W - rightAxisW, plotW = Math.max(60, chartW - vrvpZoneW);
        const stepX = plotW / candles.length, topPad = 14, botPad = 20, plotH = H - topPad - botPad;
        const barW = Math.max(2, Math.min(34, stepX * candleRatio));
        this.drawTimeGrid(ctx, candles, plotW, topPad, H - botPad, H, gridSteps);

        // Filigrana (Watermark) istituzionale
        ctx.save();
        ctx.fillStyle = 'rgba(148, 163, 184, 0.06)';
        ctx.font = 'bold 24px system-ui, monospace';
        ctx.fillText(`${window.currentSymbol || 'TRADING PRO'} • ${window.currentInterval || 'LIVE'}`, 18, Math.round(H * 0.56));
        ctx.restore();

        if (this.params.subChart1Mode === 'CVD_VPIN') {
          const maxD = Math.max(...metrics.map(m => Math.abs(m.delta)), 1);
          const minCVD = Math.min(...metrics.map(m => m.cvd)), maxCVD = Math.max(...metrics.map(m => m.cvd));
          const midY = topPad + plotH * 0.52;

          metrics.forEach((m, i) => {
            const x = (i + 0.5) * stepX;
            const h = (m.delta / maxD) * (plotH * 0.42);
            ctx.fillStyle = m.delta >= 0 ? 'rgba(0,230,118,0.72)' : 'rgba(255,82,82,0.72)';
            ctx.fillRect(x - barW / 2, h >= 0 ? midY - h : midY, barW, Math.max(2, Math.abs(h)));
          });

          ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.8; ctx.beginPath();
          metrics.forEach((m, i) => {
            const x = (i + 0.5) * stepX;
            const y = topPad + plotH - ((m.cvd - minCVD) / (maxCVD - minCVD || 1)) * plotH;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.stroke();

          ctx.strokeStyle = '#ffab00'; ctx.lineWidth = 1.5; ctx.beginPath();
          metrics.forEach((m, i) => {
            const x = (i + 0.5) * stepX;
            const y = topPad + plotH * (1 - m.vpin);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.stroke();
        } else {
          const maxF = Math.max(...metrics.map(m => m.vsaFriction), 3.5);
          metrics.forEach((m, i) => {
            const x = (i + 0.5) * stepX;
            const h = (m.vsaFriction / maxF) * plotH;
            ctx.fillStyle = m.vsaFriction >= this.params.vsaFrictionThreshold ? '#e040fb' : '#26c6da';
            ctx.fillRect(x - barW / 2, topPad + plotH - h, barW, Math.max(2, h));
          });
        }
        const lastFlowM = metrics[metrics.length - 1];
        if (lastFlowM) {
          this.drawAxisPill(ctx, chartW + 2, topPad + 12, rightAxisW, `CVD ${(lastFlowM.cvd / 1000).toFixed(0)}k`, '#00e5ff');
          this.drawAxisPill(ctx, chartW + 2, topPad + plotH - 8, rightAxisW, `VP ${(lastFlowM.vpin * 100).toFixed(0)}%`, '#ffab00');
        }
        this.drawMagneticCrosshair(ctx, candles, plotW, topPad, H - botPad);
      }

      const cv2 = document.getElementById('qro-subchart-base');
      if (cv2) {
        cv2.style.minHeight = `${this.params.subChart2Height}px`;
        const ctx = cv2.getContext('2d');
        const W = cv2.width = cv2.clientWidth || 960;
        const H = cv2.height = parseInt(this.params.subChart2Height, 10) || 260;
        ctx.fillStyle = '#05080e'; ctx.fillRect(0, 0, W, H);

        const minLow = Math.min(...candles.map(c => c.low));
        const maxHigh = Math.max(...candles.map(c => c.high));
        const padP = Math.max(1e-6, (maxHigh - minLow) * 0.12);
        const minP = minLow - padP, maxP = maxHigh + padP;

        const chartW = W - rightAxisW, plotW = Math.max(60, chartW - vrvpZoneW);
        const stepX = plotW / candles.length, topPad = 14, botPad = 22, plotH = H - topPad - botPad;
        const yOf = (p) => topPad + ((maxP - p) / (maxP - minP || 1e-8)) * plotH;

        this.drawTimeGrid(ctx, candles, plotW, topPad, H - botPad, H, gridSteps);

        // Filigrana (Watermark) istituzionale
        ctx.save();
        ctx.fillStyle = 'rgba(148, 163, 184, 0.06)';
        ctx.font = 'bold 24px system-ui, monospace';
        ctx.fillText(`${window.currentSymbol || 'TRADING PRO'} • ${window.currentInterval || 'LIVE'}`, 18, Math.round(H * 0.56));
        ctx.restore();

        for (let g = 0; g <= 4; g++) {
          const y = topPad + (g / 4) * plotH;
          ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
          ctx.fillStyle = '#8fa1b3'; ctx.font = '10px monospace';
          ctx.fillText((maxP - (g / 4) * (maxP - minP)).toFixed(dec), chartW + 5, y + 3);
        }

        // Fascia Value Area 70% (VAH / VAL)
        if (this.params.showValueArea && this.state.vpLevels.vah && this.state.vpLevels.val) {
          const yVah = yOf(this.state.vpLevels.vah), yVal = yOf(this.state.vpLevels.val);
          ctx.fillStyle = 'rgba(0, 229, 255, 0.07)';
          ctx.fillRect(0, Math.min(yVah, yVal), chartW, Math.abs(yVal - yVah));
          ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(0, yVah); ctx.lineTo(chartW, yVah); ctx.moveTo(0, yVal); ctx.lineTo(chartW, yVal); ctx.stroke();
          ctx.setLineDash([]);
        }

        // Linea POC tratteggiata oro
        if (this.params.showPocLine && this.state.vpLevels.poc) {
          const yPoc = yOf(this.state.vpLevels.poc);
          ctx.strokeStyle = '#ffd54f';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(0, yPoc); ctx.lineTo(chartW, yPoc); ctx.stroke();
          ctx.setLineDash([]);
        }

        const barW = Math.max(2, Math.min(34, stepX * candleRatio));
        candles.forEach((c, i) => {
          const m = metrics[i];
          const x = (i + 0.5) * stepX;
          let col = c.close >= c.open ? '#00e676' : '#ff5252';
          if (m.vpin >= this.params.vpinToxicThreshold) col = '#ff9100';
          else if (m.vsaFriction >= this.params.vsaFrictionThreshold) col = '#e040fb';

          ctx.strokeStyle = col; ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(x, yOf(c.high)); ctx.lineTo(x, yOf(c.low)); ctx.stroke();
          ctx.fillRect(x - barW / 2, yOf(Math.max(c.open, c.close)), barW, Math.max(2, yOf(Math.min(c.open, c.close)) - yOf(Math.max(c.open, c.close))));
        });

        // Curva VWAP Ancorato (#38bdf8) + Bande ±1σ con area sfumata
        if (this.params.showAvwap) {
          ctx.save();
          ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
          ctx.beginPath();
          metrics.forEach((m, i) => {
            const x = (i + 0.5) * stepX;
            const y = yOf(m.avwapUp1);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          for (let i = metrics.length - 1; i >= 0; i--) {
            const x = (i + 0.5) * stepX;
            ctx.lineTo(x, yOf(metrics[i].avwapDn1));
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          const drawBand = (getter, col, w, dash) => {
            ctx.save();
            ctx.strokeStyle = col;
            ctx.lineWidth = w;
            ctx.setLineDash(dash);
            ctx.beginPath();
            metrics.forEach((m, i) => {
              const x = (i + 0.5) * stepX;
              const y = yOf(getter(m));
              if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.restore();
          };
          drawBand(m => m.avwapUp1, 'rgba(56, 189, 248, 0.38)', 1, [3, 3]);
          drawBand(m => m.avwapDn1, 'rgba(56, 189, 248, 0.38)', 1, [3, 3]);
          drawBand(m => m.avwap, '#38bdf8', 1.8, []);
        }

        // Scaglioni Free-Ride (TP1 40% -> BE +0.15%, TP2 40%, TP3 20% Runner, SL)
        if (this.params.showFreeRideLevels && this.state.freeRide) {
          const fr = this.state.freeRide;
          const drawFR = (price, lbl, col) => {
            const y = yOf(price);
            if (y < topPad || y > H - botPad) return;
            ctx.save();
            ctx.strokeStyle = col;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
            ctx.fillStyle = 'rgba(6, 10, 18, 0.85)';
            ctx.fillRect(6, y - 11, 136, 13);
            ctx.fillStyle = col;
            ctx.font = 'bold 9.5px monospace';
            ctx.fillText(`${lbl} ${price.toFixed(dec)}`, 9, y - 1);
            ctx.restore();
          };
          drawFR(fr.tp3, 'TP3 20% Run', '#00e5ff');
          drawFR(fr.tp2, 'TP2 40%', '#00e676');
          drawFR(fr.tp1, 'TP1 40%→🛡️BE', '#a7f3d0');
          drawFR(fr.sl, 'SL Iniz.', '#ff5252');
        }

        // Pillole Prezzo Live Colorate sull'Asse Destro (Prezzo, POC, VWAP)
        const lastC = candles[candles.length - 1];
        const lastM = metrics[metrics.length - 1];
        if (this.params.showAvwap && lastM) {
          this.drawAxisPill(ctx, chartW + 2, yOf(lastM.avwap), rightAxisW, lastM.avwap.toFixed(dec), '#38bdf8');
        }
        if (this.params.showPocLine && this.state.vpLevels.poc) {
          this.drawAxisPill(ctx, chartW + 2, yOf(this.state.vpLevels.poc), rightAxisW, this.state.vpLevels.poc.toFixed(dec), '#ffd54f');
        }
        if (lastC) {
          this.drawAxisPill(ctx, chartW + 2, yOf(lastC.close), rightAxisW, lastC.close.toFixed(dec), lastC.close >= lastC.open ? '#00e676' : '#ff5252');
        }

        (this.state.vpLevels.bins || []).forEach(b => {
          const y1 = yOf(b.priceHigh), y2 = yOf(b.priceLow);
          const bh = Math.max(2, Math.abs(y2 - y1) - 1), bw = b.pct * (vrvpZoneW - 6);
          const xRight = chartW - 2;
          ctx.fillStyle = b.type === 'POC' ? 'rgba(255,213,79,0.88)' : (b.type === 'HVN' ? 'rgba(0,229,255,0.55)' : (b.type === 'LVN' ? 'rgba(255,64,129,0.50)' : 'rgba(148,163,184,0.28)'));
          ctx.fillRect(xRight - bw, Math.min(y1, y2), bw, bh);
          if (bh >= 7) {
            ctx.fillStyle = '#e2e8f0'; ctx.font = '8.5px monospace';
            ctx.fillText(b.intensityLabel, xRight - 50, Math.min(y1, y2) + bh - 1);
          }
        });

        this.drawMagneticCrosshair(ctx, candles, plotW, topPad, H - botPad);
      }
    },

    updateHUD() {
      const s = this.state.signal;
      const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setTxt('qro-kpi-score', `${s.score > 0 ? '+' : ''}${s.score}/100`);
      setTxt('qro-kpi-action', s.action);
      setTxt('qro-kpi-vpin', `${s.vpinPct}% ${s.isToxic ? '⚠️' : 'OK'}`);
      setTxt('qro-kpi-vsa', s.vsaFriction);
      setTxt('qro-kpi-avwap', `${s.avwap}`);
      setTxt('qro-kpi-abs', s.absorption);
      setTxt('qro-mode-banner', s.modeAction);

      const ul = document.getElementById('qro-reasons-list');
      if (ul && s.reasons) ul.innerHTML = s.reasons.map(r => `<li>${r}</li>`).join('');
    },

    async runFreeAIAudit() {
      const out = document.getElementById('qro-audit-output');
      if (out) out.innerHTML = '⏳ Audit Sotto-Direttore CED in corso tramite router AI Free...';
      const s = this.state.signal;
      const prompt = `Analisi setup: Score=${s.score}/100, Action=${s.action}, VPIN=${s.vpinPct}%, Attrito VSA=${s.vsaFriction}, VWAP=${s.avwap}, POC=${s.poc}. Dammi piano operativo in 2 righe con Entry, TP1, TP2 e SL.`;
      if (window.FreeLLMRouter && typeof window.FreeLLMRouter.complete === 'function') {
        const res = await window.FreeLLMRouter.complete(prompt);
        if (out) out.innerHTML = res.ok ? `🟢 <b>[${res.model} — 0€]</b>: ${res.reply}` : `🟢 <b>Piano Calcolato</b>: ${s.modeAction}`;
      } else if (out) {
        out.innerHTML = `🟢 <b>Piano Calcolato</b>: ${s.modeAction}`;
      }
    }
  };

  window.QuantReadonlyAddon = QuantReadonlyAddon;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => QuantReadonlyAddon.init());
  } else {
    QuantReadonlyAddon.init();
  }
})();
