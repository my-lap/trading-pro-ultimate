// ==========================================================================
// ORDER FLOW, FOOTPRINT CLUSTERS, TWIN VOLUME FOOTPRINT CHART (OPENMARKET 1s)
// TRADING PRO ULTIMATE × cuordivino v25.4
// ==========================================================================

const OrderFlowEngine = {
  footprintActive: false,
  twinFootprintChartVisible: true,
  twinChart: null,
  twinCandleSeries: null,
  twinPriceLineSeries: null,
  twinVwapSeries: null,
  twinEma9Series: null,
  _isSyncingTwinRange: false,
  twinChartHeight: 460,
  twinIsFullScreen: false,
  _splittersAttached: false,

  footprintSettings: {
    imbalanceRatio: 2.6,     // 260% ratio for buying/selling imbalance
    showNumbers: true,       // Show text numbers on blocks
    pocHighlight: true,      // Highlight intraday POC cluster with border
    opacity: 0.88,
    minBarWidthForClusters: 14
  },
  denseGridActive: true,
  denseGridSettings: {
    minPixelGap: 24,
    lineColor: 'rgba(255, 255, 255, 0.14)',
    labelColor: '#94a3b8',
    targetMultiplier: 6
  },

  formatBlockVolK(vol, price) {
    const v = Math.abs(parseFloat(vol) || 0);
    const metric = v >= 1000 ? v : Math.max(v * (price || 1), v * 100);
    if (metric >= 1000000) return (metric / 1000000).toFixed(1) + 'M';
    if (metric >= 1000) return Math.round(metric / 1000) + 'K';
    return Math.max(1, Math.round(metric)) + 'K';
  },

  // 1. DETERMINISTIC REAL-TIME 1S FOOTPRINT CLUSTERS PER CANDLE (SELL BLOCK LEFT | CANDLE | BUY BLOCK RIGHT)
  generateFootprintClusters(candle, numLevels = 8) {
    const range = Math.max(0.000001, candle.high - candle.low);
    const step = range / numLevels;
    const totalVol = Math.max(10, parseFloat(candle.volume) || 100);
    const isBull = candle.close >= candle.open;
    const bodyLow = Math.min(candle.open, candle.close);
    const bodyHigh = Math.max(candle.open, candle.close);

    const clusters = [];
    let maxClusterVol = 0;
    let pocIdx = 0;

    // Deterministic seed from candle time + close so blocks never flicker randomly, yet update smoothly on 1s ticks!
    const baseSeed = Math.abs(Math.floor((candle.time || 1) * 13 + (candle.close || 1) * 10000));

    for (let i = 0; i < numLevels; i++) {
      const priceLevel = candle.low + (i * step) + (step / 2);
      const inBody = priceLevel >= bodyLow && priceLevel <= bodyHigh;
      const centerDist = Math.abs(priceLevel - ((candle.open + candle.close) / 2)) / range;
      const pseudo = ((baseSeed + i * 37) % 100) / 100;
      const weight = (inBody ? 1.45 : 0.72) * Math.max(0.25, 1.15 - centerDist * 1.1) * (0.82 + pseudo * 0.36);
      const levelVol = (totalVol / numLevels) * weight;

      // Aggressive buyers vs aggressive sellers split
      const relPos = (priceLevel - candle.low) / range;
      const buyRatio = isBull
        ? Math.min(0.84, Math.max(0.28, 0.48 + relPos * 0.28 + (pseudo - 0.5) * 0.14))
        : Math.min(0.72, Math.max(0.16, 0.52 - (1 - relPos) * 0.28 + (pseudo - 0.5) * 0.14));

      const askVol = Math.max(1, Math.round(levelVol * buyRatio));
      const bidVol = Math.max(1, Math.round(levelVol * (1 - buyRatio)));
      const askOrders = Math.max(1, Math.round((askVol / Math.max(1, totalVol)) * 64));
      const bidOrders = Math.max(1, Math.round((bidVol / Math.max(1, totalVol)) * 64));

      const isBuyImbalance = (askVol / Math.max(1, bidVol)) >= this.footprintSettings.imbalanceRatio;
      const isSellImbalance = (bidVol / Math.max(1, askVol)) >= this.footprintSettings.imbalanceRatio;

      const sum = askVol + bidVol;
      if (sum > maxClusterVol) {
        maxClusterVol = sum;
        pocIdx = i;
      }

      clusters.push({
        price: priceLevel,
        top: candle.low + ((i + 1) * step),
        bottom: candle.low + (i * step),
        bid: bidVol,
        ask: askVol,
        bidOrders,
        askOrders,
        total: sum,
        isBuyImbalance,
        isSellImbalance,
        isPoc: false
      });
    }

    if (clusters[pocIdx]) {
      clusters[pocIdx].isPoc = true;
    }

    return { clusters, maxClusterVol: Math.max(1, maxClusterVol) };
  },

  // 2. RENDER FOOTPRINT OVERLAY ON UPPER MAIN CHART (WHEN OPTIONAL OVERLAY BUTTON IS ACTIVE)
  renderFootprintOverlay() {
    const canvas = document.getElementById('footprint-canvas');
    if (canvas) {
      if (!this.footprintActive) {
        canvas.style.display = 'none';
      } else {
        canvas.style.display = 'block';
        this.drawFootprintBlocksOnCanvas(canvas, window.mainChart || window.mainChartInstance, window.mainCandleSeries || window.candleSeries, false);
      }
    }
    // Always keep the Twin Footprint Chart below synchronized in real time!
    if (this.twinFootprintChartVisible) {
      this.renderTwinFootprintChart();
    }
  },

  // SHARED OPENMARKET 04w28Du3 FOOTPRINT & ORDER-BLOCK RENDERER
  drawFootprintBlocksOnCanvas(canvas, chartInst, candleSeriesInst, isTwinChart = true) {
    if (!canvas || !chartInst || !candleSeriesInst) return;
    const container = canvas.parentElement;
    if (!container) return;

    const cssW = container.clientWidth || 760;
    const cssH = container.clientHeight || 380;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const timeScale = chartInst.timeScale();
    const range = timeScale.getVisibleLogicalRange ? timeScale.getVisibleLogicalRange() : null;
    if (!range) return;

    const candles = window.currentCandles || window.rawCandleHistory || [];
    if (!candles.length) return;

    const fromIdx = Math.max(0, Math.floor(range.from));
    const toIdx = Math.min(candles.length - 1, Math.ceil(range.to));
    if (toIdx < fromIdx) return;

    let barSpacing = 16;
    if (toIdx > fromIdx) {
      for (let k = fromIdx; k < toIdx; k++) {
        const x0 = timeScale.timeToCoordinate(candles[k]?.time);
        const x1 = timeScale.timeToCoordinate(candles[k + 1]?.time);
        if (x0 != null && x1 != null && Math.abs(x1 - x0) > 1) {
          barSpacing = Math.abs(x1 - x0);
          break;
        }
      }
    }

    const rightPriceAxisWidth = 72;
    const vpReserve = isTwinChart ? 115 : 135;
    const maxDrawRightX = cssW - rightPriceAxisWidth - 2;
    const numLevels = barSpacing >= 28 ? 9 : (barSpacing >= 14 ? 7 : 5);
    const halfBlockMaxW = Math.max(4, Math.min(34, (barSpacing * 0.44)));
    const stemHalfW = Math.max(1.2, Math.min(3.5, barSpacing * 0.08));
    const showBlockText = barSpacing >= 18;
    const showFullOrdAndVol = barSpacing >= 42;

    const sym = window.currentSymbol || 'BTCUSDT';
    const asset = window.getAssetBySymbol ? window.getAssetBySymbol(sym) : null;
    const liveP = window.currentLivePrice || window.activePrice || (candles[candles.length - 1]?.close || 100);
    const prec = window.getDynamicPrecision ? window.getDynamicPrecision(liveP, sym) : (asset ? (asset.precision || 2) : 2);
    const curr = asset ? (asset.currency || (sym.endsWith('.MI') ? '€' : '$')) : (sym.endsWith('.MI') ? '€' : '$');

    const deltaPoints = [];
    let lastCandleSummary = null;

    for (let i = fromIdx; i <= toIdx; i++) {
      const c = candles[i];
      if (!c) continue;

      const x = timeScale.timeToCoordinate(c.time);
      if (x == null || x < 10 || x > maxDrawRightX) continue;

      const yHigh = candleSeriesInst.priceToCoordinate(c.high);
      const yLow = candleSeriesInst.priceToCoordinate(c.low);
      const yOpen = candleSeriesInst.priceToCoordinate(c.open);
      const yClose = candleSeriesInst.priceToCoordinate(c.close);
      if (yHigh == null || yLow == null || yClose == null) continue;

      const isBull = c.close >= c.open;
      const { clusters, maxClusterVol } = this.generateFootprintClusters(c, numLevels);

      let candleBuyVol = 0;
      let candleSellVol = 0;
      let candleBuyOrd = 0;
      let candleSellOrd = 0;

      clusters.forEach(cl => {
        candleBuyVol += cl.ask;
        candleSellVol += cl.bid;
        candleBuyOrd += cl.askOrders;
        candleSellOrd += cl.bidOrders;

        const yTop = candleSeriesInst.priceToCoordinate(cl.top);
        const yBottom = candleSeriesInst.priceToCoordinate(cl.bottom);
        if (yTop == null || yBottom == null) return;

        const cellH = Math.max(2.5, Math.abs(yBottom - yTop) - 0.8);
        const y = Math.min(yTop, yBottom);

        // Proportional block widths (OpenMarket Volume Footprint style: Sell block extends left, Buy block extends right)
        const sellW = Math.max(3, (cl.bid / maxClusterVol) * halfBlockMaxW);
        const buyW = Math.max(3, (cl.ask / maxClusterVol) * halfBlockMaxW);

        const leftX = x - stemHalfW - 1 - sellW;
        const rightX = x + stemHalfW + 1;

        // 1. Left Block: SELL ORDER BLOCK (Crimson / Maroon)
        ctx.fillStyle = cl.isSellImbalance
          ? 'rgba(220, 38, 38, 0.82)'
          : 'rgba(153, 27, 27, 0.52)';
        ctx.fillRect(leftX, y, sellW, cellH);

        // 2. Right Block: BUY ORDER BLOCK (Lime / Olive Green as in OpenMarket 04w28Du3)
        ctx.fillStyle = cl.isBuyImbalance
          ? 'rgba(132, 204, 22, 0.85)'
          : 'rgba(77, 124, 15, 0.56)';
        ctx.fillRect(rightX, y, buyW, cellH);

        // 3. Highlight POC or Imbalance cluster with crisp white/gold frame (OpenMarket style)
        if (cl.isPoc || cl.isBuyImbalance || cl.isSellImbalance) {
          ctx.strokeStyle = cl.isPoc ? '#ffffff' : (cl.isBuyImbalance ? '#bef264' : '#fca5a5');
          ctx.lineWidth = cl.isPoc ? 1.1 : 0.75;
          ctx.strokeRect(x - stemHalfW - 1 - halfBlockMaxW, y, (halfBlockMaxW * 2) + (stemHalfW * 2) + 2, cellH);
        }

        // 4. Written Order Count & Block Volume inside each footprint cell when zoom/spacing permits
        if (showBlockText && cellH >= 8.5) {
          ctx.font = cellH >= 11 ? 'bold 7.8px "JetBrains Mono", monospace' : 'bold 6.8px "JetBrains Mono", monospace';
          ctx.textBaseline = 'middle';
          const midY = y + cellH / 2;

          const sellVolTxt = this.formatBlockVolK(cl.bid, cl.price);
          const buyVolTxt = this.formatBlockVolK(cl.ask, cl.price);
          const leftLabel = showFullOrdAndVol ? `${cl.bidOrders}o•${sellVolTxt}` : sellVolTxt;
          const rightLabel = showFullOrdAndVol ? `${ buyVolTxt}•${cl.askOrders}o` : buyVolTxt;

          ctx.fillStyle = cl.isSellImbalance ? '#ffffff' : '#fecdd3';
          ctx.textAlign = 'right';
          ctx.fillText(leftLabel, x - stemHalfW - 2.5, midY);

          ctx.fillStyle = cl.isBuyImbalance ? '#ffffff' : '#ecfccb';
          ctx.textAlign = 'left';
          ctx.fillText(rightLabel, x + stemHalfW + 2.5, midY);
        }
      });

      // 5. Center Candlestick Stem & Body (OpenMarket bright neon green / red center bar)
      ctx.strokeStyle = isBull ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      const bodyTop = Math.min(yOpen ?? yClose, yClose);
      const bodyH = Math.max(2, Math.abs((yClose ?? 0) - (yOpen ?? 0)));
      ctx.fillStyle = isBull ? '#4ade80' : '#f87171';
      ctx.fillRect(x - stemHalfW, bodyTop, stemHalfW * 2, bodyH);

      deltaPoints.push({
        x,
        y: yClose,
        buyVol: candleBuyVol,
        sellVol: candleSellVol,
        buyOrd: candleBuyOrd,
        sellOrd: candleSellOrd,
        price: c.close
      });

      if (i === candles.length - 1) {
        lastCandleSummary = {
          x,
          y: yClose,
          buyVol: candleBuyVol,
          sellVol: candleSellVol,
          buyOrd: candleBuyOrd,
          sellOrd: candleSellOrd,
          price: c.close
        };
      }
    }

    // 6. Continuous Price & Order-Block Development Line across all visible candles
    if (isTwinChart && deltaPoints.length > 1) {
      ctx.save();
      ctx.beginPath();
      deltaPoints.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }

    // 7. Right-Side Mini Volume Profile & Active Order Lines on Twin Chart (Mirrors Main Chart Indications)
    if (isTwinChart && window.OptimalEngine && window.OptimalEngine.currentVolumeProfile) {
      const vp = window.OptimalEngine.currentVolumeProfile;
      if (vp.bins && vp.bins.length) {
        const maxBinV = vp.maxBinVol || 1;
        const profMaxW = Math.min(95, cssW * 0.16);
        let lastLabelY = -999;

        vp.bins.forEach(b => {
          const yMid = candleSeriesInst.priceToCoordinate(b.price);
          if (yMid == null || yMid < 8 || yMid > cssH - 8) return;
          const bw = Math.max(4, (b.vol / maxBinV) * profMaxW);
          const bx = maxDrawRightX - bw;
          const isPoc = Math.abs(b.price - vp.poc) < 1e-7;
          ctx.fillStyle = isPoc ? 'rgba(245, 158, 11, 0.65)' : 'rgba(56, 189, 248, 0.22)';
          ctx.fillRect(bx, yMid - 3, bw, 6);

          if (Math.abs(yMid - lastLabelY) >= 13) {
            lastLabelY = yMid;
            const vTxt = `${b.ordersCount}o•${this.formatBlockVolK(b.vol, b.price)}`;
            ctx.font = 'bold 7.2px "JetBrains Mono", monospace';
            ctx.fillStyle = isPoc ? '#fcd535' : '#cbd5e1';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(vTxt, maxDrawRightX - 2, yMid);
          }
        });
      }

      // Draw aligned Entry / TP / SL / LIQ lines on the Twin Chart as well
      const ord = window.OptimalEngine.getActiveChartOrdersForSymbol(sym, liveP, prec);
      if (ord) {
        const drawTwinLevel = (p, lbl, col) => {
          const y = candleSeriesInst.priceToCoordinate(p);
          if (y == null || y < 10 || y > cssH - 10) return;
          ctx.save();
          ctx.strokeStyle = col;
          ctx.lineWidth = 0.9;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(maxDrawRightX - 60, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = 'bold 7px "JetBrains Mono", monospace';
          const txt = `${lbl} ${curr}${Number(p).toFixed(prec)}`;
          const tw = ctx.measureText(txt).width + 6;
          ctx.fillStyle = 'rgba(9,13,22,0.9)';
          ctx.strokeStyle = col;
          ctx.fillRect(maxDrawRightX - 60 - tw, y - 5.5, tw, 11);
          ctx.strokeRect(maxDrawRightX - 60 - tw, y - 5.5, tw, 11);
          ctx.fillStyle = col;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(txt, maxDrawRightX - 60 - tw / 2, y);
          ctx.restore();
        };
        drawTwinLevel(ord.tpPrice, '🎯TP', '#00f2a1');
        drawTwinLevel(ord.entryPrice, '⚡IN', '#38bdf8');
        drawTwinLevel(ord.slPrice, '🛡️SL', '#f43f5e');
        drawTwinLevel(ord.liqPrice, `💀LIQ`, '#c084fc');
      }
    }

    // 8. Live 1-Second Simultaneous Callout on the Active Candle + Header Telemetry Update
    if (lastCandleSummary) {
      const s = lastCandleSummary;
      const buyK = this.formatBlockVolK(s.buyVol, s.price);
      const sellK = this.formatBlockVolK(s.sellVol, s.price);
      const deltaVol = s.buyVol - s.sellVol;
      const deltaK = (deltaVol >= 0 ? '+' : '-') + this.formatBlockVolK(Math.abs(deltaVol), s.price);
      const nowTime = new Date().toLocaleTimeString('it-IT');

      const headerBadge = document.getElementById('twin-fp-live-1s-badge');
      if (headerBadge) {
        headerBadge.innerHTML = `⏱️ <b>${nowTime}</b> • Prezzo 1s: <b style="color:#38bdf8">${curr}${Number(s.price).toFixed(prec)}</b> • 🟢 Acquisto: <b style="color:#00f2a1">${s.buyOrd} ord (${buyK})</b> | 🔴 Vendita: <b style="color:#f43f5e">${s.sellOrd} ord (${sellK})</b> • Delta Blocchi: <b style="color:${deltaVol >= 0 ? '#00f2a1' : '#f43f5e'}">${deltaK}</b>`;
      }
    }
  },

  // INITIALIZE & SYNCHRONIZE THE SECOND FULL-SIZE TWIN VOLUME FOOTPRINT CHART
  initTwinFootprintChart() {
    const container = document.getElementById('twin-footprint-chart-container');
    if (!container || !window.LightweightCharts) return;
    if (this.twinChart) return;

    container.innerHTML = '';
    this.twinChart = LightweightCharts.createChart(container, {
      layout: {
        background: { color: '#070a12' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'Inter', monospace"
      },
      localization: {
        locale: 'it-IT',
        dateFormat: 'dd/MM/yyyy'
      },
      grid: {
        vertLines: { visible: true, color: 'rgba(255, 255, 255, 0.08)', style: 2 },
        horzLines: { visible: true, color: 'rgba(255, 255, 255, 0.08)', style: 2 }
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: '#10b981', width: 1, style: 2 },
        horzLine: { color: '#10b981', width: 1, style: 2 }
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        autoScale: true,
        minimumWidth: 72,
        scaleMargins: { top: 0.08, bottom: 0.08 }
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 12,
        barSpacing: 14
      }
    });

    // Base candlestick series (semi-transparent so Footprint Blocks & Center Stem shine clearly)
    this.initTwinHeightAndSplitters();
    this.twinCandleSeries = this.twinChart.addCandlestickSeries({
      upColor: 'rgba(0, 242, 161, 0.18)',
      downColor: 'rgba(255, 69, 96, 0.18)',
      borderVisible: false,
      wickUpColor: 'rgba(0, 242, 161, 0.35)',
      wickDownColor: 'rgba(255, 69, 96, 0.35)',
      lastValueVisible: true,
      priceLineVisible: true
    });

    // Bidirectional 0ms Logical Range Sync between Main Chart and Twin Footprint Chart
    const mainChart = window.mainChart || window.mainChartInstance;
    if (mainChart && typeof mainChart.timeScale === 'function') {
      mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (this._isSyncingTwinRange || !range || !this.twinChart) return;
        this._isSyncingTwinRange = true;
        try {
          this.twinChart.timeScale().setVisibleLogicalRange(range);
          const twinCanvas = document.getElementById('twin-footprint-blocks-canvas');
          if (twinCanvas && this.twinFootprintChartVisible) {
            this.drawFootprintBlocksOnCanvas(twinCanvas, this.twinChart, this.twinCandleSeries, true);
          }
        } catch (e) {}
        this._isSyncingTwinRange = false;
      });
    }

    this.twinChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (this._isSyncingTwinRange || !range) return;
      this._isSyncingTwinRange = true;
      try {
        const mc = window.mainChart || window.mainChartInstance;
        if (mc && typeof mc.timeScale === 'function') {
          mc.timeScale().setVisibleLogicalRange(range);
        }
        const twinCanvas = document.getElementById('twin-footprint-blocks-canvas');
        if (twinCanvas && this.twinFootprintChartVisible) {
          this.drawFootprintBlocksOnCanvas(twinCanvas, this.twinChart, this.twinCandleSeries, true);
        }
      } catch (e) {}
      this._isSyncingTwinRange = false;
    });
  },

  renderTwinFootprintChart(candlesInput) {
    const section = document.getElementById('twin-footprint-chart-section');
    if (!section) return;
    if (!this.twinFootprintChartVisible) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';

    if (!this.twinChart) {
      this.initTwinFootprintChart();
    }
    if (!this.twinChart || !this.twinCandleSeries) return;

    const candles = candlesInput || window.currentCandles || [];
    if (!candles.length) return;

    const sym = window.currentSymbol || 'BTCUSDT';
    const lastClose = candles[candles.length - 1].close;
    const asset = window.getAssetBySymbol ? window.getAssetBySymbol(sym) : null;
    const prec = window.getDynamicPrecision ? window.getDynamicPrecision(lastClose, sym) : (asset ? (asset.precision || 2) : 2);
    const minMove = window.getDynamicMinMove ? window.getDynamicMinMove(prec) : Math.pow(10, -prec);

    this.twinCandleSeries.applyOptions({
      priceFormat: { type: 'price', precision: prec, minMove: minMove }
    });

    const formatted = candles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }));
    try {
      this.twinCandleSeries.setData(formatted);
    } catch (e) {}

    // Sync visible range with mainChart
    try {
      const mc = window.mainChart || window.mainChartInstance;
      if (mc && typeof mc.timeScale === 'function') {
        const r = mc.timeScale().getVisibleLogicalRange();
        if (r) this.twinChart.timeScale().setVisibleLogicalRange(r);
      }
    } catch (e) {}

    const twinCanvas = document.getElementById('twin-footprint-blocks-canvas');
    if (twinCanvas) {
      this.drawFootprintBlocksOnCanvas(twinCanvas, this.twinChart, this.twinCandleSeries, true);
    }
  },

  updateTwinCandle1s(updatedCandle) {
    if (!this.twinFootprintChartVisible) return;
    if (!this.twinChart) this.initTwinFootprintChart();
    if (!this.twinCandleSeries || !updatedCandle) return;
    try {
      this.twinCandleSeries.update({
        time: updatedCandle.time,
        open: updatedCandle.open,
        high: updatedCandle.high,
        low: updatedCandle.low,
        close: updatedCandle.close
      });
    } catch (e) {}
    const twinCanvas = document.getElementById('twin-footprint-blocks-canvas');
    if (twinCanvas) {
      this.drawFootprintBlocksOnCanvas(twinCanvas, this.twinChart, this.twinCandleSeries, true);
    }
  },

  initTwinHeightAndSplitters() {
    try {
      const savedH = localStorage.getItem('tpu_twin_footprint_chart_height');
      if (savedH) {
        this.twinChartHeight = Math.max(180, Math.min(1600, parseInt(savedH, 10) || 460));
      } else if (window.BybitChartSettings && window.BybitChartSettings.currentHeight) {
        this.twinChartHeight = window.BybitChartSettings.currentHeight;
      } else {
        this.twinChartHeight = (window.innerWidth < 768) ? 420 : 480;
      }
      this.setTwinChartHeight(this.twinChartHeight, false);
    } catch (e) {}

    if (this._splittersAttached) return;
    this._splittersAttached = true;

    const attachDrag = (splitterId, mode) => {
      const el = document.getElementById(splitterId);
      if (!el) return;

      let startY = 0;
      let startMainH = 460;
      let startTwinH = 460;
      let dragging = false;

      const onStart = (clientY) => {
        dragging = true;
        startY = clientY;
        const mainVp = document.querySelector('.chart-viewport-wrapper');
        const twinVp = document.getElementById('twin-footprint-viewport-wrapper');
        startMainH = mainVp ? (mainVp.clientHeight || 460) : 460;
        startTwinH = twinVp ? (twinVp.clientHeight || this.twinChartHeight || 460) : 460;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ns-resize';
      };

      const onMove = (clientY) => {
        if (!dragging) return;
        const dy = clientY - startY;
        if (mode === 'central') {
          // Central splitter: dragging down increases upper chart height (or if Shift/Alt held, inversely adjusts both)
          // Standard intuitive behavior: dragging central handle resizes upper chart & keeps twin chart responsive, or adjusts twin chart
          const newMainH = Math.max(200, Math.min(1600, Math.round(startMainH + dy)));
          if (window.BybitChartSettings) {
            window.BybitChartSettings.applyHeight(newMainH, false, false);
          }
        } else {
          // Bottom splitter: directly resizes Twin Volume Footprint chart
          const newTwinH = Math.max(180, Math.min(1600, Math.round(startTwinH + dy)));
          this.setTwinChartHeight(newTwinH, false);
        }
      };

      const onEnd = () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        const mainVp = document.querySelector('.chart-viewport-wrapper');
        if (mode === 'central' && mainVp && window.BybitChartSettings) {
          window.BybitChartSettings.currentHeight = mainVp.clientHeight;
          try { localStorage.setItem('tpu_bybit_chart_height', String(mainVp.clientHeight)); } catch (e) {}
        } else {
          try { localStorage.setItem('tpu_twin_footprint_chart_height', String(this.twinChartHeight)); } catch (e) {}
        }
        if (typeof window.resizeAllCharts === 'function') window.resizeAllCharts();
      };

      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onStart(e.clientY);
        const moveListener = (ev) => onMove(ev.clientY);
        const upListener = () => {
          window.removeEventListener('mousemove', moveListener);
          window.removeEventListener('mouseup', upListener);
          onEnd();
        };
        window.addEventListener('mousemove', moveListener);
        window.addEventListener('mouseup', upListener);
      });

      el.addEventListener('touchstart', (e) => {
        if (!e.touches || !e.touches.length) return;
        onStart(e.touches[0].clientY);
        const touchMove = (ev) => {
          if (ev.touches && ev.touches.length) onMove(ev.touches[0].clientY);
        };
        const touchEnd = () => {
          window.removeEventListener('touchmove', touchMove);
          window.removeEventListener('touchend', touchEnd);
          onEnd();
        };
        window.addEventListener('touchmove', touchMove, { passive: true });
        window.addEventListener('touchend', touchEnd);
      }, { passive: true });
    };

    attachDrag('splitter-twin-central', 'central');
    attachDrag('splitter-twin-bottom', 'bottom');
  },

  setTwinChartHeight(px, save = true) {
    const val = Math.max(180, Math.min(1600, parseInt(px, 10) || 460));
    this.twinChartHeight = val;
    this.twinIsFullScreen = false;

    const twinVp = document.getElementById('twin-footprint-viewport-wrapper');
    const twinC1 = document.getElementById('twin-footprint-chart-container');
    if (twinVp) {
      twinVp.style.setProperty('height', `${val}px`, 'important');
      twinVp.style.setProperty('min-height', `${val}px`, 'important');
      twinVp.style.setProperty('max-height', 'none', 'important');
    }
    if (twinC1) {
      twinC1.style.setProperty('height', `${val}px`, 'important');
      twinC1.style.setProperty('min-height', `${val}px`, 'important');
      twinC1.style.setProperty('max-height', 'none', 'important');
    }

    const numInput = document.getElementById('twin-fp-height-num-input');
    if (numInput && document.activeElement !== numInput) numInput.value = val;

    const inlineSlider = document.getElementById('twin-fp-height-inline-slider');
    if (inlineSlider) inlineSlider.value = val;

    const modalSlider = document.getElementById('twin-modal-chart-height-slider');
    if (modalSlider) modalSlider.value = val;

    const modalLbl = document.getElementById('twin-modal-slider-val-lbl');
    if (modalLbl) modalLbl.textContent = `${val}px`;

    document.querySelectorAll('.twin-h-quick-btn').forEach(btn => {
      const t = parseInt((btn.textContent || '').trim(), 10);
      if (t === val) {
        btn.style.background = 'rgba(0, 242, 161, 0.25)';
        btn.style.borderColor = '#00f2a1';
        btn.style.color = '#00f2a1';
      } else {
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
      }
    });

    if (this.twinChart && twinC1 && twinC1.clientWidth > 10) {
      try {
        this.twinChart.resize(twinC1.clientWidth, val);
        const twinCanvas = document.getElementById('twin-footprint-blocks-canvas');
        if (twinCanvas && this.twinFootprintChartVisible) {
          this.drawFootprintBlocksOnCanvas(twinCanvas, this.twinChart, this.twinCandleSeries, true);
        }
      } catch (e) {}
    }

    if (save) {
      try {
        localStorage.setItem('tpu_twin_footprint_chart_height', String(val));
      } catch (e) {}
    }
  },

  adjustTwinChartHeight(deltaPx) {
    const nextH = Math.max(180, Math.min(1600, (this.twinChartHeight || 460) + (parseInt(deltaPx, 10) || 0)));
    this.setTwinChartHeight(nextH, true);
  },

  toggleTwinFullScreen() {
    this.twinIsFullScreen = !this.twinIsFullScreen;
    if (this.twinIsFullScreen) {
      const fullH = Math.max(540, window.innerHeight - 120);
      this.setTwinChartHeight(fullH, false);
      if (window.showToast) window.showToast(`⛶ Grafico Gemello Volumi 1s a Schermo Intero (${fullH}px)`, 'info');
    } else {
      const saved = parseInt(localStorage.getItem('tpu_twin_footprint_chart_height'), 10) || 460;
      this.setTwinChartHeight(saved, true);
    }
  },

  toggleTwinFootprintChart(forceState) {
    if (typeof forceState === 'boolean') {
      this.twinFootprintChartVisible = forceState;
    } else {
      this.twinFootprintChartVisible = !this.twinFootprintChartVisible;
    }

    const section = document.getElementById('twin-footprint-chart-section');
    if (section) {
      section.style.display = this.twinFootprintChartVisible ? 'block' : 'none';
    }
    const centralSplit = document.getElementById('splitter-twin-central');
    if (centralSplit) {
      centralSplit.style.display = this.twinFootprintChartVisible ? 'flex' : 'none';
    }

    const btn = document.getElementById('btn-toggle-twin-footprint');
    const lbl = document.getElementById('lbl-twin-fp-state');
    if (btn) btn.classList.toggle('active', this.twinFootprintChartVisible);
    if (lbl) lbl.innerText = this.twinFootprintChartVisible ? 'ON' : 'OFF';

    const mBtn = document.getElementById('btn-mobile-twin-fp');
    if (mBtn) {
      mBtn.innerText = `🧱 Vol 1s: ${this.twinFootprintChartVisible ? 'ON' : 'OFF'}`;
      mBtn.style.opacity = this.twinFootprintChartVisible ? '1' : '0.55';
    }

    const chk = document.getElementById('chk-twin-footprint-chart');
    if (chk) chk.checked = this.twinFootprintChartVisible;

    if (this.twinFootprintChartVisible) {
      this.renderTwinFootprintChart();
      if (typeof window.resizeAllCharts === 'function') window.resizeAllCharts();
    }
    if (window.showToast) {
      window.showToast(`🧱📊 Secondo Grafico Gemello Candele Volumi & Blocchi Ordini 1s: ${this.twinFootprintChartVisible ? 'ATTIVO (ON)' : 'SPENTO (OFF)'}`, 'info');
    }
  },

  // 3. HIGH-DENSITY TIME RESOLUTION GRID (ONLY VERTICAL DOTTED LINES — NO DUPLICATE OVERLAPPING TIME TEXT!)
  renderDenseTimeGrid() {
    const canvas = document.getElementById('dense-timegrid-canvas');
    if (!canvas || !this.denseGridActive) return;

    const mainContainer = document.getElementById('chart-container');
    if (!mainContainer || !window.mainChart) return;

    const totalWidth = mainContainer.clientWidth;
    const totalHeight = mainContainer.clientHeight || 350;

    canvas.width = totalWidth;
    canvas.height = totalHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const timeScale = window.mainChart.timeScale();
    const range = timeScale.getVisibleLogicalRange();
    if (!range) return;

    const candles = window.currentCandles || window.rawCandleHistory || [];
    if (!candles.length) return;

    const fromIdx = Math.max(0, Math.floor(range.from));
    const toIdx = Math.min(candles.length - 1, Math.ceil(range.to));
    if (toIdx <= fromIdx) return;

    const rightMargin = 72;
    ctx.lineWidth = 1;

    for (let i = fromIdx; i <= toIdx; i++) {
      const c = candles[i];
      if (!c) continue;

      const x = timeScale.timeToCoordinate(c.time);
      if (x == null || x < 0 || x > canvas.width - rightMargin) continue;

      ctx.strokeStyle = this.denseGridSettings.lineColor;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, totalHeight - 24);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  },

    // 4. CALCULATE CUMULATIVE VOLUME DELTA (CVD)
  calculateCVD(candles) {
    if (!candles || !candles.length) return [];
    let cvd = 0;
    return candles.map(c => {
      const vol = c.volume || 10;
      const range = Math.max(0.0001, c.high - c.low);
      const deltaRatio = (c.close - c.open) / range;
      const delta = vol * deltaRatio;
      cvd += delta;
      return {
        time: c.time,
        value: Math.round(cvd),
        color: cvd >= 0 ? 'rgba(0, 242, 161, 0.85)' : 'rgba(255, 69, 96, 0.85)'
      };
    });
  },

  // Toggle footprint
  toggleFootprint() {
    this.footprintActive = !this.footprintActive;
    this.renderFootprintOverlay();
    const btn = document.getElementById('btn-toggle-footprint');
    if (btn) btn.classList.toggle('active', this.footprintActive);
    if (window.showToast) {
      window.showToast(`Order Flow Footprint: ${this.footprintActive ? 'ATTIVO' : 'DISATTIVATO'}`, 'info');
    }
  },

  forecastConeVisible: false,

  toggleForecastCone(forced) {
    if (typeof forced === 'boolean') {
      this.forecastConeVisible = forced;
    } else {
      this.forecastConeVisible = !this.forecastConeVisible;
    }
    const btn = document.getElementById('btn-toggle-forecast-cone');
    const canvas = document.getElementById('forecast-cone-canvas');
    if (btn) {
      if (this.forecastConeVisible) {
        btn.classList.add('active');
        btn.style.background = 'rgba(56,189,248,0.3)';
        btn.style.boxShadow = '0 0 10px rgba(56,189,248,0.5)';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'rgba(56,189,248,0.15)';
        btn.style.boxShadow = 'none';
      }
    }
    if (canvas) {
      canvas.style.display = this.forecastConeVisible ? 'block' : 'none';
    }
    if (this.forecastConeVisible) {
      this.renderForecastCone();
    }
    if (window.showToast) {
      window.showToast(`Previsione Ventaglio (Forecast Cone): ${this.forecastConeVisible ? 'ATTIVATA' : 'DISATTIVATA'}`, 'info');
    }
  },

  renderForecastCone() {
    const canvas = document.getElementById('forecast-cone-canvas');
    if (!canvas) return;
    if (!this.forecastConeVisible) {
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = 'block';

    const chart = window.mainChartInstance;
    const series = window.mainCandleSeries;
    const data = window.currentChartCandles || window.currentCandles || [];
    if (!chart || !series || !data || data.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const lastIdx = data.length - 1;
    const lastCandle = data[lastIdx];
    const lastClose = (lastCandle && lastCandle.close !== undefined) ? lastCandle.close : (window.currentLivePrice || 75780);

    // EXACT vertical anchor: locked to real last candle close via series price coordinate
    let startY = series.priceToCoordinate(lastClose);
    if (startY === null || isNaN(startY)) {
      startY = rect.height * 0.5;
    }

    // EXACT horizontal anchor & dynamic bar spacing derived directly from chart coordinates
    let startX = null;
    let barSpacing = 16;

    if (chart.timeScale().logicalToCoordinate) {
      startX = chart.timeScale().logicalToCoordinate(lastIdx);
      const prevX = chart.timeScale().logicalToCoordinate(lastIdx - 1);
      if (startX !== null && prevX !== null && !isNaN(startX) && !isNaN(prevX)) {
        const d = Math.abs(startX - prevX);
        if (d >= 1 && d <= 250) barSpacing = d;
      }
    }

    if (startX === null || isNaN(startX)) {
      startX = chart.timeScale().timeToCoordinate(lastCandle.time);
    }

    if (startX === null || isNaN(startX)) {
      const vRange = chart.timeScale().getVisibleLogicalRange ? chart.timeScale().getVisibleLogicalRange() : null;
      if (vRange && vRange.to > vRange.from) {
        barSpacing = Math.max(2, rect.width / (vRange.to - vRange.from));
        startX = (lastIdx - vRange.from) * barSpacing;
      } else {
        startX = rect.width * 0.65;
      }
    }

    // If candle is completely off-screen to the right (> rect.width + 40), do not render
    if (startX > rect.width + 40) {
      ctx.restore();
      return;
    }

    // 20 bars forward in chart coordinate space - locked 1:1 with candle displacement!
    const projectionBars = 20;
    const rawTargetX = startX + (projectionBars * barSpacing);

    // If whole cone is scrolled off-screen to the left, return
    if (rawTargetX < -40) {
      ctx.restore();
      return;
    }

    // Safe right boundary: respect right volume profile if anchored to right
    let maxSafeRight = rect.width - 65; // Price scale width margin
    if (window.OptimalEngine && OptimalEngine.volumeProfileVisible && OptimalEngine.volumeProfileStyle === 'right') {
      const vpWidth = OptimalEngine.volumeProfileWidth || 220;
      maxSafeRight = Math.max(120, rect.width - vpWidth - 15);
    }

    // Lock targetX: natural projection when space is available, safe boundary clamp if reaching right edge
    const targetX = Math.min(rawTargetX, maxSafeRight);
    if (targetX <= startX + 8) {
      ctx.restore();
      return;
    }

    // Dynamic completion ratio if approaching the right panel
    const progressRatio = Math.max(0.15, Math.min(1.0, (targetX - startX) / Math.max(1, (rawTargetX - startX))));

    // Forecast percentages dynamically interpolated based on actual horizontal reach
    const targetGainPct = 0.085 * progressRatio;
    const medianGainPct = 0.042 * progressRatio;
    const supportLossPct = 0.055 * progressRatio;

    const upperTarget = lastClose * (1 + targetGainPct);
    const medianTarget = lastClose * (1 + medianGainPct);
    const lowerSupport = lastClose * (1 - supportLossPct);

    let upperY = series.priceToCoordinate(upperTarget);
    let medianY = series.priceToCoordinate(medianTarget);
    let lowerY = series.priceToCoordinate(lowerSupport);

    if (upperY === null || isNaN(upperY)) upperY = startY - (70 * progressRatio);
    if (medianY === null || isNaN(medianY)) medianY = startY - (35 * progressRatio);
    if (lowerY === null || isNaN(lowerY)) lowerY = startY + (60 * progressRatio);

    // 1. Shaded Cone Area (Gradient Fill following smooth Bezier curve)
    const coneGrad = ctx.createLinearGradient(startX, startY, targetX, startY);
    coneGrad.addColorStop(0, 'rgba(56, 189, 248, 0.03)');
    coneGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.10)');
    coneGrad.addColorStop(1, 'rgba(56, 189, 248, 0.20)');

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(
      startX + (targetX - startX) * 0.45, startY + (upperY - startY) * 0.2,
      startX + (targetX - startX) * 0.75, upperY,
      targetX, upperY
    );
    ctx.lineTo(targetX, lowerY);
    ctx.bezierCurveTo(
      startX + (targetX - startX) * 0.75, lowerY,
      startX + (targetX - startX) * 0.45, startY + (lowerY - startY) * 0.2,
      startX, startY
    );
    ctx.closePath();
    ctx.fillStyle = coneGrad;
    ctx.fill();

    // 2. Upper Fan Boundary (Dashed Cyan)
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(
      startX + (targetX - startX) * 0.45, startY + (upperY - startY) * 0.2,
      startX + (targetX - startX) * 0.75, upperY,
      targetX, upperY
    );
    ctx.stroke();

    // 3. Median Consensus Line (Dotted Green)
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.6;
    ctx.moveTo(startX, startY);
    ctx.lineTo(targetX, medianY);
    ctx.stroke();

    // 4. Lower Support Boundary (Dashed Orange)
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.8;
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(
      startX + (targetX - startX) * 0.45, startY + (lowerY - startY) * 0.2,
      startX + (targetX - startX) * 0.75, lowerY,
      targetX, lowerY
    );
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Origin Dot Locked to Last Candle Close
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(startX, startY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 6. Target Badges & Labels (Auto-clamped to prevent right-edge or volume profile overlap)
    const renderBadge = (x, y, text, sub, color) => {
      const badgeW = 104;
      const badgeH = 26;
      const badgeX = Math.min(rect.width - badgeW - 6, x + 4);
      const clampedY = Math.max(16, Math.min(rect.height - 18, y));

      ctx.fillStyle = 'rgba(10, 15, 29, 0.94)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      const r = 4;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(badgeX, clampedY - 13, badgeW, badgeH, r);
      } else {
        ctx.rect(badgeX, clampedY - 13, badgeW, badgeH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = 'bold 9px Inter, monospace';
      ctx.fillText(text, badgeX + 6, clampedY - 1);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '8px Inter, sans-serif';
      ctx.fillText(sub, badgeX + 6, clampedY + 9);
    };

    renderBadge(targetX, upperY, `Target $${upperTarget.toFixed(2)}`, `+${(targetGainPct * 100).toFixed(1)}% Fan Target`, '#38bdf8');
    renderBadge(targetX, medianY, `Consenso $${medianTarget.toFixed(2)}`, `+${(medianGainPct * 100).toFixed(1)}% Expected`, '#10b981');
    renderBadge(targetX, lowerY, `Supporto $${lowerSupport.toFixed(2)}`, `-${(supportLossPct * 100).toFixed(1)}% Max Risk`, '#f97316');

    ctx.restore();
  }
};

window.OrderFlowEngine = OrderFlowEngine;
window.toggleFootprintOverlay = () => OrderFlowEngine.toggleFootprint();
window.toggleForecastCone = (f) => OrderFlowEngine.toggleForecastCone(f);
