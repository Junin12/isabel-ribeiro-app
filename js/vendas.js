/* Vendas: lista, detalhe e formulário de nova venda. */

// Baixa (sign = 1) ou devolve (sign = -1) o estoque de uma venda
function applyStock(sale, sign) {
  for (const it of sale.items) {
    if (sale.resellerId) {
      const r = Store.reseller(sale.resellerId);
      if (r) r.stock[it.productId] = (+r.stock[it.productId] || 0) - sign * it.qty;
    } else {
      const p = Store.product(it.productId);
      if (p) p.stock = (+p.stock || 0) - sign * it.qty;
    }
  }
}

function saleReceipt(s) {
  const c = Store.client(s.clientId);
  const lines = [
    `Olá, ${c?.firstName || ''}! 💛 Obrigada pela compra na *${Store.db.settings.storeName}*.`, '',
    ...s.items.map(i => `• ${i.qty}× ${i.name} — ${money(i.qty * i.price)}`),
    s.discount ? `Desconto: −${money(s.discount)}` : null,
    `*Total: ${money(s.total)}*`, '',
    s.installments.length > 1 ? '*Parcelas:*' : '*Pagamento:*',
    ...s.installments.map(i => `${i.n}/${s.installments.length} — ${fmtDate(i.dueDate)} — ${money(i.amount)} ${i.paidAt ? '✅ pago' : ''}`),
  ];
  return lines.filter(l => l !== null).join('\n');
}

Views.vendas = {
  title: 'Vendas',
  f: { month: '', seller: '', status: '', q: '' },

  render() {
    const db = Store.db;
    if (!this.f.month && db.sales.length) this.f.month = todayISO().slice(0, 7);
    const months = [...new Set([todayISO().slice(0, 7), ...db.sales.map(s => s.date.slice(0, 7))])].sort().reverse();
    return html`
      <div class="toolbar">
        <a class="btn primary" href="#/vendas/nova">${icon('plus')} Nova venda</a>
        <input type="search" id="v-q" placeholder="Buscar cliente…" aria-label="Buscar venda por cliente" value="${this.f.q}">
      </div>
      <div class="filters" style="margin-bottom:14px">
        <div class="field"><label for="v-month">Mês</label><select id="v-month">
          <option value="all">Todos</option>
          ${months.map(m => html`<option value="${m}" ${this.f.month === m ? 'selected' : ''}>${monthLabel(m + '-01')}</option>`)}
        </select></div>
        <div class="field"><label for="v-seller">Vendedora</label><select id="v-seller">
          <option value="">Todas</option><option value="direct" ${this.f.seller === 'direct' ? 'selected' : ''}>Venda direta</option>
          ${db.resellers.map(r => html`<option value="${r.id}" ${this.f.seller === r.id ? 'selected' : ''}>${r.name}</option>`)}
        </select></div>
        <div class="field"><label for="v-status">Pagamento</label><select id="v-status">
          ${[['', 'Todos'], ['open', 'Em aberto'], ['late', 'Atrasadas'], ['paid', 'Pagas']].map(([v, l]) => html`<option value="${v}" ${this.f.status === v ? 'selected' : ''}>${l}</option>`)}
        </select></div>
      </div>
      <div id="vlist">${this.list()}</div>`;
  },

  list() {
    const f = this.f, q = normalize(f.q);
    const list = Store.db.sales.filter(s =>
      (f.month === 'all' || !f.month || s.date.startsWith(f.month)) &&
      (!f.seller || (f.seller === 'direct' ? !s.resellerId : s.resellerId === f.seller)) &&
      (!f.status || saleStatus(s).key === f.status) &&
      (!q || normalize(Store.clientName(s.clientId)).includes(q))
    ).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    if (!list.length) return html`<div class="card empty"><div class="big">🛍️</div>Nenhuma venda encontrada.</div>`;
    const tot = list.reduce((a, s) => ({ total: a.total + s.total, profit: a.profit + s.profit }), { total: 0, profit: 0 });
    return html`<p class="small muted">${list.length} venda(s) · ${money(tot.total)} · lucro ${money(tot.profit)}</p><div class="list">${list.map(saleItem)}</div>`;
  },

  onInput(e) { if (e.target.id === 'v-q') { this.f.q = e.target.value; $('#vlist').innerHTML = String(this.list()); } },
  onChange(e) {
    const map = { 'v-month': 'month', 'v-seller': 'seller', 'v-status': 'status' };
    if (map[e.target.id]) { this.f[map[e.target.id]] = e.target.value; $('#vlist').innerHTML = String(this.list()); }
  },

  actions: { 'open-sale': el => Views.vendas.openSale(el.dataset.id) },

  openSale(id) {
    const s = Store.sale(id);
    if (!s) return;
    const c = Store.client(s.clientId);
    const actions = [
      { id: 'edit', label: 'Editar', icon: 'edit', run: () => { Modal.close(); location.hash = `#/vendas/editar/${s.id}`; } },
      { id: 'del', label: 'Excluir', icon: 'trash', cls: 'danger', run: async () => {
        if (!(await confirmBox('Excluir esta venda? As peças voltam para o estoque.', 'Excluir venda'))) return;
        applyStock(s, -1);
        Store.db.sales = Store.db.sales.filter(x => x.id !== s.id);
        Store.save(); toast('Venda excluída'); App.refresh();
      } },
    ];
    if (c?.phone) actions.unshift({ id: 'wa', label: 'Enviar à cliente', icon: 'whats', cls: 'whats', run: () => openWhatsApp(saleReceipt(s), c.phone) });

    Modal.open({
      title: `Venda — ${Store.clientName(s.clientId)}`,
      hideSubmit: true,
      actions,
      body: html`
        <p class="muted small">${fmtDate(s.date)} · ${Store.sellerName(s.resellerId)}${s.resellerId ? ` (comissão ${s.commissionRate}%)` : ''}</p>
        <table class="tbl"><thead><tr><th>Peça</th><th class="num">Qtd</th><th class="num">Valor</th></tr></thead>
          <tbody>${s.items.map(i => html`<tr><td>${i.name}</td><td class="num">${i.qty}</td><td class="num">${money(i.qty * i.price)}</td></tr>`)}</tbody></table>
        <div style="margin:12px 0">
          ${s.discount ? html`<div class="sum-line"><span>Desconto</span><span>−${money(s.discount)}</span></div>` : ''}
          <div class="sum-line"><span>Total</span><b>${money(s.total)}</b></div>
          <div class="sum-line muted"><span>Valor investido</span><span>${money(s.cost)}</span></div>
          ${s.commission ? html`<div class="sum-line muted"><span>Comissão</span><span>${money(s.commission)}</span></div>` : ''}
          <div class="sum-line"><span>Lucro líquido</span><b style="color:var(--good)">${money(s.profit)}</b></div>
        </div>
        <div class="small" style="font-weight:600;margin-bottom:8px">Parcelas — marque quando receber</div>
        <div id="inst-list">${s.installments.map(i => html`
          <label class="pick ${i.paidAt ? 'on' : ''}" style="margin-bottom:8px;cursor:pointer">
            <input type="checkbox" data-inst="${i.n}" ${i.paidAt ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--primary)">
            <span class="grow"><b>${i.n}/${s.installments.length}</b> · vence ${fmtDate(i.dueDate)}${i.paidAt ? html`<br><span class="small muted">Recebido em ${fmtDate(i.paidAt)}</span>` : i.dueDate < todayISO() ? html`<br><span class="badge bad">Atrasada</span>` : ''}</span>
            <b>${money(i.amount)}</b>
          </label>`)}</div>
        ${s.notes ? html`<p class="small"><b>Obs.:</b> ${s.notes}</p>` : ''}`,
      onOpen() {
        $('#inst-list').onchange = e => {
          const i = s.installments.find(x => x.n === +e.target.dataset.inst);
          i.paidAt = e.target.checked ? todayISO() : null;
          Store.save();
          toast(e.target.checked ? 'Parcela marcada como recebida ✓' : 'Parcela marcada como em aberto');
          App.refresh();
          Views.vendas.openSale(s.id);
        };
      },
    });
  },
};

// ================= FORMULÁRIO DE VENDA =================
Views['venda-form'] = {
  title: p => p[0] ? 'Editar venda' : 'Nova venda',
  keepOnSync: true,
  d: null,

  render([editId]) {
    const db = Store.db;
    const orig = editId ? Store.sale(editId) : null;
    if (editId && !orig) return html`<div class="card empty">Venda não encontrada.</div>`;
    const qty = {}, snap = {};
    orig?.items.forEach(i => { qty[i.productId] = i.qty; snap[i.productId] = i; });
    this.d = {
      orig, qty, snap, cat: '', q: '',
      date: orig?.date || todayISO(),
      clientId: orig?.clientId || '',
      resellerId: orig?.resellerId || this.preseller || '',
      discount: orig?.discount || 0,
      count: orig?.installments.length || 1,
      firstDate: orig?.installments[0]?.dueDate || todayISO(),
      installments: orig ? orig.installments.map(i => ({ ...i })) : null,
      notes: orig?.notes || '',
    };
    this.preseller = null;
    const d = this.d;
    if (!db.products.length) return html`<div class="card empty"><div class="big">💎</div>Cadastre produtos antes de registrar vendas.<br><br><a class="btn primary" href="#/produtos">Ir para Produtos</a></div>`;

    return html`
      <div class="sale-layout">
        <div>
          <section class="card">
            <h3>1. Venda</h3>
            <div class="grid2">
              <div class="field"><label for="s-seller">Quem vendeu?</label>
                <select id="s-seller">
                  <option value="">Eu (venda direta)</option>
                  ${db.resellers.map(r => html`<option value="${r.id}" ${d.resellerId === r.id ? 'selected' : ''}>${r.name} — ${r.commission || 0}%</option>`)}
                </select></div>
              <div class="field"><label for="s-date">Data da venda</label><input id="s-date" type="date" value="${d.date}" required></div>
            </div>
            <div class="field"><label for="s-client">Para qual cliente? <span class="req">*</span></label>
              <div class="row"><select id="s-client" class="grow" style="flex:1">${this.clientOptions()}</select>
                <button class="btn" type="button" data-act="new-client">${icon('plus')} Nova</button></div></div>
          </section>

          <section class="card">
            <h3>2. Peças vendidas</h3>
            <div class="chips" role="group" aria-label="Filtrar por categoria">
              <button type="button" class="chip active" data-act="cat" data-id="">Todas</button>
              ${db.categories.map(c => html`<button type="button" class="chip" data-act="cat" data-id="${c.id}">${c.name}</button>`)}
            </div>
            <input type="search" id="s-q" placeholder="Buscar peça…" aria-label="Buscar peça" style="margin-bottom:10px">
            <div class="list" id="s-picks"></div>
          </section>

          <section class="card">
            <h3>3. Pagamento</h3>
            <div class="grid3">
              <div class="field"><label for="s-discount">Desconto (R$)</label><input id="s-discount" type="number" min="0" step="0.01" inputmode="decimal" value="${d.discount || ''}" placeholder="0,00"></div>
              <div class="field"><label for="s-count">Parcelas</label><select id="s-count">
                ${Array.from({ length: 12 }, (_, i) => html`<option value="${i + 1}" ${d.count === i + 1 ? 'selected' : ''}>${i === 0 ? 'À vista (1x)' : `${i + 1}x`}</option>`)}
              </select></div>
              <div class="field"><label for="s-first">1º pagamento</label><input id="s-first" type="date" value="${d.firstDate}"></div>
            </div>
            <div class="inst-row small muted" style="margin-bottom:4px"><span>Nº</span><span>Vencimento</span><span>Valor</span><span>Pago</span></div>
            <div id="s-inst"></div>
            <p class="small" id="s-inst-msg" role="alert"></p>
          </section>

          <section class="card">
            <div class="field" style="margin:0"><label for="s-notes">Observações</label><textarea id="s-notes" placeholder="Opcional">${d.notes}</textarea></div>
          </section>
        </div>

        <aside class="card sale-side" aria-label="Resumo da venda">
          <h3>Resumo</h3>
          <div id="s-summary"></div>
          <button class="btn primary block" type="button" data-act="save" style="margin-top:14px;min-height:52px">${icon('check')} ${orig ? 'Salvar alterações' : 'Registrar venda'}</button>
        </aside>
      </div>`;
  },

  after() {
    if (!this.d) return;
    this.renderPicks();
    if (!this.d.installments) this.regen(); else this.renderInst();
    this.renderSummary();
  },

  clientOptions() {
    const d = this.d;
    const list = [...Store.db.clients].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    return html`<option value="">Selecione…</option>${list.map(c => html`<option value="${c.id}" ${d.clientId === c.id ? 'selected' : ''}>${c.firstName} ${c.lastName}</option>`)}`;
  },

  available(pid) {
    const d = this.d;
    let n = d.resellerId ? (+Store.reseller(d.resellerId)?.stock[pid] || 0) : (+Store.product(pid)?.stock || 0);
    if (d.orig && (d.orig.resellerId || '') === d.resellerId) n += d.orig.items.filter(i => i.productId === pid).reduce((a, i) => a + i.qty, 0);
    return n;
  },

  // Itens no formato gravado na venda (preço/custo congelados)
  items() {
    const d = this.d;
    return Object.entries(d.qty).filter(([, q]) => q > 0).map(([pid, q]) => {
      const p = Store.product(pid), s = d.snap[pid];
      return { productId: pid, name: p?.name || s?.name, categoryId: p?.categoryId || s?.categoryId, qty: q, price: s ? s.price : +p.price || 0, cost: s ? s.cost : +p.cost || 0 };
    });
  },

  calc() {
    const d = this.d;
    const r = Store.reseller(d.resellerId);
    const rate = d.orig && (d.orig.resellerId || '') === d.resellerId ? d.orig.commissionRate : (+r?.commission || 0);
    return calcSale({ resellerId: d.resellerId || null, commissionRate: d.resellerId ? rate : 0, discount: d.discount, items: this.items() });
  },

  renderPicks() {
    const d = this.d, q = normalize(d.q);
    const list = Store.db.products
      .filter(p => (!d.cat || p.categoryId === d.cat) && (!q || normalize(p.name).includes(q)))
      .filter(p => this.available(p.id) > 0 || d.qty[p.id])
      .sort((a, b) => a.name.localeCompare(b.name));
    $('#s-picks').innerHTML = list.length ? String(html`${list.map(p => {
      const n = d.qty[p.id] || 0, av = this.available(p.id);
      return html`<div class="pick ${n ? 'on' : ''}">
        ${p.photos?.[0] ? html`<img src="${p.photos[0]}" alt="">` : html`<span class="noimg">💎</span>`}
        <span class="grow"><b>${p.name}</b><br><span class="small muted">${money(d.snap[p.id]?.price ?? p.price)} · ${av} disponível(is)</span></span>
        <span class="stepper">
          <button type="button" data-act="qty" data-id="${p.id}" data-d="-1" aria-label="Diminuir ${p.name}">−</button>
          <output aria-label="Quantidade">${n}</output>
          <button type="button" data-act="qty" data-id="${p.id}" data-d="1" aria-label="Aumentar ${p.name}" ${n >= av ? 'disabled' : ''}>+</button>
        </span>
      </div>`;
    })}`) : `<p class="muted small">${d.resellerId ? 'Esta revendedora não tem peças em estoque. Envie peças para ela em Revendedoras.' : 'Nenhuma peça disponível em estoque.'}</p>`;
  },

  regen() {
    const d = this.d, total = this.calc().total;
    const today = todayISO();
    d.installments = splitInstallments(total, d.count, d.firstDate).map(i => ({ ...i, paidAt: i.dueDate <= today ? i.dueDate : null }));
    this.renderInst();
  },

  renderInst() {
    const d = this.d;
    $('#s-inst').innerHTML = String(html`${d.installments.map((i, k) => html`<div class="inst-row">
      <b>${i.n}ª</b>
      <input type="date" data-inst-date="${k}" value="${i.dueDate}" aria-label="Vencimento parcela ${i.n}">
      <input type="number" step="0.01" min="0" inputmode="decimal" data-inst-amt="${k}" value="${i.amount}" aria-label="Valor parcela ${i.n}">
      <input type="checkbox" data-inst-paid="${k}" ${i.paidAt ? 'checked' : ''} aria-label="Parcela ${i.n} paga" style="width:22px;height:22px;accent-color:var(--primary)">
    </div>`)}`);
    this.checkInst();
  },

  checkInst() {
    const d = this.d, total = this.calc().total;
    const sum = round2(d.installments.reduce((a, i) => a + (+i.amount || 0), 0));
    const ok = Math.abs(sum - total) < 0.01;
    const el = $('#s-inst-msg');
    el.textContent = ok ? '' : `A soma das parcelas (${money(sum)}) está diferente do total (${money(total)}).`;
    el.style.color = 'var(--bad)';
    return ok;
  },

  renderSummary() {
    const s = this.calc();
    $('#s-summary').innerHTML = String(html`
      ${s.items.length ? html`<table class="tbl"><tbody>${s.items.map(i => html`<tr><td>${i.qty}× ${i.name}</td><td class="num">${money(i.qty * i.price)}</td></tr>`)}</tbody></table>`
        : html`<p class="muted small">Nenhuma peça selecionada.</p>`}
      <div style="margin-top:10px">
        <div class="sum-line"><span>Subtotal</span><span>${money(s.subtotal)}</span></div>
        ${s.discount ? html`<div class="sum-line"><span>Desconto</span><span>−${money(s.discount)}</span></div>` : ''}
        <div class="sum-line total"><span>Total</span><span>${money(s.total)}</span></div>
        <div class="sum-line muted small"><span>Valor investido</span><span>${money(s.cost)}</span></div>
        ${s.commission ? html`<div class="sum-line muted small"><span>Comissão (${s.commissionRate}%)</span><span>${money(s.commission)}</span></div>` : ''}
        <div class="sum-line"><span>Lucro líquido</span><b style="color:var(--good)">${money(s.profit)}</b></div>
      </div>`);
  },

  // Mudou algo que altera o total → recalcula parcelas e resumo
  totalChanged() { this.regen(); this.renderSummary(); },

  onInput(e) {
    const d = this.d, t = e.target;
    if (t.id === 's-q') { d.q = t.value; this.renderPicks(); }
    else if (t.id === 's-discount') { d.discount = +t.value || 0; this.totalChanged(); }
    else if (t.id === 's-notes') d.notes = t.value;
    else if (t.dataset.instAmt) { d.installments[+t.dataset.instAmt].amount = round2(t.value); this.checkInst(); }
  },

  onChange(e) {
    const d = this.d, t = e.target;
    if (t.id === 's-seller') {
      d.resellerId = t.value;
      // mantém só as quantidades que a nova vendedora tem em estoque
      for (const pid of Object.keys(d.qty)) d.qty[pid] = Math.min(d.qty[pid], this.available(pid));
      this.renderPicks(); this.totalChanged();
    } else if (t.id === 's-client') d.clientId = t.value;
    else if (t.id === 's-date') { d.date = t.value; if (d.count === 1) { d.firstDate = t.value; $('#s-first').value = t.value; this.regen(); } }
    else if (t.id === 's-count') { d.count = +t.value; this.regen(); }
    else if (t.id === 's-first') { d.firstDate = t.value || todayISO(); this.regen(); }
    else if (t.dataset.instDate) d.installments[+t.dataset.instDate].dueDate = t.value;
    else if (t.dataset.instPaid) { const i = d.installments[+t.dataset.instPaid]; i.paidAt = t.checked ? (i.dueDate <= todayISO() ? i.dueDate : todayISO()) : null; }
  },

  actions: {
    cat(el) {
      const v = Views['venda-form'];
      v.d.cat = el.dataset.id;
      $$('[data-act=cat]').forEach(b => b.classList.toggle('active', b === el));
      v.renderPicks();
    },
    qty(el) {
      const v = Views['venda-form'], d = v.d, pid = el.dataset.id;
      d.qty[pid] = Math.max(0, Math.min(v.available(pid), (d.qty[pid] || 0) + +el.dataset.d));
      v.renderPicks(); v.totalChanged();
    },
    'new-client'() {
      const v = Views['venda-form'];
      clientForm(null, c => { v.d.clientId = c.id; $('#s-client').innerHTML = String(v.clientOptions()); });
    },
    save() {
      const v = Views['venda-form'], d = v.d, db = Store.db;
      if (!d.clientId) { toast('Escolha a cliente'); $('#s-client').focus(); return; }
      const sale = v.calc();
      if (!sale.items.length) { toast('Selecione ao menos uma peça'); return; }
      if (sale.items.some(i => i.qty > v.available(i.productId))) { toast('Quantidade maior que o estoque disponível'); return; }
      if (!v.checkInst()) { toast('Ajuste o valor das parcelas'); return; }
      if (d.installments.some(i => !i.dueDate)) { toast('Preencha a data de todas as parcelas'); return; }

      Object.assign(sale, {
        id: d.orig?.id || uid(), createdAt: d.orig?.createdAt || Date.now(),
        date: d.date || todayISO(), clientId: d.clientId, notes: d.notes.trim(),
        commissionPaid: d.orig?.commissionPaid && d.orig.resellerId === sale.resellerId ? d.orig.commissionPaid : false,
        installments: d.installments.map((i, k) => ({ n: k + 1, dueDate: i.dueDate, amount: round2(i.amount), paidAt: i.paidAt || null })),
      });
      if (d.orig) {
        applyStock(d.orig, -1);
        db.sales = db.sales.map(s => s.id === sale.id ? sale : s);
      } else db.sales.push(sale);
      applyStock(sale, 1);
      Store.save();
      toast(d.orig ? 'Venda atualizada ✓' : 'Venda registrada ✓');
      location.hash = '#/vendas';
    },
  },
};
