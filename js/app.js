/* Navegação, menu, tela inicial e configurações. */
const Views = {};

const NAV = [
  { r: '', label: 'Início', ic: 'home' },
  { r: 'dashboard', label: 'Dashboard', ic: 'dashboard', desc: 'Visão geral e gráficos' },
  { r: 'produtos', label: 'Produtos', ic: 'gem', desc: 'Peças, fotos e estoque' },
  { r: 'clientes', label: 'Clientes', ic: 'users', desc: 'Cadastro de clientes' },
  { r: 'vendas', label: 'Vendas', ic: 'bag', desc: 'Registrar e consultar' },
  { r: 'carteira', label: 'Carteira', ic: 'wallet', desc: 'Recebido e a receber' },
  { r: 'relatorios', label: 'Relatórios', ic: 'report', desc: 'PDF semanal e mensal' },
  { r: 'revendedoras', label: 'Revendedoras', ic: 'star', desc: 'Estoque e comissões', gold: true },
];

const App = {
  view: null,
  params: [],

  start() {
    Store.init();
    $('#btn-config').innerHTML = String(icon('settings'));
    $('#btn-back').innerHTML = String(icon('back'));
    $('#btn-back').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/');
    $('#side-links').innerHTML = NAV.map(n => html`<a class="nav" href="#/${n.r}" data-r="${n.r}">${icon(n.ic)}${n.label}</a>`).join('');
    $('#bottom-nav').innerHTML = String(html`
      <a href="#/" data-r="">${icon('home')}Início</a>
      <a href="#/produtos" data-r="produtos">${icon('gem')}Produtos</a>
      <a href="#/vendas/nova" data-r="vendas/nova" class="fab"><span class="fab-circle">${icon('plus')}</span>Vender</a>
      <a href="#/clientes" data-r="clientes">${icon('users')}Clientes</a>
      <a href="#/carteira" data-r="carteira">${icon('wallet')}Carteira</a>`);

    const view = $('#view');
    view.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (el && this.view?.actions?.[el.dataset.act]) { e.preventDefault(); this.view.actions[el.dataset.act](el, e); }
    });
    view.addEventListener('input', e => this.view?.onInput?.(e));
    view.addEventListener('change', e => this.view?.onChange?.(e));

    Store.onChange(kind => {
      this.renderStatus();
      if (kind === 'data' && !$('#dlg').open && !this.view?.keepOnSync) this.render();
    });
    window.addEventListener('hashchange', () => this.render());
    this.render();
    Store.pull();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  },

  renderStatus() {
    const labels = { local: 'No aparelho', ok: 'Salvo no Drive', saving: 'Salvando…', error: 'Erro ao sincronizar', offline: 'Sem internet' };
    const el = $('#sync-status');
    el.textContent = labels[Store.status];
    el.className = 'sync ' + Store.status;
  },

  render() {
    const path = location.hash.replace(/^#\/?/, '');
    const parts = path.split('/').filter(Boolean);
    let key = parts[0] || '', params = parts.slice(1);
    if (key === 'vendas' && parts[1] === 'nova') { key = 'venda-form'; params = []; }
    if (key === 'vendas' && parts[1] === 'editar') { key = 'venda-form'; params = [parts[2]]; }
    if (key === 'revendedoras' && parts[1]) { key = 'revendedora'; }
    const v = Views[key] || Views[''];
    this.view = v;
    this.params = params;
    if (Modal) Modal.close();
    $('#page-title').textContent = typeof v.title === 'function' ? v.title(params) : v.title;
    $('#btn-back').hidden = key === '';
    $$('[data-r]').forEach(a => a.classList.toggle('active', a.dataset.r === path || (a.dataset.r && path.startsWith(a.dataset.r + '/') && a.dataset.r !== 'vendas')));
    this.renderStatus();
    $('#view').innerHTML = String(v.render(params));
    v.after?.(params);
    window.scrollTo(0, 0);
  },

  // Redesenha a tela atual depois de salvar algo
  refresh() { $('#view').innerHTML = String(this.view.render(this.params)); this.view.after?.(this.params); },
};

const kpi = (label, value, sub = '', cls = '') => html`<div class="kpi ${cls}"><div class="k-label">${label}</div><div class="k-value" title="${value}">${value}</div>${sub ? html`<div class="k-sub">${sub}</div>` : ''}</div>`;
const deltaTxt = (cur, prev) => {
  if (!prev) return cur ? raw('<span class="delta-up">novo</span>') : '';
  const d = (cur - prev) / Math.abs(prev);
  return raw(`<span class="${d >= 0 ? 'delta-up' : 'delta-down'}">${d >= 0 ? '▲' : '▼'} ${esc(pct(Math.abs(d)))}</span> vs. anterior`);
};

// ================= INÍCIO =================
Views[''] = {
  title: 'Início',
  render() {
    const db = Store.db;
    const range = periodRange('month');
    const lines = filterLines(saleLines(db.sales), { range });
    const s = summarize(lines);
    const prev = summarize(filterLines(saleLines(db.sales), { range: prevComparable(range) }));
    const w = walletStats(db.sales, range);
    const lowStock = db.products.filter(p => p.active !== false && (+p.stock || 0) <= 1).length;
    const h = new Date().getHours();
    const greet = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const recent = [...db.sales].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 5);

    return html`
      <section class="brand-hero">
        <div class="logo"><span class="l-name">isabel ribeiro</span><span class="l-sub">SEMIJOIAS</span></div>
        <p>${greet}! Hoje é <b>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</b>.</p>
      </section>

      ${w.lateCount || lowStock ? html`<div class="alerts">
        ${w.lateCount ? html`<a class="alert bad" href="#/carteira">⚠️ ${w.lateCount} parcela(s) atrasada(s) — ${money(w.late)}</a>` : ''}
        ${lowStock ? html`<a class="alert warn" href="#/produtos">📦 ${lowStock} produto(s) com estoque baixo</a>` : ''}
      </div>` : ''}

      <a class="btn primary block" href="#/vendas/nova" style="min-height:54px;font-size:1.05rem">${icon('plus')} Registrar nova venda</a>

      <div class="kpis">
        ${kpi(`Vendas em ${MONTHS[new Date().getMonth()]}`, money(s.revenue), deltaTxt(s.revenue, prev.revenue), 'accent')}
        ${kpi('Lucro líquido do mês', money(s.profit), `Margem ${pct(s.margin)}`)}
        ${kpi('Recebido no mês', money(w.gross), `Líquido ${money(w.net)}`)}
        ${kpi('A receber', money(w.toReceive), `${w.openCount} parcela(s) em aberto`)}
      </div>

      <div class="tiles">
        ${NAV.slice(1).map(n => html`<a class="tile" href="#/${n.r}"><span class="t-ic ${n.gold ? 'gold' : ''}">${icon(n.ic, 24)}</span><b>${n.label}</b><span class="small">${n.desc}</span></a>`)}
      </div>

      <div class="section-title"><h2>Últimas vendas</h2><a href="#/vendas" class="small">Ver todas</a></div>
      ${recent.length ? html`<div class="list">${recent.map(saleItem)}</div>`
        : html`<div class="card empty"><div class="big">🛍️</div>Nenhuma venda ainda.<br>Comece cadastrando categorias e produtos.</div>`}
    `;
  },
  actions: { 'open-sale': el => Views.vendas.openSale(el.dataset.id) },
};

// Linha de venda reaproveitada em várias telas
function saleItem(s) {
  const st = saleStatus(s);
  const pieces = s.items.reduce((a, i) => a + i.qty, 0);
  return html`<button class="item" type="button" data-act="open-sale" data-id="${s.id}">
    <span class="avatar ${s.resellerId ? 'gold' : ''}">${initials(Store.saleClientName(s))}</span>
    <span class="i-main">
      <span class="i-title">${Store.saleClientName(s)}</span>
      <span class="i-sub">${fmtDate(s.date)} · ${pieces} peça(s) · ${Store.sellerName(s.resellerId)}</span>
    </span>
    <span class="i-end"><b>${money(s.total)}</b><span class="badge ${st.cls}">${st.label}</span></span>
  </button>`;
}

// ================= CONFIGURAÇÕES =================
Views.config = {
  title: 'Configurações',
  render() {
    const st = Store.db.settings, cfg = Store.cfg;
    return html`
      <form class="card" id="f-store">
        <h3>Dados da loja</h3>
        <div class="field"><label for="c-name">Nome da loja</label><input id="c-name" name="storeName" type="text" value="${st.storeName}" required></div>
        <div class="grid2">
          <div class="field"><label for="c-phone">WhatsApp da loja</label><input id="c-phone" name="storePhone" type="tel" inputmode="tel" value="${st.storePhone}" placeholder="(11) 99999-9999"><span class="hint">Aparece no catálogo para a cliente chamar você.</span></div>
          <div class="field"><label for="c-insta">Instagram (opcional)</label><input id="c-insta" name="instagram" type="text" value="${st.instagram}" placeholder="@isabelribeirosemijoias"></div>
        </div>
        <button class="btn primary" type="submit">Salvar dados da loja</button>
      </form>

      <form class="card" id="f-drive">
        <h3>Banco de dados no Google Drive</h3>
        <p class="muted small">Siga o passo a passo do arquivo <b>README.md</b> para criar o Apps Script. Depois cole aqui a URL e a chave.
        Enquanto não configurar, tudo fica salvo só neste aparelho.</p>
        <div class="field"><label for="c-url">URL do Apps Script</label><input id="c-url" name="apiUrl" type="text" value="${cfg.apiUrl}" placeholder="https://script.google.com/macros/s/.../exec"></div>
        <div class="field"><label for="c-key">Chave secreta</label><input id="c-key" name="key" type="text" value="${cfg.key}" autocomplete="off" placeholder="Gerada pela função configurar()"></div>
        <div class="row">
          <button class="btn primary" type="submit">Conectar e sincronizar</button>
          <span class="sync ${Store.status}">${{ local: 'Só no aparelho', ok: 'Conectado', saving: 'Sincronizando…', error: 'Erro', offline: 'Sem internet' }[Store.status]}</span>
        </div>
      </form>

      <div class="card">
        <h3>Cópia de segurança</h3>
        <p class="muted small">Baixe um arquivo com todos os dados ou restaure a partir dele.</p>
        <div class="row">
          <button class="btn" type="button" data-act="export">${icon('download')} Baixar backup</button>
          <label class="btn" for="c-import">${icon('undo')} Restaurar backup</label>
          <input id="c-import" type="file" accept="application/json,.json" hidden>
        </div>
      </div>`;
  },
  after() {
    $('#f-store').onsubmit = e => {
      e.preventDefault();
      Object.assign(Store.db.settings, formData(e.target));
      Store.save();
      toast('Dados da loja salvos');
    };
    $('#f-drive').onsubmit = async e => {
      e.preventDefault();
      const d = formData(e.target);
      Store.saveCfg({ apiUrl: d.apiUrl.trim(), key: d.key.trim() });
      if (!Store.remote) return toast('Configuração removida: dados ficam só no aparelho');
      try {
        toast('Conectando…');
        const { data } = await Store.api('load');
        const local = Store.db.sales.length + Store.db.products.length + Store.db.clients.length;
        if (data && local && !(await confirmBox('Já existem dados no Drive. Deseja usar os dados do Drive neste aparelho? (Cancelar = enviar os dados deste aparelho para o Drive)', 'Usar dados do Drive', false))) {
          await Store.push(true);
        } else if (data) {
          Store.db = fixDb(data); Store.writeLocal(); Store.dirty = false; localStorage.removeItem(LS_DIRTY);
        } else {
          await Store.push(true);
        }
        Store.setStatus('ok');
        toast('Conectado ao Google Drive ✓');
        App.render();
      } catch (err) {
        Store.setStatus('error');
        toast('Não foi possível conectar: ' + err.message, 5000);
      }
    };
    $('#c-import').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = fixDb(JSON.parse(await file.text()));
        if (!(await confirmBox('Substituir todos os dados atuais pelo backup?', 'Restaurar'))) return;
        Store.db = data; Store.save(); toast('Backup restaurado'); App.render();
      } catch { toast('Arquivo de backup inválido'); }
    };
  },
  actions: {
    export() {
      const blob = new Blob([JSON.stringify(Store.db, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `backup-isabel-ribeiro-${todayISO()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  },
};
