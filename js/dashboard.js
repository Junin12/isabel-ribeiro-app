/* Dashboard com filtros. Clicar numa barra/fatia do gráfico aplica o filtro correspondente. */

// Paleta categórica validada (ordem fixa; a cor acompanha a categoria, não a posição no ranking)
const CAT_COLORS = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};
const isDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

Views.dashboard = {
  title: 'Dashboard',
  keepOnSync: false,
  charts: [],
  f: { period: 'month', from: '', to: '', clientId: '', productId: '', categoryId: '', resellerId: '' },

  range() {
    const f = this.f;
    if (f.period === 'custom') return { from: f.from || '2000-01-01', to: f.to || todayISO() };
    if (f.period === 'all') {
      const dates = Store.db.sales.map(s => s.date).sort();
      return { from: dates[0] || todayISO(), to: dates.at(-1) > todayISO() ? dates.at(-1) : todayISO() };
    }
    return periodRange(f.period);
  },

  render() {
    const db = Store.db, f = this.f;
    const sel = (id, label, opts, val) => html`<div class="field"><label for="${id}">${label}</label><select id="${id}">${opts.map(([v, l]) => html`<option value="${v}" ${val === v ? 'selected' : ''}>${l}</option>`)}</select></div>`;
    const byName = (a, b) => a[1].localeCompare(b[1]);
    return html`
      <section class="card">
        <div class="filters">
          ${sel('df-period', 'Período', [['week', 'Esta semana'], ['month', 'Este mês'], ['lastmonth', 'Mês passado'], ['last7', 'Últimos 7 dias'], ['last30', 'Últimos 30 dias'], ['year', 'Este ano'], ['all', 'Tudo'], ['custom', 'Personalizado…']], f.period)}
          ${f.period === 'custom' ? html`
            <div class="field"><label for="df-from">De</label><input type="date" id="df-from" value="${f.from}"></div>
            <div class="field"><label for="df-to">Até</label><input type="date" id="df-to" value="${f.to}"></div>` : ''}
          ${sel('df-client', 'Cliente', [['', 'Todos'], ...db.clients.map(c => [c.id, `${c.firstName} ${c.lastName}`]).sort(byName)], f.clientId)}
          ${sel('df-category', 'Categoria', [['', 'Todas'], ...db.categories.map(c => [c.id, c.name])], f.categoryId)}
          ${sel('df-product', 'Produto', [['', 'Todos'], ...db.products.map(p => [p.id, p.name]).sort(byName)], f.productId)}
          ${sel('df-reseller', 'Vendedora', [['', 'Todas'], ['direct', 'Venda direta'], ...db.resellers.map(r => [r.id, r.name])], f.resellerId)}
        </div>
        <div id="df-active" class="active-filters"></div>
      </section>
      <div id="dash-body"></div>`;
  },

  after() { this.draw(); },

  onChange(e) {
    const map = { 'df-period': 'period', 'df-from': 'from', 'df-to': 'to', 'df-client': 'clientId', 'df-category': 'categoryId', 'df-product': 'productId', 'df-reseller': 'resellerId' };
    const k = map[e.target.id];
    if (!k) return;
    this.f[k] = e.target.value;
    if (k === 'period') App.refresh(); else this.draw();
  },

  setFilter(k, v) { this.f[k] = this.f[k] === v ? '' : v; App.refresh(); },

  draw() {
    const db = Store.db, f = this.f, range = this.range();
    const filt = { range, clientId: f.clientId, productId: f.productId, categoryId: f.categoryId, resellerId: f.resellerId };
    const all = saleLines(db.sales);
    const lines = filterLines(all, filt);
    const s = summarize(lines);
    const p = summarize(filterLines(all, { ...filt, range: prevComparable(range) }));
    const w = walletStats(db.sales, range, f.resellerId);

    // chips de filtros ativos
    const names = { clientId: id => Store.clientName(id), productId: id => id === 'avulsa' ? 'Vendas avulsas' : Store.product(id)?.name, categoryId: id => Store.category(id)?.name, resellerId: id => Store.sellerName(id === 'direct' ? null : id) };
    const active = Object.keys(names).filter(k => f[k]);
    $('#df-active').innerHTML = String(html`${active.map(k => html`<button type="button" class="chip active" data-act="clear" data-k="${k}">${names[k](f[k])} ✕</button>`)}
      ${active.length ? html`<button type="button" class="chip" data-act="clear-all">Limpar filtros</button>` : ''}`);

    const prods = byProduct(lines), cats = byCategory(lines), clients = byClient(lines.filter(l => l.clientId)), sellers = byReseller(lines);
    const wd = byWeekday(lines), best = bestDay(lines);
    const bestWd = [...wd].sort((a, b) => b.revenue - a.revenue)[0];
    const stockCost = db.products.reduce((a, x) => a + (+x.stock || 0) * (+x.cost || 0), 0);
    const stockSale = db.products.reduce((a, x) => a + (+x.stock || 0) * (+x.price || 0), 0);
    const low = db.products.filter(x => (+x.stock || 0) <= 1).sort((a, b) => a.stock - b.stock);
    const fmtRange = `${fmtDate(range.from)} a ${fmtDate(range.to)}`;

    $('#dash-body').innerHTML = String(html`
      <p class="small muted" style="margin:12px 0 0">${fmtRange} · comparado com ${fmtDate(prevComparable(range).from)} a ${fmtDate(prevComparable(range).to)}</p>
      <div class="kpis">
        ${kpi('Faturamento', money(s.revenue), deltaTxt(s.revenue, p.revenue), 'accent')}
        ${kpi('Lucro líquido', money(s.profit), deltaTxt(s.profit, p.profit))}
        ${kpi('Vendas', num(s.count), deltaTxt(s.count, p.count))}
        ${kpi('Ticket médio', money(s.ticket), deltaTxt(s.ticket, p.ticket))}
        ${kpi('Peças vendidas', num(s.pieces), deltaTxt(s.pieces, p.pieces))}
        ${kpi('Margem', pct(s.margin), `Comissões ${money(s.commission)}`)}
        ${kpi('Recebido no período', money(w.gross), `Líquido ${money(w.net)}`)}
        ${kpi('A receber', money(w.toReceive), w.lateCount ? `${w.lateCount} atrasada(s): ${money(w.late)}` : 'Nada atrasado')}
      </div>
      ${!lines.length ? html`<div class="card empty"><div class="big">📊</div>Nenhuma venda neste período/filtro.</div>` : html`
      <div class="charts">
        <section class="card wide"><h3>Faturamento e lucro</h3>
          <div class="legend"><span><i style="background:${this.colors().s1}"></i>Faturamento</span><span><i style="background:${this.colors().s2}"></i>Lucro líquido</span></div>
          <div class="chart-box"><canvas id="ch-time" role="img" aria-label="Faturamento e lucro ao longo do tempo"></canvas></div></section>
        <section class="card"><h3>Categorias mais vendidas</h3><p class="small muted">Toque numa fatia para filtrar</p>
          <div class="chart-box"><canvas id="ch-cat" role="img" aria-label="Faturamento por categoria"></canvas></div></section>
        <section class="card"><h3>Peças mais vendidas (unidades)</h3><p class="small muted">Toque numa barra para filtrar</p>
          <div class="chart-box tall"><canvas id="ch-prod" role="img" aria-label="Produtos mais vendidos"></canvas></div></section>
        <section class="card"><h3>Top compradoras</h3><p class="small muted">Toque numa barra para filtrar</p>
          <div class="chart-box tall"><canvas id="ch-client" role="img" aria-label="Clientes que mais compraram"></canvas></div></section>
        <section class="card"><h3>Vendas por dia da semana</h3>
          <p class="small muted">Melhor dia da semana: <b>${bestWd.label}</b>${best ? html` · Melhor data: <b>${fmtDate(best.date)}</b> (${money(best.revenue)})` : ''}</p>
          <div class="chart-box"><canvas id="ch-wd" role="img" aria-label="Faturamento por dia da semana"></canvas></div></section>
        <section class="card wide"><h3>Revendedoras × venda direta</h3><p class="small muted">Toque numa barra para filtrar</p>
          <div class="chart-box"><canvas id="ch-seller" role="img" aria-label="Faturamento por vendedora"></canvas></div>
          <div class="tbl-wrap"><table class="tbl" style="margin-top:12px"><thead><tr><th>Vendedora</th><th class="num">Vendas</th><th class="num">Peças</th><th class="num">Faturamento</th><th class="num">Lucro p/ você</th><th class="num">Comissão</th><th>Peça campeã</th></tr></thead>
          <tbody>${sellers.map(g => {
            const topP = byProduct(lines.filter(l => l.resellerId === g.key))[0];
            return html`<tr><td>${g.label}</td><td class="num">${g.count}</td><td class="num">${g.qty}</td><td class="num">${money(g.revenue)}</td><td class="num">${money(g.profit)}</td><td class="num">${money(g.commission)}</td><td>${topP ? `${topP.label} (${topP.qty})` : '—'}</td></tr>`;
          })}</tbody></table></div></section>
      </div>`}
      <div class="charts">
        <section class="card"><h3>Estoque (seu)</h3>
          <div class="sum-line"><span>Valor investido em estoque</span><b>${money(stockCost)}</b></div>
          <div class="sum-line"><span>Valor de venda do estoque</span><b>${money(stockSale)}</b></div>
          <div class="sum-line"><span>Lucro potencial</span><b style="color:var(--good)">${money(stockSale - stockCost)}</b></div>
        </section>
        <section class="card"><h3>Estoque baixo (≤ 1)</h3>
          ${low.length ? html`<table class="tbl"><tbody>${low.slice(0, 8).map(x => html`<tr><td>${x.name}</td><td class="num"><span class="badge ${x.stock > 0 ? 'warn' : 'bad'}">${x.stock || 0}</span></td></tr>`)}</tbody></table>` : html`<p class="muted small">Tudo abastecido ✨</p>`}
        </section>
      </div>`);

    this.charts.forEach(c => c.destroy());
    this.charts = [];
    if (!lines.length || !window.Chart) return;
    const c = this.colors();
    const ts = timeSeries(lines, range);
    const moneyTick = v => BRL.format(v).replace(',00', '');
    const base = (extra = {}) => ({
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.dataset.isQty ? num(ctx.raw) + ' un.' : money(ctx.raw)}` } } },
      ...extra,
    });
    const scales = (horizontal, isQty) => {
      const valueAxis = { grid: { color: c.grid }, border: { display: false }, ticks: { color: c.muted, callback: isQty ? v => v : moneyTick, precision: 0 }, beginAtZero: true };
      const catAxis = { grid: { display: false }, border: { color: c.axis }, ticks: { color: c.muted, autoSkip: !horizontal, callback(v) { const l = this.getLabelForValue(v); return l.length > 18 ? l.slice(0, 17) + '…' : l; } } };
      return horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis };
    };
    const bar = { borderRadius: 4, borderSkipped: 'start', maxBarThickness: 28 };
    const clickTo = (key, keys) => (evt, els) => { if (els[0]) this.setFilter(key, keys[els[0].index]); };

    this.charts.push(new Chart($('#ch-time'), {
      type: 'line',
      data: { labels: ts.labels, datasets: [
        { label: 'Faturamento', data: ts.revenue, borderColor: c.s1, backgroundColor: c.s1, borderWidth: 2, pointRadius: ts.labels.length > 31 ? 0 : 3, pointHoverRadius: 5, cubicInterpolationMode: 'monotone' },
        { label: 'Lucro líquido', data: ts.profit, borderColor: c.s2, backgroundColor: c.s2, borderWidth: 2, pointRadius: ts.labels.length > 31 ? 0 : 3, pointHoverRadius: 5, cubicInterpolationMode: 'monotone' },
      ] },
      options: base({ interaction: { mode: 'index', intersect: false }, scales: scales(false) }),
    }));

    const catIdx = id => Math.max(0, db.categories.findIndex(x => x.id === id));
    const catPal = isDark() ? CAT_COLORS.dark : CAT_COLORS.light;
    this.charts.push(new Chart($('#ch-cat'), {
      type: 'doughnut',
      data: { labels: cats.map(g => g.label), datasets: [{ label: 'Faturamento', data: cats.map(g => round2(g.revenue)), backgroundColor: cats.map(g => catPal[catIdx(g.key) % 8]), borderColor: c.surface, borderWidth: 2 }] },
      options: { ...base({ onClick: clickTo('categoryId', cats.map(g => g.key)), cutout: '62%' }), plugins: { ...base().plugins, legend: { display: true, position: 'right', labels: { color: c.text, boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3 } }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${money(ctx.parsed)} (${pct(ctx.parsed / s.revenue)})` } } } },
    }));

    const topP = [...prods].sort((a, b) => b.qty - a.qty).slice(0, 10);
    this.charts.push(new Chart($('#ch-prod'), {
      type: 'bar',
      data: { labels: topP.map(g => g.label), datasets: [{ label: 'Vendidas', isQty: true, data: topP.map(g => g.qty), backgroundColor: c.s1, ...bar }] },
      options: base({ indexAxis: 'y', scales: scales(true, true), onClick: clickTo('productId', topP.map(g => g.key)) }),
    }));

    const topC = clients.slice(0, 10);
    this.charts.push(new Chart($('#ch-client'), {
      type: 'bar',
      data: { labels: topC.map(g => g.label), datasets: [{ label: 'Comprou', data: topC.map(g => round2(g.revenue)), backgroundColor: c.s1, ...bar }] },
      options: base({ indexAxis: 'y', scales: scales(true), onClick: clickTo('clientId', topC.map(g => g.key)) }),
    }));

    const wdOrder = [1, 2, 3, 4, 5, 6, 0].map(i => wd[i]);
    this.charts.push(new Chart($('#ch-wd'), {
      type: 'bar',
      data: { labels: wdOrder.map(g => g.label.slice(0, 3)), datasets: [{ label: 'Faturamento', data: wdOrder.map(g => round2(g.revenue)), backgroundColor: c.s1, ...bar }] },
      options: base({ scales: scales(false) }),
    }));

    this.charts.push(new Chart($('#ch-seller'), {
      type: 'bar',
      data: { labels: sellers.map(g => g.label), datasets: [{ label: 'Faturamento', data: sellers.map(g => round2(g.revenue)), backgroundColor: c.s1, ...bar }] },
      options: base({ scales: scales(false), onClick: clickTo('resellerId', sellers.map(g => g.key || 'direct')) }),
    }));
  },

  colors() {
    const dark = isDark();
    return {
      s1: dark ? '#d6b994' : '#a8835e',   // dourado da marca
      s2: dark ? '#f3ece4' : '#1c1a19',   // tinta (contraste forte com o dourado)
      text: cssVar('--text'), muted: cssVar('--muted'), surface: cssVar('--surface'),
      grid: dark ? '#2c2c2a' : '#ece6df', axis: dark ? '#383835' : '#d8cfc5',
    };
  },

  actions: {
    clear(el) { Views.dashboard.f[el.dataset.k] = ''; App.refresh(); },
    'clear-all'() { Object.assign(Views.dashboard.f, { clientId: '', productId: '', categoryId: '', resellerId: '' }); App.refresh(); },
  },
};
