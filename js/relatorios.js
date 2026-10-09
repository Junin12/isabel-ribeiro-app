/* Relatórios semanal e mensal: prévia na tela, PDF e envio pelo WhatsApp. */
Views.relatorios = {
  title: 'Relatórios',
  type: 'month',
  ref: '',

  options() {
    const today = todayISO(), out = [];
    if (this.type === 'month') {
      for (let i = 0; i < 24; i++) { const d = addMonths(today.slice(0, 8) + '01', -i); out.push([d, monthLabel(d)]); }
    } else {
      const start = startOfWeek(today);
      for (let i = 0; i < 16; i++) { const d = addDays(start, -7 * i); out.push([d, `${fmtDateShort(d)} a ${fmtDateShort(addDays(d, 6))}${i === 0 ? ' (esta semana)' : ''}`]); }
    }
    return out;
  },

  render() {
    const opts = this.options();
    if (!opts.some(o => o[0] === this.ref)) this.ref = opts[0][0];
    const r = buildReport(this.type, this.ref);
    return html`
      <section class="card">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" class="${this.type === 'week' ? 'active' : ''}" aria-selected="${this.type === 'week'}" data-act="type" data-id="week">Semanal</button>
          <button type="button" role="tab" class="${this.type === 'month' ? 'active' : ''}" aria-selected="${this.type === 'month'}" data-act="type" data-id="month">Mensal</button>
        </div>
        <div class="field"><label for="rp-ref">${this.type === 'month' ? 'Mês' : 'Semana'}</label>
          <select id="rp-ref">${opts.map(([v, l]) => html`<option value="${v}" ${v === this.ref ? 'selected' : ''}>${l}</option>`)}</select></div>
        <div class="row">
          <button class="btn whats" type="button" data-act="share">${icon('whats')} Enviar PDF no WhatsApp</button>
          <button class="btn" type="button" data-act="pdf">${icon('download')} Baixar PDF</button>
        </div>
      </section>
      ${reportPreview(r)}`;
  },

  onChange(e) { if (e.target.id === 'rp-ref') { this.ref = e.target.value; App.refresh(); } },

  actions: {
    type(el) { Views.relatorios.type = el.dataset.id; Views.relatorios.ref = ''; App.refresh(); },
    pdf() { const r = buildReport(Views.relatorios.type, Views.relatorios.ref); const doc = reportPdf(r); if (doc) doc.save(r.fileName); },
    async share() {
      const r = buildReport(Views.relatorios.type, Views.relatorios.ref);
      const doc = reportPdf(r);
      if (!doc) return;
      const file = new File([doc.output('blob')], r.fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: r.title, text: reportText(r) }); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
      // Computador: baixa o PDF e abre o WhatsApp com o resumo para anexar o arquivo
      doc.save(r.fileName);
      toast('PDF baixado. Anexe o arquivo na conversa do WhatsApp.', 5000);
      openWhatsApp(reportText(r));
    },
  },
};

function buildReport(type, ref) {
  const db = Store.db;
  const range = type === 'month' ? periodRange('month', ref) : periodRange('week', ref);
  const prev = prevComparable(range);
  const all = saleLines(db.sales);
  const lines = filterLines(all, { range });
  const s = summarize(lines), p = summarize(filterLines(all, { range: prev }));
  const w = walletStats(db.sales, range);
  const wd = byWeekday(lines);
  const next30 = [];
  db.sales.forEach(sale => sale.installments.forEach(i => { if (!i.paidAt && i.dueDate <= addDays(todayISO(), 30)) next30.push({ sale, i }); }));
  next30.sort((a, b) => a.i.dueDate.localeCompare(b.i.dueDate));
  const newClients = db.clients.filter(c => c.createdAt && inRange(localISO(new Date(c.createdAt)), range)).length;
  const label = type === 'month' ? monthLabel(range.from) : `${fmtDate(range.from)} a ${fmtDate(range.to)}`;
  return {
    type, range, prev, s, p, w, wd, next30, newClients,
    title: `Relatório ${type === 'month' ? 'mensal' : 'semanal'} — ${label}`,
    label,
    fileName: `relatorio-${type === 'month' ? 'mensal-' + range.from.slice(0, 7) : 'semanal-' + range.from}.pdf`,
    prods: [...byProduct(lines)].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 10),
    cats: byCategory(lines),
    clients: byClient(lines.filter(l => l.clientId)).slice(0, 10),
    sellers: byReseller(lines),
    best: bestDay(lines),
    bestWd: [...wd].sort((a, b) => b.revenue - a.revenue)[0],
    series: timeSeries(lines, range),
  };
}

const deltaPlain = (cur, prev) => !prev ? (cur ? 'novo' : '-') : `${cur >= prev ? '+' : '-'}${pct(Math.abs((cur - prev) / prev))}`;

function reportPreview(r) {
  const { s, p, w } = r;
  const table = (head, rows) => rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((h, i) => html`<th class="${i ? 'num' : ''}">${h}</th>`)}</tr></thead><tbody>${rows.map(row => html`<tr>${row.map((c, i) => html`<td class="${i ? 'num' : ''}">${c}</td>`)}</tr>`)}</tbody></table></div>` : html`<p class="muted small">Sem dados no período.</p>`;
  return html`
    <div class="section-title"><h2>${r.title}</h2></div>
    <div class="kpis">
      ${kpi('Faturamento', money(s.revenue), deltaTxt(s.revenue, p.revenue), 'accent')}
      ${kpi('Lucro líquido', money(s.profit), deltaTxt(s.profit, p.profit))}
      ${kpi('Vendas', num(s.count), deltaTxt(s.count, p.count))}
      ${kpi('Peças vendidas', num(s.pieces), deltaTxt(s.pieces, p.pieces))}
      ${kpi('Ticket médio', money(s.ticket), deltaTxt(s.ticket, p.ticket))}
      ${kpi('Recebido', money(w.gross), `Líquido ${money(w.net)}`)}
      ${kpi('A receber (total)', money(w.toReceive), `Atrasado ${money(w.late)}`)}
      ${kpi('Melhor dia', r.best ? fmtDate(r.best.date) : '—', r.best ? `${money(r.best.revenue)} · ${r.bestWd.label} é o melhor dia da semana` : '')}
    </div>
    <div class="charts">
      <section class="card"><h3>Itens mais vendidos</h3>${table(['Peça', 'Qtd', 'Faturamento', 'Lucro'], r.prods.map(g => [g.label, g.qty, money(g.revenue), money(g.profit)]))}</section>
      <section class="card"><h3>Top compradoras</h3>${table(['Cliente', 'Compras', 'Total'], r.clients.map(g => [g.label, g.count, money(g.revenue)]))}</section>
      <section class="card"><h3>Categorias</h3>${table(['Categoria', 'Peças', 'Faturamento', '%'], r.cats.map(g => [g.label, g.qty, money(g.revenue), pct(s.revenue ? g.revenue / s.revenue : 0)]))}</section>
      <section class="card"><h3>Vendedoras</h3>${table(['Vendedora', 'Vendas', 'Faturamento', 'Comissão'], r.sellers.map(g => [g.label, g.count, money(g.revenue), money(g.commission)]))}</section>
    </div>`;
}

function reportText(r) {
  const { s, p, w } = r;
  return [
    `*${Store.db.settings.storeName}*`,
    `📊 ${r.title}`, '',
    `💰 Faturamento: ${money(s.revenue)} (${deltaPlain(s.revenue, p.revenue)})`,
    `✨ Lucro líquido: ${money(s.profit)}`,
    `🛍️ Vendas: ${s.count} · Peças: ${s.pieces}`,
    `🎯 Ticket médio: ${money(s.ticket)}`,
    `📥 Recebido: ${money(w.gross)} · A receber: ${money(w.toReceive)}`,
    r.prods[0] ? `🏆 Peça campeã: ${r.prods[0].label} (${r.prods[0].qty} un.)` : null,
    r.clients[0] ? `👑 Top compradora: ${r.clients[0].label}` : null,
  ].filter(Boolean).join('\n');
}

// ---------- PDF ----------
function reportPdf(r) {
  if (!window.jspdf) { toast('Sem internet para gerar o PDF. Tente novamente conectada.'); return null; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 14;
  const GOLD = [168, 131, 94], INK = [28, 26, 25], MUTED = [111, 102, 94], LIGHT = [244, 235, 223];
  const { s, p, w } = r;

  // Cabeçalho da marca
  doc.setFillColor(20, 20, 20); doc.rect(0, 0, W, 38, 'F');
  doc.setTextColor(214, 185, 148); doc.setFont('times', 'normal'); doc.setFontSize(24);
  doc.text('isabel ribeiro', W / 2, 18, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setCharSpace(2.6);
  doc.text('SEMIJOIAS', W / 2 + 1.3, 25, { align: 'center' });
  doc.setCharSpace(0);
  doc.setFontSize(9); doc.setTextColor(179, 168, 156);
  doc.text(r.title, W / 2, 32.5, { align: 'center' });

  let y = 46;
  doc.setTextColor(...MUTED); doc.setFontSize(8.5);
  doc.text(`Período: ${fmtDate(r.range.from)} a ${fmtDate(r.range.to)}   |   Comparado com: ${fmtDate(r.prev.from)} a ${fmtDate(r.prev.to)}   |   Gerado em ${new Date().toLocaleString('pt-BR')}`, M, y);
  y += 6;

  // Cartões de indicadores (4 por linha)
  const cards = [
    ['Faturamento', money(s.revenue), deltaPlain(s.revenue, p.revenue)],
    ['Lucro líquido', money(s.profit), deltaPlain(s.profit, p.profit)],
    ['Vendas', num(s.count), deltaPlain(s.count, p.count)],
    ['Ticket médio', money(s.ticket), deltaPlain(s.ticket, p.ticket)],
    ['Peças vendidas', num(s.pieces), deltaPlain(s.pieces, p.pieces)],
    ['Margem', pct(s.margin), `Comissões ${money(s.commission)}`],
    ['Recebido no período', money(w.gross), `Líquido ${money(w.net)}`],
    ['A receber (total)', money(w.toReceive), `Atrasado ${money(w.late)}`],
  ];
  const cw = (W - 2 * M - 3 * 4) / 4, ch = 20;
  cards.forEach(([label, value, sub], i) => {
    const x = M + (i % 4) * (cw + 4), yy = y + Math.floor(i / 4) * (ch + 4);
    doc.setFillColor(...(i === 0 ? [20, 20, 20] : LIGHT)); doc.roundedRect(x, yy, cw, ch, 2.5, 2.5, 'F');
    doc.setFontSize(7.5); doc.setTextColor(...(i === 0 ? [179, 168, 156] : MUTED)); doc.text(label, x + 3.5, yy + 5.5);
    doc.setFontSize(12.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...(i === 0 ? [214, 185, 148] : INK)); doc.text(value, x + 3.5, yy + 12.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...(i === 0 ? [179, 168, 156] : MUTED));
    doc.text(/^[+-]|novo/.test(sub) ? `${sub} vs. período anterior` : sub, x + 3.5, yy + 17);
  });
  y += 2 * (ch + 4) + 4;

  // Gráfico de barras desenhado direto no PDF
  const chart = (title, labels, values) => {
    const h = 42, x0 = M, wTot = W - 2 * M;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK); doc.text(title, x0, y); doc.setFont('helvetica', 'normal');
    y += 4;
    const max = Math.max(...values, 1);
    const n = values.length, gap = n > 20 ? 0.6 : 2, bw = (wTot - gap * (n - 1)) / n;
    doc.setDrawColor(216, 207, 197); doc.line(x0, y + h, x0 + wTot, y + h);
    values.forEach((v, i) => {
      const bh = (v / max) * (h - 6);
      if (bh > 0) { doc.setFillColor(...GOLD); doc.rect(x0 + i * (bw + gap), y + h - bh, bw, bh, 'F'); }
      const step = n > 16 ? Math.ceil(n / 10) : 1;
      if (i % step === 0) { doc.setFontSize(6.5); doc.setTextColor(...MUTED); doc.text(labels[i], x0 + i * (bw + gap) + bw / 2, y + h + 4, { align: 'center' }); }
    });
    doc.setFontSize(6.5); doc.setTextColor(...MUTED); doc.text(`máx. ${money(max)}`, x0 + wTot, y + 2, { align: 'right' });
    y += h + 10;
  };
  if (r.type === 'month') chart('Faturamento por dia', r.series.keys.map(k => k.slice(8)), r.series.revenue);
  else { const order = [1, 2, 3, 4, 5, 6, 0].map(i => r.wd[i]); chart('Faturamento por dia da semana', order.map(g => g.label), order.map(g => g.revenue)); }

  const table = (title, head, body, opts = {}) => {
    if (y > 250) { doc.addPage(); y = 18; }
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK); doc.text(title, M, y); doc.setFont('helvetica', 'normal');
    doc.autoTable({
      startY: y + 2, head: [head], body: body.length ? body : [[{ content: 'Sem dados no período', colSpan: head.length, styles: { textColor: MUTED } }]],
      margin: { left: M, right: M }, theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: 1.8, textColor: INK, lineColor: [230, 221, 211], lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: LIGHT, textColor: [90, 70, 50], fontStyle: 'bold' },
      columnStyles: Object.fromEntries(head.map((_, i) => [i, { halign: i ? 'right' : 'left' }])),
      didParseCell: c => { if (c.section === 'head' && c.column.index > 0) c.cell.styles.halign = 'right'; },
      ...opts,
    });
    y = doc.lastAutoTable.finalY + 9;
  };

  table('Itens mais vendidos', ['Peça', 'Qtd', 'Faturamento', 'Lucro'], r.prods.map(g => [g.label, g.qty, money(g.revenue), money(g.profit)]));
  table('Categorias mais vendidas', ['Categoria', 'Peças', 'Faturamento', '% do total'], r.cats.map(g => [g.label, g.qty, money(g.revenue), pct(s.revenue ? g.revenue / s.revenue : 0)]));
  table('Top compradoras', ['Cliente', 'Compras', 'Peças', 'Total'], r.clients.map(g => [g.label, g.count, g.qty, money(g.revenue)]));
  table('Vendas por dia da semana', ['Dia', 'Vendas', 'Peças', 'Faturamento'], [1, 2, 3, 4, 5, 6, 0].map(i => r.wd[i]).map(g => [g.label, g.count, g.qty, money(g.revenue)]));
  table('Revendedoras x venda direta', ['Vendedora', 'Vendas', 'Peças', 'Faturamento', 'Lucro', 'Comissão'], r.sellers.map(g => [g.label, g.count, g.qty, money(g.revenue), money(g.profit), money(g.commission)]));
  table('Parcelas a receber (vencidas e próximos 30 dias)', ['Cliente', 'Parcela', 'Vencimento', 'Valor'], r.next30.slice(0, 40).map(({ sale, i }) => [Store.saleClientName(sale), `${i.n}/${sale.installments.length}`, fmtDate(i.dueDate) + (i.dueDate < todayISO() ? ' (atrasada)' : ''), money(i.amount)]));

  if (y > 260) { doc.addPage(); y = 18; }
  doc.setFontSize(9); doc.setTextColor(...MUTED);
  const notes = [
    r.best ? `Melhor data: ${fmtDate(r.best.date)} (${money(r.best.revenue)}). Melhor dia da semana: ${r.bestWd.label}.` : 'Sem vendas no período.',
    `Novas clientes cadastradas no período: ${r.newClients}.`,
    'Lucro líquido = valor vendido - valor investido nas peças - comissões (impostos não considerados).',
  ];
  notes.forEach(t => { doc.text(t, M, y); y += 5; });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`${Store.db.settings.storeName} · página ${i} de ${pages}`, W / 2, 290, { align: 'center' });
  }
  return doc;
}
