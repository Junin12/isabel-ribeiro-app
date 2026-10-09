/* Clientes. Só o nome é obrigatório. */
Views.clientes = {
  title: 'Clientes',
  q: '',

  render() {
    return html`
      <div class="toolbar">
        <input type="search" id="c-search" placeholder="Buscar cliente…" aria-label="Buscar cliente" value="${this.q}">
        <button class="btn primary" type="button" data-act="new">${icon('plus')} Novo cliente</button>
      </div>
      <div id="clist">${this.list()}</div>`;
  },

  list() {
    const db = Store.db, q = normalize(this.q);
    if (!db.clients.length) return html`<div class="card empty"><div class="big">👥</div>Nenhum cliente cadastrado.<br><br><button class="btn primary" type="button" data-act="new">Cadastrar cliente</button></div>`;
    const stats = clientStats();
    const list = db.clients
      .filter(c => !q || normalize(`${c.firstName} ${c.lastName} ${c.reference} ${c.phone}`).includes(q))
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    return html`<p class="small muted">${list.length} cliente(s)</p><div class="list">${list.map(c => {
      const s = stats.get(c.id);
      return html`<button class="item" type="button" data-act="edit" data-id="${c.id}">
        <span class="avatar">${initials(c.firstName + ' ' + (c.lastName || ''))}</span>
        <span class="i-main"><span class="i-title">${c.firstName} ${c.lastName}</span><span class="i-sub">${c.reference || c.phone || 'Sem referência'}</span></span>
        <span class="i-end">${s ? html`<b>${money(s.total)}</b><span class="small muted">${s.count} compra(s)</span>` : html`<span class="small muted">Sem compras</span>`}</span>
      </button>`;
    })}</div>`;
  },

  onInput(e) { if (e.target.id === 'c-search') { this.q = e.target.value; $('#clist').innerHTML = String(this.list()); } },

  actions: {
    new() { clientForm(); },
    edit(el) { clientForm(Store.client(el.dataset.id)); },
  },
};

function clientStats() {
  const m = new Map();
  Store.db.sales.forEach(s => {
    const g = m.get(s.clientId) || { total: 0, count: 0, open: 0 };
    g.total += s.total; g.count++;
    g.open += s.installments.filter(i => !i.paidAt).reduce((a, i) => a + i.amount, 0);
    m.set(s.clientId, g);
  });
  return m;
}

function clientForm(c, onSaved) {
  const db = Store.db, isNew = !c;
  c = c || {};
  const sales = isNew ? [] : db.sales.filter(s => s.clientId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const st = clientStats().get(c.id);
  const actions = [];
  if (!isNew && c.phone) actions.push({ id: 'wa', label: 'WhatsApp', icon: 'whats', cls: 'whats', run: () => openWhatsApp(`Olá, ${c.firstName}! `, c.phone) });
  if (!isNew) actions.push({ id: 'del', label: 'Excluir', icon: 'trash', cls: 'danger', run: async () => {
    if (sales.length) return toast('Esta cliente tem vendas registradas e não pode ser excluída.', 4000);
    if (!(await confirmBox(`Excluir ${c.firstName}?`, 'Excluir'))) return;
    db.clients = db.clients.filter(x => x.id !== c.id); Store.save(); toast('Cliente excluída'); App.refresh();
  } });

  Modal.open({
    title: isNew ? 'Novo cliente' : `${c.firstName} ${c.lastName || ''}`,
    actions,
    body: html`
      <div class="grid2">
        <div class="field"><label for="cl-first">Nome <span class="req">*</span></label><input id="cl-first" name="firstName" type="text" required autocomplete="off" value="${c.firstName || ''}"></div>
        <div class="field"><label for="cl-last">Sobrenome</label><input id="cl-last" name="lastName" type="text" autocomplete="off" value="${c.lastName || ''}"></div>
      </div>
      <div class="field"><label for="cl-ref">Referência</label>
        <textarea id="cl-ref" name="reference" placeholder="Escreva qualquer informação sobre a pessoa. Ex.: por onde fez a compra (Instagram, indicação da Maria, feira…), telefone, endereço, e-mail, gostos…">${c.reference || ''}</textarea></div>
      <details class="more" ${c.phone || c.email || c.address ? 'open' : ''}>
        <summary>Telefone, e-mail e endereço (opcional)</summary>
        <div class="grid2">
          <div class="field"><label for="cl-phone">Telefone / WhatsApp</label><input id="cl-phone" name="phone" type="tel" inputmode="tel" value="${c.phone || ''}" placeholder="(11) 99999-9999"></div>
          <div class="field"><label for="cl-email">E-mail</label><input id="cl-email" name="email" type="email" value="${c.email || ''}"></div>
        </div>
        <div class="field"><label for="cl-addr">Endereço</label><input id="cl-addr" name="address" type="text" value="${c.address || ''}"></div>
      </details>
      ${st ? html`<div class="profit-box"><div><span class="small muted">Total comprado</span><b>${money(st.total)}</b></div><div><span class="small muted">Em aberto</span><b>${money(st.open)}</b></div></div>
        <div class="small" style="font-weight:600;margin-bottom:6px">Compras</div>
        ${sales.slice(0, 10).map(s => html`<div class="sum-line small" style="border-bottom:1px solid var(--border);padding:8px 0;gap:10px">
          <span><b>${fmtDate(s.date)}</b> · ${s.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</span>
          <span class="right" style="flex:none"><b>${money(s.total)}</b><br><span class="badge ${saleStatus(s).cls}">${saleStatus(s).label}</span></span>
        </div>`)}` : ''}`,
    onSubmit(form) {
      const d = formData(form);
      Object.assign(c, {
        firstName: d.firstName.trim(), lastName: d.lastName.trim(), reference: d.reference.trim(),
        phone: d.phone.trim(), email: d.email.trim(), address: d.address.trim(),
      });
      if (isNew) { c.id = uid(); c.createdAt = Date.now(); db.clients.push(c); }
      Store.save();
      toast(isNew ? 'Cliente cadastrado ✓' : 'Cliente atualizado ✓');
      if (onSaved) onSaved(c); else App.refresh();
    },
  });
}
