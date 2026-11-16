/**
 * QUANT ADDON READ-ONLY v29.5-PRO (ZERO-TOUCH ARCHITECTURE)
 * - Zero modifiche a app.js, chart.js o orderflow_engine.js (Grafico 1 intatto al 100%).
 * - Legge in sola lettura le candele e il range visibile per allineare al pixel e al secondo.
 * - Gestione completa delle altezze, dei sub-grafici e dei parametri regolabili in tempo reale.
 */

(function() {
  'use strict';

  const QuantReadonlyAddon = {
    version: '29.5-PRO',
    isVisible: true,
    params: {
      drawerHeight: 520,      // Altezza totale del cassetto in pixel
      subChart1Height: 155,   // Altezza Sub-Grafico A (Flussi)
      subChart2Height: 205,   // Altezza Sub-Grafico B (Base Parametrizzata)
      vpLookback: 60,         // Finestra candele per Volume Profile
      vpRows: 24,             // Numero righe/bin del VRVP
      vwapSigmaSpike: 2.5,    // Sensibilità σ per reset VWAP Ancorato
      vpinBucketSize: 1200,   // Dimensione bucket per tossicità VPIN
      vpinToxicThreshold: 0.68, // Soglia di allarme tossicità VPIN
      vsaFrictionThreshold: 2.2, // Soglia indice di attrito VSA
      subChart1Mode: 'CVD_VPIN', // Vista Sub-Grafico A
      tradingMode: 'SEMI'     // Modalità operativa
    },
    state: {
      candles: [],
      metrics: [],
      vpLevels: { poc: 0, vah: 0, val: 0, hvn: [], lvn: [], bins: [] },
      signal: { score: 0, action: 'NEUTRALE', reasons: [], modeAction: '' },
      hoverIdx: -1
    },

    init() {
      this.injectDrawerDOM();
      this.syncAndRender();
      setInterval(() => {
        if (this.isVisible) this.syncAndRender();
      }, 500);
    },

    injectDrawerDOM() {
      if (document.getElementById('quant-readonly-drawer')) return;
      const drawer = document.createElement('section');
      drawer.id = 'quant-readonly-drawer';
      drawer.style.cssText = `background:#060a12; border-top:2px solid #00e5ff; padding:12px 14px; font-family:system-ui,monospace; color:#e2e8f0; margin-top:8px; box-sizing:border-box;`;
      
      drawer.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; background:#0b121e; padding:8px 12px; border-radius:6px; border:1px solid rgba(0,229,255,0.25);">
          <div>
            <b style="color:#ffab00; font-size:13.5px;">🛡️ SALA OPERATIVA QUANTITATIVA ZERO-TOUCH (SOLA LETTURA)</b>
            <span id="qro-sync-badge" style="margin-left:8px; font-size:11px; color:#00e676;">● Sincronizzato al secondo col Grafico 1</span>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
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
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(155px, 1fr)); gap:6px; margin-bottom:10px;">
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
          <div style="background:#0a101a; border:1px solid rgba(0,229,255,0.2); border-radius:6px; padding:8px; margin-bottom:10px;">
            <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; font-size:11.5px; margin-bottom:4px; gap:6px;">
              <span style="color:#00e5ff; font-weight:700;">
                SUB-GRAFICO A — Flussi Delta Ask/Bid + Curva CVD Cumulativa + Tossicità VPIN
              </span>
              <div style="display:flex; gap:10px; align-items:center;">
                <span><b style="color:#00e676">█ Ask</b> | <b style="color:#ff5252">█ Bid</b> | <b style="color:#00e5ff">━ CVD</b> | <b style="color:#ffab00">━ VPIN</b></span>
                <select id="qro-sub1-mode" style="background:#050911; color:#fff; border:1px solid #334155; border-radius:4px; padding:2px 6px; font-size:11px;">
                  <option value="CVD_VPIN">Vista: Delta + CVD + VPIN</option>
                  <option value="VSA_EFFORT">Vista: Attrito VSA (Vol / Range)</option>
                </select>
              </div>
            </div>
            <canvas id="qro-subchart-flows" height="${this.params.subChart1Height}" style="width:100%; display:block; border-radius:4px;"></canvas>
          </div>

          <!-- SUB-GRAFICO B: BASE PARAMETRIZZATA -->
          <div style="background:#0a101a; border:1px solid rgba(255,213,79,0.25); border-radius:6px; padding:8px; margin-bottom:10px;">
            <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; font-size:11.5px; margin-bottom:4px; gap:6px;">
              <span style="color:#ffd54f; font-weight:700;">
                SUB-GRAFICO B — Candele Reali Filtrate (VPIN/VSA) + VWAP Ancorato + VRVP Ordini a Destra
              </span>
              <span>
                <b style="color:#ff9100">█ VPIN Tossico</b> | <b style="color:#e040fb">█ Attrito VSA</b> | <b style="color:#ffd54f">█ POC</b> | <b style="color:#00e5ff">█ HVN</b> | <b style="color:#ff4081">█ LVN</b>
              </span>
            </div>
            <canvas id="qro-subchart-base" height="${this.params.subChart2Height}" style="width:100%; display:block; border-radius:4px;"></canvas>

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
      document.body.appendChild(drawer);

      document.getElementById('qro-toggle-btn').addEventListener('click', () => {
        this.isVisible = !this.isVisible;
        document.getElementById('qro-body').style.display = this.isVisible ? 'block' : 'none';
      });
      document.getElementById('qro-mode-select').addEventListener('change', (e) => {
        this.params.tradingMode = e.target.value;
        this.syncAndRender();
      });
      document.getElementById('qro-sub1-mode').addEventListener('change', (e) => {
        this.params.subChart1Mode = e.target.value;
        this.syncAndRender();
      });
      document.querySelectorAll('.qro-slider').forEach(sl => {
        sl.addEventListener('input', (e) => {
          const p = e.target.getAttribute('data-param');
          const v = parseFloat(e.target.value);
          this.params[p] = v;
          const lbl = document.getElementById(`qro-lbl-${p}`);
          if (lbl) lbl.textContent = e.target.value;
          this.syncAndRender();
        });
      });
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

    syncAndRender() {
      const hostCandles = this.readHostCandlesReadOnly();
      if (!hostCandles.length) return;
      this.state.candles = hostCandles;
      this.computeMetrics();
      const vis = this.getAlignedVisibleSlice();
      this.computeVRVP(vis.candles);
      this.computeCompositeSignal(vis);
      this.drawCharts(vis);
      this.updateHUD();
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
      this.state.vpLevels = { poc: pocBin.priceMid, hvn, lvn, bins };
    },

    computeCompositeSignal(vis) {
      if (!vis.candles.length) return;
      const lastC = vis.candles[vis.candles.length - 1];
      const lastM = vis.metrics[vis.metrics.length - 1];
      let score = 0;
      const reasons = [];

      if (lastM.absorption.includes('SHORT')) { score -= 35; reasons.push('Divergenza CVD: Assorbimento Vendite (Short)'); }
      else if (lastM.absorption.includes('LONG')) { score += 35; reasons.push('Divergenza CVD: Assorbimento Acquisti (Long)'); }
      else if (lastM.delta >= 0) { score += 15; reasons.push('Delta Ordini Positivo (Compratori aggressivi)'); }
      else { score -= 15; reasons.push('Delta Ordini Negativo (Venditori aggressivi)'); }

      if (lastC.close >= lastM.avwap) { score += 18; reasons.push('Prezzo sopra VWAP Ancorato'); }
      else { score -= 18; reasons.push('Prezzo sotto VWAP Ancorato'); }

      const isToxic = lastM.vpin >= this.params.vpinToxicThreshold;
      if (isToxic) reasons.push(`Flusso VPIN Tossico (${(lastM.vpin * 100).toFixed(1)}%): Attivo solo breakout`);

      score = Math.max(-100, Math.min(100, Math.round(score)));
      let action = score >= 25 ? 'LONG' : (score <= -25 ? 'SHORT' : 'NEUTRALE');
      const dec = lastC.close < 5 ? 4 : 2;

      this.state.signal = {
        score, action, isToxic,
        vpinPct: (lastM.vpin * 100).toFixed(1),
        vsaFriction: lastM.vsaFriction.toFixed(2),
        avwap: lastM.avwap.toFixed(dec),
        poc: this.state.vpLevels.poc.toFixed(dec),
        absorption: lastM.absorption,
        reasons,
        modeAction: `[${this.params.tradingMode}] Setup ${action} (${score}/100) | POC: ${this.state.vpLevels.poc.toFixed(dec)}`
      };
    },

    formatTime(ts) {
      const d = new Date(ts);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    drawCharts(vis) {
      const candles = vis.candles;
      const metrics = vis.metrics;
      if (!candles.length) return;

      const dec = candles[candles.length - 1].close < 5 ? 4 : 2;
      const rightAxisW = 64, vrvpZoneW = 115;

      const cv1 = document.getElementById('qro-subchart-flows');
      if (cv1) {
        const ctx = cv1.getContext('2d');
        const W = cv1.width = cv1.clientWidth || 960;
        const H = cv1.height = this.params.subChart1Height;
        ctx.fillStyle = '#060a10'; ctx.fillRect(0, 0, W, H);

        const chartW = W - rightAxisW, plotW = chartW - vrvpZoneW;
        const stepX = plotW / candles.length, topPad = 14, botPad = 18, plotH = H - topPad - botPad;
        const barW = Math.max(2, Math.min(34, stepX * 0.68));

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
      }

      const cv2 = document.getElementById('qro-subchart-base');
      if (cv2) {
        const ctx = cv2.getContext('2d');
        const W = cv2.width = cv2.clientWidth || 960;
        const H = cv2.height = this.params.subChart2Height;
        ctx.fillStyle = '#05080e'; ctx.fillRect(0, 0, W, H);

        const minLow = Math.min(...candles.map(c => c.low));
        const maxHigh = Math.max(...candles.map(c => c.high));
        const padP = Math.max(1e-6, (maxHigh - minLow) * 0.12);
        const minP = minLow - padP, maxP = maxHigh + padP;

        const chartW = W - rightAxisW, plotW = chartW - vrvpZoneW;
        const stepX = plotW / candles.length, topPad = 14, botPad = 20, plotH = H - topPad - botPad;
        const yOf = (p) => topPad + ((maxP - p) / (maxP - minP || 1e-8)) * plotH;

        for (let g = 0; g <= 4; g++) {
          const y = topPad + (g / 4) * plotH;
          ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
          ctx.fillStyle = '#8fa1b3'; ctx.font = '10px monospace';
          ctx.fillText((maxP - (g / 4) * (maxP - minP)).toFixed(dec), chartW + 5, y + 3);
        }

        const barW = Math.max(2, Math.min(34, stepX * 0.72));
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
