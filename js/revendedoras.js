/* Revendedoras: cadastro, estoque consignado, vendas e comissões. */

function resellerStats(r) {
  const sales = Store.db.sales.filter(s => s.resellerId === r.id);
  const sum = summarize(saleLines(sales));
  const stockPieces = Object.values(r.stock).reduce((a, q) => a + Math.max(0, +q || 0), 0);
  const stockValue = Object.entries(r.stock).reduce((a, [pid, q]) => a + Math.max(0, +q || 0) * (+Store.product(pid)?.price || 0), 0);
  const pending = sales.filter(s => !s.commissionPaid).reduce((a, s) => a + s.commission, 0);
  const month = summarize(filterLines(saleLines(sales), { range: periodRange('month') }));
  return { sales, sum, stockPieces, stockValue, pending, month };
}

Views.revendedoras = {
  title: 'Revendedoras',
  render() {
    const list = [...Store.db.resellers].sort((a, b) => a.name.localeCompare(b.name));
    return html`
      <div class="toolbar"><button class="btn primary" type="button" data-act="new">${icon('plus')} Nova revendedora</button></div>
      ${list.length ? html`<div class="list">${list.map(r => {
        const st = resellerStats(r);
        return html`<a class="item" href="#/revendedoras/${r.id}" style="text-decoration:none;color:inherit">
          <span class="avatar gold">${initials(r.name)}</span>
          <span class="i-main"><span class="i-title">${r.name}</span>
            <span class="i-sub">Comissão ${r.commission || 0}% · ${st.stockPieces} peça(s) com ela · no mês ${money(st.month.revenue)}</span></span>
          <span class="i-end"><b>${money(st.sum.revenue)}</b>${st.pending ? html`<span class="badge warn">Comissão ${money(st.pending)}</span>` : html`<span class="badge good">Comissão em dia</span>`}</span>
        </a>`;
      })}</div>` : html`<div class="card empty"><div class="big">⭐</div>Nenhuma revendedora cadastrada.<br><br><button class="btn primary" type="button" data-act="new">Cadastrar revendedora</button></div>`}`;
  },
  actions: { new() { resellerForm(); } },
};

function resellerForm(r) {
  const isNew = !r;
  r = r || { stock: {} };
  Modal.open({
    title: isNew ? 'Nova revendedora' : 'Editar revendedora',
    actions: isNew ? [] : [{ id: 'del', label: 'Excluir', icon: 'trash', cls: 'danger', run: async () => {
      if (resellerStats(r).stockPieces) return toast('Registre a devolução das peças antes de excluir.', 4000);
      if (Store.db.sales.some(s => s.resellerId === r.id)) return toast('Ela tem vendas registradas e não pode ser excluída.', 4000);
      if (!(await confirmBox(`Excluir ${r.name}?`, 'Excluir'))) return;
      Store.db.resellers = Store.db.resellers.filter(x => x.id !== r.id); Store.save(); location.hash = '#/revendedoras';
    } }],
    body: html`
      <div class="field"><label for="r-name">Nome <span class="req">*</span></label><input id="r-name" name="name" type="text" required value="${r.name || ''}"></div>
      <div class="grid2">
        <div class="field"><label for="r-phone">WhatsApp</label><input id="r-phone" name="phone" type="tel" inputmode="tel" value="${r.phone || ''}"></div>
        <div class="field"><label for="r-com">Comissão (%) <span class="req">*</span></label><input id="r-com" name="commission" type="number" min="0" max="100" step="0.5" inputmode="decimal" required value="${r.commission ?? 30}"><span class="hint">Sobre o valor de cada venda dela</span></div>
      </div>
      <div class="field"><label for="r-notes">Observações</label><textarea id="r-notes" name="notes" placeholder="Cidade, como acertam, dia do acerto…">${r.notes || ''}</textarea></div>`,
    onSubmit(form) {
      const d = formData(form);
      Object.assign(r, { name: d.name.trim(), phone: d.phone.trim(), commission: Math.min(100, Math.max(0, +d.commission || 0)), notes: d.notes.trim() });
      if (isNew) { r.id = uid(); r.createdAt = Date.now(); Store.db.resellers.push(r); }
      Store.save(); toast('Revendedora salva ✓');
      if (isNew) location.hash = `#/revendedoras/${r.id}`; else App.refresh();
    },
  });
}

// Envia (+) ou devolve (−) peças entre o estoque principal e a revendedora
function stockMoveForm(r, dir) {
  const db = Store.db;
  const send = dir > 0;
  const options = send
    ? db.products.filter(p => (+p.stock || 0) > 0).map(p => ({ p, max: +p.stock }))
    : Object.entries(r.stock).filter(([, q]) => q > 0).map(([pid, q]) => ({ p: Store.product(pid), max: q })).filter(o => o.p);
  if (!options.length) return toast(send ? 'Não há peças no seu estoque para enviar.' : 'Ela não tem peças para devolver.');
  options.sort((a, b) => a.p.name.localeCompare(b.p.name));

  Modal.open({
    title: send ? `Enviar peças para ${r.name}` : `Devolução de ${r.name}`,
    submitText: send ? 'Enviar peças' : 'Registrar devolução',
    body: html`<p class="muted small">${send ? 'Informe quantas peças de cada item ela está levando. Sai do seu estoque e entra no dela.' : 'Informe quantas peças ela devolveu. Volta para o seu estoque.'}</p>
      <input type="search" id="mv-q" placeholder="Buscar peça…" aria-label="Buscar peça" style="margin-bottom:10px">
      <div class="list" id="mv-list">${options.map(({ p, max }) => html`
        <label class="pick" data-name="${normalize(p.name)}">
          ${p.photos?.[0] ? html`<img src="${p.photos[0]}" alt="">` : html`<span class="noimg">💎</span>`}
          <span class="grow"><b>${p.name}</b><br><span class="small muted">${send ? 'Seu estoque' : 'Com ela'}: ${max}</span></span>
          <input type="number" name="q_${p.id}" min="0" max="${max}" step="1" inputmode="numeric" placeholder="0" style="width:80px" aria-label="Quantidade de ${p.name}">
        </label>`)}</div>`,
    onOpen() {
      $('#mv-q').oninput = e => { const q = normalize(e.target.value); $$('#mv-list .pick').forEach(el => { el.hidden = !el.dataset.name.includes(q); }); };
    },
    onSubmit(form) {
      let moved = 0;
      for (const { p, max } of options) {
        const q = Math.min(max, Math.max(0, parseInt(form['q_' + p.id].value, 10) || 0));
        if (!q) continue;
        p.stock = (+p.stock || 0) - dir * q;
        r.stock[p.id] = (+r.stock[p.id] || 0) + dir * q;
        db.stockMoves.push({ id: uid(), date: todayISO(), resellerId: r.id, productId: p.id, qty: dir * q });
        moved += q;
      }
      if (!moved) { toast('Informe ao menos uma quantidade'); return false; }
      Store.save(); toast(`${moved} peça(s) ${send ? 'enviadas' : 'devolvidas'} ✓`); App.refresh();
    },
  });
}

Views.revendedora = {
  title: () => 'Revendedora',
  render() {
    const r = Store.reseller(location.hash.split('/')[2]);
    if (!r) return html`<div class="card empty">Revendedora não encontrada. <a href="#/revendedoras">Voltar</a></div>`;
    const st = resellerStats(r);
    const top = byProduct(saleLines(st.sales)).slice(0, 5);
    const stock = Object.entries(r.stock).filter(([, q]) => q > 0).map(([pid, q]) => ({ p: Store.product(pid), q })).filter(x => x.p);
    const sales = [...st.sales].sort((a, b) => b.date.localeCompare(a.date));
    $('#page-title').textContent = r.name;

    return html`
      <div class="row between" style="margin-bottom:6px">
        <div><h2 style="font-family:var(--font-display);font-size:1.7rem">${r.name}</h2><span class="muted small">Comissão ${r.commission || 0}%${r.phone ? ` · ${r.phone}` : ''}</span></div>
        <div class="row">
          ${r.phone ? html`<button class="btn sm whats" type="button" data-act="wa">${icon('whats')} WhatsApp</button>` : ''}
          <button class="btn sm" type="button" data-act="edit">${icon('edit')} Editar</button>
        </div>
      </div>
      <div class="kpis">
        ${kpi('Total vendido', money(st.sum.revenue), `${st.sum.count} venda(s) · ${st.sum.pieces} peça(s)`, 'accent')}
        ${kpi('Lucro líquido p/ você', money(st.sum.profit), `Margem ${pct(st.sum.margin)}`)}
        ${kpi('Comissão a pagar', money(st.pending), `Total já gerado ${money(st.sum.commission)}`)}
        ${kpi('Peças com ela', num(st.stockPieces), `Valor de venda ${money(st.stockValue)}`)}
      </div>
      <div class="row" style="margin-bottom:8px">
        <button class="btn primary" type="button" data-act="send">${icon('send')} Enviar peças</button>
        <button class="btn" type="button" data-act="return">${icon('undo')} Receber devolução</button>
        <a class="btn" href="#/vendas/nova" data-act="sell">${icon('bag')} Registrar venda dela</a>
        ${st.pending ? html`<button class="btn" type="button" data-act="settle">${icon('check')} Acertar comissão</button>` : ''}
      </div>

      <div class="charts">
        <section class="card"><h3>Estoque com ela</h3>
          ${stock.length ? html`<table class="tbl"><thead><tr><th>Peça</th><th class="num">Qtd</th><th class="num">Valor</th></tr></thead><tbody>
            ${stock.map(x => html`<tr><td>${x.p.name}</td><td class="num">${x.q}</td><td class="num">${money(x.q * x.p.price)}</td></tr>`)}</tbody></table>`
            : html`<p class="muted small">Nenhuma peça com ela no momento.</p>`}
        </section>
        <section class="card"><h3>Peças que ela mais vende</h3>
          ${top.length ? html`<table class="tbl"><thead><tr><th>Peça</th><th class="num">Qtd</th><th class="num">Faturamento</th></tr></thead><tbody>
            ${top.map(t => html`<tr><td>${t.label}</td><td class="num">${t.qty}</td><td class="num">${money(t.revenue)}</td></tr>`)}</tbody></table>`
            : html`<p class="muted small">Ainda sem vendas.</p>`}
        </section>
      </div>

      <div class="section-title"><h2>Vendas dela</h2></div>
      ${sales.length ? html`<div class="list">${sales.map(s => html`<div class="row" style="gap:6px;align-items:stretch">
          <div class="grow">${saleItem(s)}</div>
          <span class="badge ${s.commissionPaid ? 'good' : 'warn'}" style="align-self:center">${s.commissionPaid ? 'Comissão paga' : `Comissão ${money(s.commission)}`}</span>
        </div>`)}</div>` : html`<div class="card empty">Nenhuma venda registrada para ela.</div>`}`;
  },
  actions: {
    edit() { resellerForm(Store.reseller(location.hash.split('/')[2])); },
    send() { stockMoveForm(Store.reseller(location.hash.split('/')[2]), 1); },
    return() { stockMoveForm(Store.reseller(location.hash.split('/')[2]), -1); },
    sell() {
      Views['venda-form'].preseller = location.hash.split('/')[2];
      location.hash = '#/vendas/nova';
    },
    wa() { const r = Store.reseller(location.hash.split('/')[2]); openWhatsApp(`Olá, ${r.name}! `, r.phone); },
    'open-sale': el => Views.vendas.openSale(el.dataset.id),
    async settle() {
      const r = Store.reseller(location.hash.split('/')[2]);
      const st = resellerStats(r);
      if (!(await confirmBox(`Confirmar o pagamento de ${money(st.pending)} de comissão para ${r.name}?`, 'Confirmar acerto', false))) return;
      st.sales.forEach(s => { s.commissionPaid = true; });
      Store.save(); toast('Comissão acertada ✓'); App.refresh();
    },
  },
};
