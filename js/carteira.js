/* Carteira: quanto entrou (bruto e líquido) e quanto falta receber. */
Views.carteira = {
  title: 'Carteira',
  period: 'month',
  tab: 'next',

  render() {
    const db = Store.db;
    const range = periodRange(this.period);
    const w = walletStats(db.sales, this.period === 'all' ? null : range);
    const pendingCommission = db.sales.filter(s => s.resellerId && !s.commissionPaid).reduce((a, s) => a + s.commission, 0);
    const periods = [['month', 'Este mês'], ['lastmonth', 'Mês passado'], ['week', 'Esta semana'], ['year', 'Este ano'], ['all', 'Tudo']];

    return html`
      <div class="chips" role="group" aria-label="Período">
        ${periods.map(([k, l]) => html`<button type="button" class="chip ${this.period === k ? 'active' : ''}" data-act="period" data-id="${k}">${l}</button>`)}
      </div>
      <div class="kpis">
        ${kpi('Recebido (bruto)', money(w.gross), 'Parcelas pagas no período', 'accent')}
        ${kpi('Recebido (líquido)', money(w.net), 'Já descontado o valor investido e comissões')}
        ${kpi('Valor investido recuperado', money(w.cost), 'Volta para repor estoque')}
        ${kpi('Comissões (no recebido)', money(w.commission), `Comissão pendente: ${money(pendingCommission)}`)}
      </div>
      <div class="kpis" style="margin-top:0">
        ${kpi('Saldo a receber', money(w.toReceive), `${w.openCount} parcela(s) · líquido ${money(w.toReceiveNet)}`)}
        ${kpi('Em atraso', money(w.late), `${w.lateCount} parcela(s)`)}
      </div>

      <div class="tabs" role="tablist">
        ${[['late', `Atrasadas (${w.lateCount})`], ['next', 'A receber'], ['paid', 'Recebidas']].map(([k, l]) => html`<button type="button" role="tab" aria-selected="${this.tab === k}" class="${this.tab === k ? 'active' : ''}" data-act="tab" data-id="${k}">${l}</button>`)}
      </div>
      <div class="list">${this.rows(range)}</div>`;
  },

  rows(range) {
    const today = todayISO();
    const all = [];
    Store.db.sales.forEach(s => s.installments.forEach(i => all.push({ s, i })));
    let list;
    if (this.tab === 'late') list = all.filter(x => !x.i.paidAt && x.i.dueDate < today).sort((a, b) => a.i.dueDate.localeCompare(b.i.dueDate));
    else if (this.tab === 'next') list = all.filter(x => !x.i.paidAt).sort((a, b) => a.i.dueDate.localeCompare(b.i.dueDate));
    else list = all.filter(x => x.i.paidAt && (this.period === 'all' || inRange(x.i.paidAt, range))).sort((a, b) => b.i.paidAt.localeCompare(a.i.paidAt));
    if (!list.length) return html`<div class="card empty"><div class="big">✨</div>Nada por aqui.</div>`;

    return list.map(({ s, i }) => {
      const c = Store.client(s.clientId);
      const late = !i.paidAt && i.dueDate < today;
      return html`<div class="item wrap" style="cursor:default">
        <span class="avatar ${late ? '' : 'gold'}">${initials(Store.clientName(s.clientId))}</span>
        <span class="i-main">
          <span class="i-title">${Store.clientName(s.clientId)}</span>
          <span class="i-sub">Parcela ${i.n}/${s.installments.length} · ${i.paidAt ? `recebida ${fmtDate(i.paidAt)}` : `vence ${fmtDate(i.dueDate)}`}</span>
        </span>
        <span class="i-end"><b>${money(i.amount)}</b>${late ? html`<span class="badge bad">Atrasada</span>` : ''}</span>
        <span class="i-actions">
          ${!i.paidAt && c?.phone ? html`<button class="btn sm whats" type="button" data-act="charge" data-sale="${s.id}" data-n="${i.n}">${icon('whats')} Lembrar</button>` : ''}
          <button class="btn sm ${i.paidAt ? '' : 'primary'}" type="button" data-act="toggle" data-sale="${s.id}" data-n="${i.n}">${i.paidAt ? 'Desfazer' : html`${icon('check')} Recebi`}</button>
        </span>
      </div>`;
    });
  },

  actions: {
    period(el) { Views.carteira.period = el.dataset.id; App.refresh(); },
    tab(el) { Views.carteira.tab = el.dataset.id; App.refresh(); },
    toggle(el) {
      const s = Store.sale(el.dataset.sale), i = s.installments.find(x => x.n === +el.dataset.n);
      i.paidAt = i.paidAt ? null : todayISO();
      Store.save();
      toast(i.paidAt ? `Recebido ${money(i.amount)} ✓` : 'Parcela voltou para "a receber"');
      App.refresh();
    },
    charge(el) {
      const s = Store.sale(el.dataset.sale), i = s.installments.find(x => x.n === +el.dataset.n), c = Store.client(s.clientId);
      const late = i.dueDate < todayISO();
      openWhatsApp(`Olá, ${c.firstName}! Tudo bem? 💛\nPassando para lembrar da parcela ${i.n}/${s.installments.length} da sua compra na *${Store.db.settings.storeName}*, no valor de *${money(i.amount)}*, ${late ? 'que venceu' : 'com vencimento'} em ${fmtDate(i.dueDate)}.\nQualquer dúvida estou à disposição!`, c.phone);
    },
  },
};
