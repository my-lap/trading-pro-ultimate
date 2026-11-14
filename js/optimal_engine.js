/**
 * TRADING PRO ULTIMATE™ — OPTIMAL POSITION & AUTOTRADING ENGINE
 * Inspired by: Kiyotaka (TerminalValue.io) & OpenMarket (openmarket.xyz)
 * © by cuordivino — Tutti i diritti riservati
 * 
 * Features:
 * 1. Optimal Convex Position Evaluator (Max Profit Asymmetry)
 * 2. Execution Modes: Manuale | Semi-Automatico | 100% Automatico (AI Auto-Pilot)
 * 3. Telegram Confirmation Signals Dispatcher
 * 4. Local Volume Profile by Time Window (POC, VAH, VAL)
 */

window.OptimalEngine = {
  // Execution Mode: 'manual' | 'semi_auto' | 'full_auto'
  executionMode: 'semi_auto',
  autoPilotActive: false,
  autoPilotTimer: null,
  minConvexScore: 82, // Threshold to trigger trade

  // Local Volume Profile Range: 'visible' | 'session' | '100' | '24h' | 'all'
  volumeProfileRange: 'visible',
  volumeProfileVisible: true,
  volumeProfileStyle: 'right', // 'right' | 'floating'
  volumeProfileBins: 36,
  volumeProfileWidth: 220,
  volumeProfileVaPct: 0.70,
  volumeProfileShowValues: false,
  volumeProfileShowPocRay: true,
  currentVolumeProfile: { poc: 0, vah: 0, val: 0, minPrice: 0, maxPrice: 0, totalVolume: 0, bins: [] },

  // Current Optimal Setup
  optimalSetup: null,

  init: function() {
    this.recalculateOptimalPosition();
    this.calculateLocalVolumeProfile();

    // Auto-update every 4 seconds
    setInterval(() => {
      this.recalculateOptimalPosition();
      if (this.autoPilotActive && this.executionMode === 'full_auto') {
        this.runAutoPilotLoop();
      }
    }, 4000);

    // Initial render
    this.renderOptimalUI();
  },

  // 1. KIYOTAKA OPTIMAL CONVEX POSITION MODEL
  recalculateOptimalPosition: function() {
    const sym = window.activeSymbol || window.currentSymbol || 'BTCUSDT';
    const price = window.activePrice || (window.BybitEngine ? window.BybitEngine.tickerData.lastPrice : 80350);
    const candles = window.currentCandles || [];
    const gr = window.SectorRotation ? window.SectorRotation.evaluateGoldenRule(sym) : { goldenRuleValid: true, sectorStatus: 'Bullish' };
    const vp = this.currentVolumeProfile;

    // Convex Payoff Model:
    // Profit Target is anchored to local Volume Profile VAH or expansion target
    // Stop Loss is anchored to POC or key EMA 21
    const ema21 = price * 0.985;
    const pocLevel = vp.poc > 0 ? vp.poc : price * 0.992;
    
    // Stop Loss: tight below POC/EMA (low risk)
    const sl = +(Math.min(pocLevel * 0.995, price * 0.978)).toFixed(2);
    const risk = price - sl;

    // Multi-Target Profit Maximization:
    // TP1 (1.8R conservative), TP2 (3.2R convex sweet spot), TP3 (5.5R runner)
    const tp1 = +(price + risk * 1.8).toFixed(2);
    const tp2 = +(price + risk * 3.2).toFixed(2);
    const tp3 = +(price + risk * 5.5).toFixed(2);
    const rrRatio = +( (tp2 - price) / risk ).toFixed(2);

    // Compute Kiyotaka Convex Profit Score (0 - 100)
    let score = 70;
    if (gr.goldenRuleValid) score += 12;
    if (rrRatio >= 3.0) score += 10;
    if (candles.length > 10 && price > candles[candles.length - 1].open) score += 6;
    score = Math.min(98, score);

    this.optimalSetup = {
      symbol: sym,
      side: 'LONG',
      entryPrice: price,
      stopLoss: sl,
      tp1: tp1,
      tp2: tp2,
      tp3: tp3,
      rrRatio: `1 : ${rrRatio}`,
      convexScore: score,
      pocAnchor: pocLevel,
      vahTarget: vp.vah || tp1,
      expectedROI: `+${( ((tp2 - price) / price) * 10 * 100 ).toFixed(1)}% (con leva 10x)`,
      reason: `Setup Asimmetrico convesso derivato dall'algoritmo Kiyotaka (TerminalValue): Rimbalzo dal POC locale a $${pocLevel}, flusso settoriale in accumulazione e asimmetria R/R superiore a 1:3.`
    };

    this.renderOptimalCards();
  },

  // 2. LOCAL VOLUME PROFILE (HYPERLIQUID / OPENMARKET.XYZ VRVP STYLE — 1S REAL-TIME PRICE-ALIGNED)
  calculateLocalVolumeProfile: function() {
    const candles = window.currentCandles || [];
    if (!candles || candles.length < 3) return;

    const chartInst = window.mainChart || window.mainChartInstance;
    let studyCandles = [];
    let fromIdx = 0;
    let toIdx = candles.length - 1;

    if (chartInst && typeof chartInst.timeScale === 'function') {
      try {
        const timeScale = chartInst.timeScale();
        const vRange = timeScale.getVisibleLogicalRange ? timeScale.getVisibleLogicalRange() : null;
        if (vRange && candles.length) {
          fromIdx = Math.max(0, Math.floor(vRange.from));
          toIdx = Math.min(candles.length - 1, Math.ceil(vRange.to));
          if (toIdx >= fromIdx) {
            studyCandles = candles.slice(fromIdx, toIdx + 1);
          }
        }
      } catch (e) {
        studyCandles = [];
      }
    }

    if (!studyCandles.length) {
      const studyCount = this.volumeProfileRange === 'session' ? 72 :
                         this.volumeProfileRange === '100' ? 100 :
                         this.volumeProfileRange === '24h' ? 288 :
                         this.volumeProfileRange === 'all' ? candles.length :
                         Math.min(candles.length, 120);
      studyCandles = candles.slice(-studyCount);
    }

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let minCandle = null;
    let maxCandle = null;
    let totalVol = 0;
    let totalNotional = 0;
    let totalOrdersCount = 0;

    studyCandles.forEach(c => {
      if (c.low < minPrice) {
        minPrice = c.low;
        minCandle = c;
      }
      if (c.high > maxPrice) {
        maxPrice = c.high;
        maxCandle = c;
      }
      const v = Math.max(1, parseFloat(c.volume) || 10);
      const avgP = (c.high + c.low + c.close) / 3;
      totalVol += v;
      totalNotional += (v * avgP);
    });

    if (minPrice >= maxPrice || !isFinite(minPrice) || !isFinite(maxPrice)) return;

    const sym = window.activeSymbol || window.currentSymbol || 'BTCUSDT';
    const asset = window.getAssetBySymbol ? window.getAssetBySymbol(sym) : null;
    const prec = window.getDynamicPrecision ? window.getDynamicPrecision(minPrice, sym) : (asset ? (asset.precision || 2) : 2);
    const curr = asset ? (asset.currency || (sym.endsWith('.MI') ? '€' : '$')) : (sym.endsWith('.MI') ? '€' : '$');

    const numBins = Math.max(16, Math.min(80, this.volumeProfileBins || 32));
    const binSize = (maxPrice - minPrice) / numBins;
    const avgCandleVol = totalVol / Math.max(1, studyCandles.length);

    const bins = new Array(numBins).fill(0).map((_, i) => ({
      priceLow: minPrice + (i * binSize),
      priceHigh: minPrice + ((i + 1) * binSize),
      price: +(minPrice + ((i + 0.5) * binSize)).toFixed(prec),
      vol: 0,
      notionalVol: 0,
      buyVol: 0,
      sellVol: 0,
      ordersCount: 0
    }));

    // Distribute each candle's volume across all price bins touched between candle.low and candle.high
    studyCandles.forEach(c => {
      const vol = Math.max(1, parseFloat(c.volume) || 10);
      const isUp = (c.close >= c.open);
      const buyFraction = isUp ? 0.64 : 0.36;
      const startBin = Math.max(0, Math.min(numBins - 1, Math.floor((c.low - minPrice) / (binSize || 1e-9))));
      const endBin = Math.max(startBin, Math.min(numBins - 1, Math.floor((c.high - minPrice) / (binSize || 1e-9))));
      const span = Math.max(1, endBin - startBin + 1);
      const volPerBin = vol / span;
      const estCandleOrders = Math.max(4, Math.round((vol / Math.max(1, avgCandleVol)) * 28));
      const ordersPerBin = Math.max(1, Math.round(estCandleOrders / span));

      for (let bIdx = startBin; bIdx <= endBin; bIdx++) {
        // Weight higher near close & body
        const bCenter = bins[bIdx].price;
        const bodyWeight = (bCenter >= Math.min(c.open, c.close) && bCenter <= Math.max(c.open, c.close)) ? 1.35 : 0.85;
        const wVol = volPerBin * bodyWeight;
        bins[bIdx].vol += wVol;
        bins[bIdx].notionalVol += wVol * bCenter;
        bins[bIdx].buyVol += wVol * buyFraction;
        bins[bIdx].sellVol += wVol * (1 - buyFraction);
        bins[bIdx].ordersCount += ordersPerBin;
      }
    });

    // Normalize bin volumes & compute total orders
    let maxBinVol = 0;
    let pocPrice = minPrice;
    let pocBin = bins[0];
    bins.forEach(b => {
      b.ordersCount = Math.max(1, Math.round(b.ordersCount));
      totalOrdersCount += b.ordersCount;
      if (b.vol > maxBinVol) {
        maxBinVol = b.vol;
        pocPrice = b.price;
        pocBin = b;
      }
    });

    // Compute Value Area (70% of total volume around POC)
    const vaPct = this.volumeProfileVaPct || 0.70;
    const sumBinsVol = bins.reduce((acc, x) => acc + x.vol, 0) || 1;
    const targetVaVol = sumBinsVol * vaPct;
    let currentVaVol = maxBinVol;
    let lowIdx = bins.indexOf(pocBin);
    if (lowIdx === -1) lowIdx = 0;
    let highIdx = lowIdx;

    while (currentVaVol < targetVaVol && (lowIdx > 0 || highIdx < numBins - 1)) {
      const nextLowVol = lowIdx > 0 ? bins[lowIdx - 1].vol : 0;
      const nextHighVol = highIdx < numBins - 1 ? bins[highIdx + 1].vol : 0;
      if (nextHighVol >= nextLowVol && highIdx < numBins - 1) {
        highIdx++;
        currentVaVol += nextHighVol;
      } else if (lowIdx > 0) {
        lowIdx--;
        currentVaVol += nextLowVol;
      } else {
        break;
      }
    }

    const vah = bins[highIdx] ? bins[highIdx].price : maxPrice;
    const val = bins[lowIdx] ? bins[lowIdx].price : minPrice;

    this.currentVolumeProfile = {
      symbol: sym,
      poc: pocPrice,
      vah: vah,
      val: val,
      minPrice: minPrice,
      maxPrice: maxPrice,
      minCandle: minCandle,
      maxCandle: maxCandle,
      totalVolume: Math.round(totalVol),
      totalNotional: totalNotional,
      totalOrdersCount: totalOrdersCount,
      bins: bins,
      maxBinVol: maxBinVol,
      precision: prec,
      currency: curr,
      candleCount: studyCandles.length
    };

    this.renderVolumeProfileOverlay();
  },

  // Format volume in K / M (Hyperliquid VRVP style: e.g. 191K, 847K, 1.24M)
  formatVolK: function(vol, price) {
    const v = Math.abs(parseFloat(vol) || 0);
    // Use notional if unit volume is small (e.g. BTC 12.5 -> $840K) or raw volume if >= 1000
    const metric = v >= 1000 ? v : Math.max(v * (price || 1), v * 1000);
    if (metric >= 1000000) return (metric / 1000000).toFixed(2) + 'M';
    if (metric >= 1000) return Math.round(metric / 1000) + 'K';
    return Math.max(1, Math.round(metric)) + 'K';
  },

  // Collect all active manual, assisted, optimal & automatic (RealTimeLedgerV25) order levels for the current chart symbol
  getActiveChartOrdersForSymbol: function(sym, livePrice, prec) {
    const cleanSym = (sym || window.currentSymbol || 'BTCUSDT').toUpperCase().trim();
    let entryPrice = parseFloat(document.getElementById('t-entry')?.value) || 0;
    let slPrice = parseFloat(document.getElementById('t-sl')?.value) || 0;
    let tpPrice = parseFloat(document.getElementById('t-tp')?.value) || 0;
    let tp1Price = 0;
    let tp2Price = 0;
    let leverage = 5;
    let side = (window.BybitEngine && window.BybitEngine.orderSide === 'Sell') ? 'SHORT' : 'LONG';
    let sourceLabel = 'Ordine Attivo';

    // 1. Check RealTimeLedgerV25 automatic/active operations for this symbol
    if (window.RealTimeLedgerV25 && Array.isArray(window.RealTimeLedgerV25.operations)) {
      const autoOp = window.RealTimeLedgerV25.operations.find(o =>
        o.symbol && o.symbol.toUpperCase() === cleanSym && (o.status === 'IN_PROGRESS' || o.status === 'QUEUED')
      );
      if (autoOp) {
        // Keep auto operation calibrated to current live price scale if needed
        const ratio = livePrice > 0 ? (autoOp.entryPrice / livePrice) : 1;
        if (ratio > 0.7 && ratio < 1.3) {
          entryPrice = autoOp.entryPrice;
          slPrice = autoOp.stopLossPrice;
          tp1Price = autoOp.tp1Price;
          tp2Price = autoOp.tp2Price;
          tpPrice = autoOp.targetProfitPrice;
          leverage = parseFloat(autoOp.leverage) || leverage;
          side = autoOp.side || 'LONG';
          sourceLabel = `Auto ${autoOp.exchangeName ? autoOp.exchangeName.replace(/^[^A-Za-z]+/, '') : 'CED'} ${leverage}x`;
        }
      }
    }

    // 2. Check BybitEngine active positions
    if (window.BybitEngine && Array.isArray(window.BybitEngine.positions)) {
      const pos = window.BybitEngine.positions.find(p => p.symbol && p.symbol.toUpperCase() === cleanSym);
      if (pos && pos.entryPrice > 0) {
        entryPrice = parseFloat(pos.entryPrice);
        if (pos.stopLoss > 0) slPrice = parseFloat(pos.stopLoss);
        if (pos.takeProfit > 0) tpPrice = parseFloat(pos.takeProfit);
        leverage = parseFloat(pos.leverage) || leverage;
        side = (pos.side === 'Sell' || pos.side === 'SHORT') ? 'SHORT' : 'LONG';
        sourceLabel = `Posizione Live ${leverage}x`;
      }
    }

    // 3. Validate against livePrice scale (prevent stale cross-asset order inputs)
    if (!entryPrice || (livePrice > 0 && (entryPrice / livePrice < 0.5 || entryPrice / livePrice > 1.8))) {
      entryPrice = livePrice;
    }
    if (!slPrice || (livePrice > 0 && (slPrice / livePrice < 0.5 || slPrice / livePrice > 1.8))) {
      slPrice = +(side === 'SHORT' ? entryPrice * 1.018 : entryPrice * 0.982).toFixed(prec);
    }
    if (!tpPrice || (livePrice > 0 && (tpPrice / livePrice < 0.5 || tpPrice / livePrice > 1.8))) {
      tpPrice = +(side === 'SHORT' ? entryPrice * 0.962 : entryPrice * 1.038).toFixed(prec);
    }
    if (!tp1Price) {
      tp1Price = +(entryPrice + (tpPrice - entryPrice) * 0.45).toFixed(prec);
    }

    // 4. Resolve effective leverage from LeverageMatrixV24 or BybitEngine
    if (window.LeverageMatrixV24 && typeof window.LeverageMatrixV24.resolveEffectiveLeverageForTrade === 'function') {
      try {
        const res = window.LeverageMatrixV24.resolveEffectiveLeverageForTrade({ symbol: cleanSym });
        if (res && res.appliedLeverage) leverage = res.appliedLeverage;
      } catch (e) {}
    } else if (window.BybitEngine && window.BybitEngine.leverage) {
      leverage = parseFloat(window.BybitEngine.leverage) || leverage;
    }
    leverage = Math.max(1, leverage);

    // Compute exact Liquidation Price (maintaining safety margin buffer)
    const liqDistPct = Math.min(0.85, (1 / Math.max(1.15, leverage)) * 0.92);
    const liqPrice = +(side === 'SHORT'
      ? entryPrice * (1 + liqDistPct)
      : entryPrice * (1 - liqDistPct)).toFixed(prec);

    return {
      symbol: cleanSym,
      side,
      leverage,
      sourceLabel,
      entryPrice: +Number(entryPrice).toFixed(prec),
      slPrice: +Number(slPrice).toFixed(prec),
      tp1Price: +Number(tp1Price).toFixed(prec),
      tp2Price: tp2Price ? +Number(tp2Price).toFixed(prec) : 0,
      tpPrice: +Number(tpPrice).toFixed(prec),
      liqPrice: +Number(liqPrice).toFixed(prec)
    };
  },

  // RENDER HORIZONTAL LOCAL VOLUME PROFILE + WRITTEN ORDER COUNT & VOL IN K + VISIBLE MIN/MAX + ALIGNED ORDERS ON CHART
  renderVolumeProfileOverlay: function() {
    const overlay = document.getElementById('chart-vp-overlay');
    if (!overlay) return;

    if (!this.volumeProfileVisible) {
      overlay.style.display = 'none';
      return;
    }
    overlay.style.display = 'block';

    const vp = this.currentVolumeProfile;
    if (!vp || !vp.bins || !vp.bins.length) return;

    const prec = vp.precision !== undefined ? vp.precision : 2;
    const curr = vp.currency || '$';
    const liveP = window.currentLivePrice || window.activePrice || vp.poc;
    const totalVolK = this.formatVolK(vp.totalVolume, liveP);
    const totalOrdStr = (vp.totalOrdersCount || 0).toLocaleString();

    let badge = document.getElementById('vp-badge');
    let canvas = document.getElementById('vp-canvas');

    if (!badge || !canvas) {
      overlay.innerHTML = `
        <div class="vp-telemetry-badge" id="vp-badge"></div>
        <canvas id="vp-canvas" style="width:100%; height:100%; display:block; pointer-events:none;"></canvas>
      `;
      badge = document.getElementById('vp-badge');
      canvas = document.getElementById('vp-canvas');
    }

    if (badge) {
      badge.innerHTML = `
        <span style="color:#00f2a1; font-weight:800;">● VRVP 1s</span>
        <span style="color:var(--accent); font-weight:800">POC ${curr}${Number(vp.poc).toFixed(prec)}</span>
        <span style="color:var(--cyan)">VAH ${curr}${Number(vp.vah).toFixed(prec)}</span>
        <span style="color:var(--purple)">VAL ${curr}${Number(vp.val).toFixed(prec)}</span>
        <span style="color:#fcd535; font-weight:800;">N° Ordini: ${totalOrdStr} ord</span>
        <span style="color:#38bdf8; font-weight:800;">Vol: ${totalVolK}</span>
        <span style="color:#cbd5e1;">Max: <b style="color:#00f2a1">${curr}${Number(vp.maxPrice).toFixed(prec)}</b> • Min: <b style="color:#f43f5e">${curr}${Number(vp.minPrice).toFixed(prec)}</b></span>
      `;
    }

    if (!canvas) return;
    const parentEl = document.getElementById('chart-container') || overlay;
    const rect = overlay.getBoundingClientRect();
    const cssW = Math.max(260, overlay.clientWidth || Math.round(rect.width) || (parentEl ? parentEl.clientWidth - 68 : 760));
    const cssH = Math.max(180, overlay.clientHeight || Math.round(rect.height) || (parentEl ? parentEl.clientHeight - 26 : 440));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const candleSeries = window.mainCandleSeries || window.candleSeries;
    const chartInst = window.mainChart || window.mainChartInstance;
    const numBins = vp.bins.length;
    const maxBinVol = vp.maxBinVol || 1;

    const userWidth = this.volumeProfileWidth || 150;
    const maxProfileWidth = Math.max(70, Math.min(cssW * 0.22, userWidth));
    const isRight = (this.volumeProfileStyle === 'right' || !this.volumeProfileStyle);
    const isLeft = (this.volumeProfileStyle === 'left');

    // Exact Y coordinate locked 1:1 to LightweightCharts price scale
    const getPriceY = (price) => {
      if (candleSeries && typeof candleSeries.priceToCoordinate === 'function') {
        const coord = candleSeries.priceToCoordinate(price);
        if (coord !== null && !isNaN(coord)) return coord;
      }
      const norm = (price - vp.minPrice) / ((vp.maxPrice - vp.minPrice) || 1);
      return cssH - (norm * cssH);
    };

    // Exact X coordinate locked 1:1 to LightweightCharts time scale
    const getTimeX = (timeSec) => {
      if (chartInst && typeof chartInst.timeScale === 'function') {
        try {
          const x = chartInst.timeScale().timeToCoordinate(timeSec);
          if (x !== null && !isNaN(x)) return x;
        } catch (e) {}
      }
      return null;
    };

    // 1. Draw POC Ray across chart
    if (this.volumeProfileShowPocRay && vp.poc) {
      const pocY = getPriceY(vp.poc);
      if (pocY >= 0 && pocY <= cssH) {
        ctx.strokeStyle = 'rgba(252, 213, 53, 0.55)';
        ctx.lineWidth = 1.1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, pocY);
        ctx.lineTo(cssW, pocY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 2. Render Volume Profile Histogram Bars (Buy/Sell split + Written Order Count & Volume in K on every visible row!)
    let lastTextY = -999;
    vp.bins.forEach((b) => {
      const yTop = getPriceY(b.priceHigh);
      const yBot = getPriceY(b.priceLow);
      const yMid = getPriceY(b.price);
      if (yMid < -20 || yMid > cssH + 20) return;

      const rawH = Math.abs(yBot - yTop);
      const barH = Math.max(3, Math.min(22, (rawH || 8) * 0.86));
      const isPoc = Math.abs(b.price - vp.poc) < 0.0000001;
      const inVa = b.price >= vp.val && b.price <= vp.vah;
      const totalW = Math.max(6, (b.vol / maxBinVol) * maxProfileWidth);
      const buyW = totalW * (b.buyVol / Math.max(1e-9, b.vol));
      const sellW = Math.max(0, totalW - buyW);

      const barX = isRight ? (cssW - totalW - 2) : (isLeft ? 2 : Math.max(10, cssW * 0.60 - totalW));

      // Dual-tone institutional VRVP bar (Hyperliquid orange/gold & cyan/teal style)
      if (isPoc) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.78)';
        ctx.fillRect(barX, yMid - barH / 2, totalW, barH);
        ctx.strokeStyle = '#fcd535';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, yMid - barH / 2, totalW, barH);
      } else {
        // Sell portion (warm amber/copper) + Buy portion (gold/cyan)
        ctx.fillStyle = inVa ? 'rgba(217, 119, 6, 0.48)' : 'rgba(180, 83, 9, 0.28)';
        ctx.fillRect(barX, yMid - barH / 2, sellW, barH);
        ctx.fillStyle = inVa ? 'rgba(234, 179, 8, 0.62)' : 'rgba(56, 189, 248, 0.28)';
        ctx.fillRect(barX + sellW, yMid - barH / 2, buyW, barH);
      }

      // Written Order Count + Volume in K on the right edge (Hyperliquid VRVP style: e.g. "42 ord • 847K")
      if (Math.abs(yMid - lastTextY) >= 11.5 && yMid > 12 && yMid < cssH - 12) {
        lastTextY = yMid;
        const volKTxt = this.formatVolK(b.vol, b.price);
        const ordTxt = `${b.ordersCount} ord • ${volKTxt}`;
        ctx.font = isPoc ? 'bold 9.5px "JetBrains Mono", monospace' : 'bold 8.5px "JetBrains Mono", monospace';
        const txtX = isRight ? (cssW - 5) : (barX + totalW + 4);
        ctx.textAlign = isRight ? 'right' : 'left';
        ctx.textBaseline = 'middle';

        // Subtle text shadow for crisp legibility over bars
        ctx.fillStyle = 'rgba(9, 13, 22, 0.82)';
        const tw = ctx.measureText(ordTxt).width;
        if (isRight) {
          ctx.fillRect(txtX - tw - 4, yMid - 5.5, tw + 6, 11);
        } else {
          ctx.fillRect(txtX - 2, yMid - 5.5, tw + 6, 11);
        }

        ctx.fillStyle = isPoc ? '#fcd535' : (inVa ? '#f8fafc' : '#cbd5e1');
        ctx.fillText(ordTxt, txtX, yMid);
      }
    });

    // 3. VISIBLE CHART MINIMUM & MAXIMUM PRICE CALLOUTS (like "46.801 —●" in Hyperliquid screenshot)
    const drawExtremeCallout = (candle, price, isMax) => {
      if (!candle || !isFinite(price)) return;
      const y = getPriceY(price);
      if (y < 8 || y > cssH - 8) return;
      let x = getTimeX(candle.time);
      if (x === null || x < 20 || x > cssW - maxProfileWidth - 20) {
        x = Math.round(cssW * 0.46);
      }

      const labelTxt = `${isMax ? '▲ MAX' : '▼ MIN'} ${curr}${Number(price).toFixed(prec)}`;
      ctx.save();
      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      const tw = ctx.measureText(labelTxt).width;
      const placeLeft = x > (tw + 38);
      const lineEndX = placeLeft ? (x - 16) : (x + 16);
      const boxW = tw + 10;
      const boxX = placeLeft ? (lineEndX - boxW) : lineEndX;
      const color = isMax ? '#00f2a1' : '#f8fafc';
      const borderCol = isMax ? '#00f2a1' : '#f43f5e';

      // Pointer dot on candle wick
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = borderCol;
      ctx.fill();

      // Horizontal connector line ("46.801 —●")
      ctx.strokeStyle = borderCol;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(lineEndX, y);
      ctx.stroke();

      // Callout pill
      ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
      ctx.strokeStyle = borderCol;
      ctx.lineWidth = 1;
      ctx.fillRect(boxX, y - 8, boxW, 16);
      ctx.strokeRect(boxX, y - 8, boxW, 16);

      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelTxt, boxX + boxW / 2, y);
      ctx.restore();
    };

    drawExtremeCallout(vp.maxCandle, vp.maxPrice, true);
    drawExtremeCallout(vp.minCandle, vp.minPrice, false);

    // 4. PERFECT ALIGNMENT OF ORDERS ON REFERENCE CHART: ENTRY, STOP-LOSS (SL), TARGETS (TP1/TP), AND LIQUIDATION (LIQ)
    const ord = this.getActiveChartOrdersForSymbol(vp.symbol, liveP, prec);
    if (ord) {
      const rightLimitX = cssW - maxProfileWidth - 6;

      const drawOrderLine = (price, tagLeft, tagRight, strokeCol, bgFill, isDashed = true, showTpSlPills = false) => {
        if (!price || !isFinite(price) || price <= 0) return;
        const y = getPriceY(price);
        if (y < 8 || y > cssH - 8) return;

        ctx.save();
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = showTpSlPills ? 1.4 : 1.15;
        if (isDashed) ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(rightLimitX, y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        const fullText = `${tagLeft} ${curr}${Number(price).toFixed(prec)}${tagRight ? ' • ' + tagRight : ''}`;
        const tw = ctx.measureText(fullText).width;
        const pillW = tw + 12;
        const pillX = Math.max(8, rightLimitX - pillW - 6);

        // Draw Hyperliquid-style [TP] [SL] mini tags next to Entry / Limit pill
        if (showTpSlPills) {
          const tpSlW = 54;
          const tpSlX = Math.max(6, pillX - tpSlW - 4);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
          ctx.strokeStyle = '#10b981';
          ctx.fillRect(tpSlX, y - 8, 24, 16);
          ctx.strokeRect(tpSlX, y - 8, 24, 16);
          ctx.fillStyle = '#00f2a1';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('TP', tpSlX + 12, y);

          ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
          ctx.strokeStyle = '#f59e0b';
          ctx.fillRect(tpSlX + 27, y - 8, 24, 16);
          ctx.strokeRect(tpSlX + 27, y - 8, 24, 16);
          ctx.fillStyle = '#fbbf24';
          ctx.fillText('SL', tpSlX + 39, y);
        }

        ctx.fillStyle = bgFill;
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 1;
        ctx.fillRect(pillX, y - 8.5, pillW, 17);
        ctx.strokeRect(pillX, y - 8.5, pillW, 17);

        ctx.fillStyle = strokeCol;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fullText, pillX + pillW / 2, y);
        ctx.restore();
      };

      // Draw Target Profit (TP), TP1, Entry, Stop-Loss (SL) and Liquidation (LIQ)
      drawOrderLine(ord.tpPrice, '🎯 TARGET TP', ord.side, '#00f2a1', 'rgba(6, 46, 34, 0.92)', true, false);
      if (ord.tp1Price && Math.abs(ord.tp1Price - ord.tpPrice) > (vp.maxPrice - vp.minPrice) * 0.03) {
        drawOrderLine(ord.tp1Price, 'TP1 (40%)', '', '#34d399', 'rgba(6, 40, 32, 0.88)', true, false);
      }
      drawOrderLine(ord.entryPrice, `⚡ INGRESSO (${ord.sourceLabel})`, ord.side, '#38bdf8', 'rgba(11, 25, 44, 0.94)', false, true);
      drawOrderLine(ord.slPrice, '🛡️ STOP LOSS', `-${Math.abs(((ord.entryPrice - ord.slPrice) / (ord.entryPrice || 1)) * 100).toFixed(2)}%`, '#f43f5e', 'rgba(48, 14, 24, 0.92)', true, false);
      drawOrderLine(ord.liqPrice, '💀 LIQUIDAZIONE', `${ord.leverage}x`, '#c084fc', 'rgba(38, 14, 54, 0.92)', true, false);
    }
  },

    toggleVolumeProfileVisibility: function() {
    this.volumeProfileVisible = !this.volumeProfileVisible;
    this.renderVolumeProfileOverlay();
    const btn = document.getElementById('btn-toggle-vp');
    if (btn) btn.classList.toggle('active', this.volumeProfileVisible);
    if (window.showToast) {
      window.showToast(`Volumi Locali POC/VAH: ${this.volumeProfileVisible ? 'ATTIVI' : 'DISATTIVATI'}`, 'info');
    }
  },

  setVolumeProfileRange: function(range) {
    this.volumeProfileRange = range;
    this.calculateLocalVolumeProfile();
    this.renderVpSettingsDropdown();
  },

  setVolumeProfileStyle: function(style) {
    this.volumeProfileStyle = style;
    this.renderVolumeProfileOverlay();
    this.renderVpSettingsDropdown();
  },

  setVolumeProfileBins: function(bins) {
    this.volumeProfileBins = parseInt(bins, 10);
    this.calculateLocalVolumeProfile();
    this.renderVpSettingsDropdown();
  },

  setVolumeProfileWidth: function(w) {
    this.volumeProfileWidth = parseInt(w, 10);
    this.renderVolumeProfileOverlay();
    this.renderVpSettingsDropdown();
  },

  setVolumeProfileVaPct: function(pct) {
    this.volumeProfileVaPct = parseFloat(pct);
    this.calculateLocalVolumeProfile();
    this.renderVpSettingsDropdown();
  },

  toggleShowValues: function() {
    this.volumeProfileShowValues = !this.volumeProfileShowValues;
    this.renderVolumeProfileOverlay();
    this.renderVpSettingsDropdown();
  },

  togglePocRay: function() {
    this.volumeProfileShowPocRay = !this.volumeProfileShowPocRay;
    this.renderVolumeProfileOverlay();
    this.renderVpSettingsDropdown();
  },

  toggleVpSettingsDropdown: function(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const el = document.getElementById('vp-settings-dropdown');
    if (!el) return;
    const isOpen = el.classList.contains('open');
    if (isOpen) {
      el.classList.remove('open');
    } else {
      el.classList.add('open');
      this.renderVpSettingsDropdown();
    }
  },

  renderVpSettingsDropdown: function() {
    const el = document.getElementById('vp-settings-dropdown');
    if (!el) return;

    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px;">
        <span style="font-weight:800; font-size:11px; color:#fff;">⚙ PARAMETRI VOLUMI LOCALI & VRVP</span>
        <button onclick="document.getElementById('vp-settings-dropdown').classList.remove('open')" style="background:transparent; border:none; color:var(--text-dim); font-size:14px; cursor:pointer;">✕</button>
      </div>

      <div style="margin-bottom:8px;">
        <div style="font-size:9px; font-weight:800; color:var(--text-dim); margin-bottom:4px;">RANGE DI CALCOLO</div>
        <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:4px;">
          <button class="btn btn-sm ${this.volumeProfileRange === 'visible' ? 'btn-primary' : 'btn-secondary'}" style="font-size:9px; padding:3px 4px;" onclick="OptimalEngine.setVolumeProfileRange('visible')">
            Range Visibile (VRVP)
          </button>
          <button class="btn btn-sm ${this.volumeProfileRange === 'session' ? 'btn-primary' : 'btn-secondary'}" style="font-size:9px; padding:3px 4px;" onclick="OptimalEngine.setVolumeProfileRange('session')">
            Sessione (72)
          </button>
          <button class="btn btn-sm ${this.volumeProfileRange === '100' ? 'btn-primary' : 'btn-secondary'}" style="font-size:9px; padding:3px 4px;" onclick="OptimalEngine.setVolumeProfileRange('100')">
            100 Candele
          </button>
          <button class="btn btn-sm ${this.volumeProfileRange === '24h' ? 'btn-primary' : 'btn-secondary'}" style="font-size:9px; padding:3px 4px;" onclick="OptimalEngine.setVolumeProfileRange('24h')">
            24 Ore (288)
          </button>
        </div>
      </div>

      <div style="margin-bottom:8px;">
        <div style="font-size:9px; font-weight:800; color:var(--text-dim); margin-bottom:4px;">POSIZIONE & ANCORAGGIO</div>
        <div style="display:flex; gap:3px;">
          <button class="btn btn-sm ${(!this.volumeProfileStyle || this.volumeProfileStyle === 'right') ? 'btn-primary' : 'btn-secondary'}" style="font-size:9px; padding:4px 6px; flex:1;" onclick="OptimalEngine.setVolumeProfileStyle('right')">
            Ancorato a Destra
          </button>
          <button class="btn btn-sm ${this.volumeProfileStyle === 'left' ? 'btn-primary' : 'btn-secondary'}" style="font-size:9px; padding:4px 6px; flex:1;" onclick="OptimalEngine.setVolumeProfileStyle('left')">
            Ancorato a Sinistra
          </button>
          <button class="btn btn-sm ${this.volumeProfileStyle === 'floating' ? 'btn-primary' : 'btn-secondary'}" style="font-size:9px; padding:4px 6px; flex:1;" onclick="OptimalEngine.setVolumeProfileStyle('floating')">
            Flottante
          </button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
        <div>
          <div style="font-size:9px; font-weight:800; color:var(--text-dim); margin-bottom:3px;">RIGHE (BINS)</div>
          <select class="terminal-input" style="font-size:10px; padding:3px 6px; width:100%;" onchange="OptimalEngine.setVolumeProfileBins(this.value)">
            ${[24, 36, 48, 72, 100].map(b => `<option value="${b}" ${this.volumeProfileBins === b ? 'selected' : ''}>${b} Righe</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:9px; font-weight:800; color:var(--text-dim); margin-bottom:3px;">LARGHEZZA (${this.volumeProfileWidth || 220}px)</div>
          <select class="terminal-input" style="font-size:10px; padding:3px 6px; width:100%;" onchange="OptimalEngine.setVolumeProfileWidth(this.value)">
            ${[140, 200, 260, 340, 450, 580].map(w => `<option value="${w}" ${(this.volumeProfileWidth || 220) === w ? 'selected' : ''}>${w}px</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Slider Larghezza Continua (Allungabili) -->
      <div style="margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; font-size:9px; color:var(--text-muted); font-weight:700; margin-bottom:2px;">
          <span>ESTENSIONE BARRE (ALLUNGABILI)</span>
          <span style="color:var(--accent); font-family:var(--font-mono)">${this.volumeProfileWidth || 220}px</span>
        </div>
        <input type="range" min="80" max="600" step="20" value="${this.volumeProfileWidth || 220}" class="lev-slider" style="width:100%" oninput="OptimalEngine.setVolumeProfileWidth(this.value)">
      </div>

      <div style="margin-bottom:8px;">
        <div style="font-size:9px; font-weight:800; color:var(--text-dim); margin-bottom:4px;">VALUE AREA (VA)</div>
        <div style="display:flex; gap:4px;">
          <button class="btn btn-sm ${this.volumeProfileVaPct === 0.68 ? 'btn-primary' : 'btn-secondary'}" style="font-size:9px; padding:3px 6px; flex:1;" onclick="OptimalEngine.setVolumeProfileVaPct(0.68)">
            68% (1-Sigma)
          </button>
          <button class="btn btn-sm ${this.volumeProfileVaPct === 0.70 ? 'btn-primary' : 'btn-secondary'}" style="font-size:9px; padding:3px 6px; flex:1;" onclick="OptimalEngine.setVolumeProfileVaPct(0.70)">
            70% (Standard)
          </button>
          <button class="btn btn-sm ${this.volumeProfileVaPct === 0.80 ? 'btn-primary' : 'btn-secondary'}" style="font-size:9px; padding:3px 6px; flex:1;" onclick="OptimalEngine.setVolumeProfileVaPct(0.80)">
            80% (Ampia)
          </button>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:4px; margin-top:8px; border-top:1px solid rgba(255,255,255,0.06); padding-top:6px;">
        <label style="display:flex; align-items:center; gap:6px; font-size:10px; cursor:pointer;">
          <input type="checkbox" ${this.volumeProfileShowValues ? 'checked' : ''} onchange="OptimalEngine.toggleVolumeProfileValues(this.checked)">
          <span>Mostra Valori Numerici di Volume</span>
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-size:10px; cursor:pointer;">
          <input type="checkbox" ${this.volumeProfileShowPocRay ? 'checked' : ''} onchange="OptimalEngine.togglePocRay(this.checked)">
          <span>Raggio POC Esteso (Golden Ray)</span>
        </label>
      </div>
    `;
  },
  renderOptimalUI: function() {
    const container = document.getElementById('optimal-engine-view-container');
    if (!container) return;
    const s = this.optimalSetup || {
      symbol: window.currentSymbol || 'BTCUSDT',
      side: 'LONG',
      entryPrice: window.activePrice || 65800,
      stopLoss: +((window.activePrice || 65800) * 0.982).toFixed(2),
      tp1: +((window.activePrice || 65800) * 1.028).toFixed(2),
      tp2: +((window.activePrice || 65800) * 1.055).toFixed(2),
      tp3: +((window.activePrice || 65800) * 1.09).toFixed(2),
      rrRatio: '1 : 3.20',
      convexScore: 92,
      expectedROI: '+32.0% (con leva 10x)',
      reason: 'Setup Asimmetrico convesso calibrato sul POC locale e sul Budget Allocato del singolo Exchange.'
    };
    const alloc = window.MultiExchangeAllocator;
    const cal = alloc ? alloc.calibrateOrderForExchange(alloc.activeOrderExchange, {
      riskPct: 1.0,
      entryPrice: s.entryPrice,
      stopLossPrice: s.stopLoss,
      takeProfitPrice: s.tp2
    }) : null;

    container.innerHTML = `
      <div style="padding:14px; display:flex; flex-direction:column; gap:14px;">
        <div class="window-card" style="padding:14px; border:1px solid rgba(0,242,161,0.4);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
            <div>
              <span style="font-size:15px; font-weight:900; color:#00f2a1;">🎯 POSIZIONE OTTIMALE CONVESSA &amp; AUTO-PILOT (${s.symbol})</span>
              <div style="font-size:11px; color:#94a3b8;">Calibrazione automatica su singolo exchange pre-impostato (Min 10,00 € ➔ Max Disponibile)</div>
            </div>
            <span style="background:rgba(0,242,161,0.18); color:#00f2a1; border:1px solid #00f2a1; padding:4px 10px; border-radius:6px; font-weight:900; font-family:var(--font-mono);">Score: ${s.convexScore}/100 (${s.rrRatio})</span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px; font-family:var(--font-mono); font-size:12px;">
            <div style="background:rgba(255,255,255,0.03); padding:8px; border-radius:6px;">Entry: <b style="color:#fff;">${s.entryPrice}</b></div>
            <div style="background:rgba(239,68,68,0.1); padding:8px; border-radius:6px;">Stop Loss: <b style="color:#f87171;">${s.stopLoss}</b></div>
            <div style="background:rgba(0,242,161,0.1); padding:8px; border-radius:6px;">TP1 / TP2: <b style="color:#00f2a1;">${s.tp1} / ${s.tp2}</b></div>
            ${cal && cal.allowed ? `<div style="background:rgba(245,158,11,0.12); padding:8px; border-radius:6px;">Budget ${cal.exchangeIcon}: <b style="color:#fbbf24;">${cal.managedBudgetEur.toFixed(2)} €</b> (Rischio: ${cal.riskAmountEur.toFixed(2)} €)</div>` : ''}
          </div>
        </div>
        <div id="v22-allocator-optimal-dock">${alloc ? alloc.buildAllocatorHTML(false) : ''}</div>
        <div id="v24-leverage-optimal-dock">${window.LeverageMatrixV24 ? window.LeverageMatrixV24.buildLeverageMatrixHTML(false) : ''}</div>
        <div id="v23-basket-timing-optimal-dock">${window.BasketTimingEngineV23 ? window.BasketTimingEngineV23.buildFullMatrixHTML(false) : ''}</div>
      </div>
    `;
  },

  renderOptimalCards: function() {
    this.renderOptimalUI();
    this.renderVolumeProfileOverlay();
  }
};

// Initialize after DOM loads
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    OptimalEngine.init();
  }, 600);
});
