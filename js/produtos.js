/* Produtos e categorias. */
Views.produtos = {
  title: 'Produtos',
  cat: '',
  q: '',

  render() {
    const db = Store.db;
    const count = id => db.products.filter(p => p.categoryId === id).length;
    return html`
      <div class="toolbar">
        <input type="search" id="p-search" placeholder="Buscar peça…" aria-label="Buscar produto" value="${this.q}">
        <button class="btn primary" type="button" data-act="new">${icon('plus')} Novo produto</button>
      </div>
      <div class="chips" role="group" aria-label="Categorias">
        <button type="button" class="chip ${this.cat ? '' : 'active'}" data-act="cat" data-id="">Todas (${db.products.length})</button>
        ${db.categories.map(c => html`<button type="button" class="chip ${this.cat === c.id ? 'active' : ''}" data-act="cat" data-id="${c.id}">${c.name} (${count(c.id)})</button>`)}
        <button type="button" class="chip add" data-act="new-cat">+ Categoria</button>
        ${db.categories.length ? html`<button type="button" class="chip" data-act="manage-cats">✎ Editar categorias</button>` : ''}
      </div>
      <div id="pgrid">${this.grid()}</div>`;
  },

  grid() {
    const db = Store.db, q = normalize(this.q);
    if (!db.categories.length) return html`<div class="card empty"><div class="big">💎</div><p>Comece criando as categorias das peças<br>(ex.: Brincos, Colares, Anéis, Pulseiras).</p><button class="btn primary" type="button" data-act="new-cat">Criar primeira categoria</button></div>`;
    const list = db.products
      .filter(p => (!this.cat || p.categoryId === this.cat) && (!q || normalize(p.name + ' ' + p.description).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) return html`<div class="card empty"><div class="big">🔍</div>Nenhum produto aqui ainda.<br><br><button class="btn primary" type="button" data-act="new">Cadastrar produto</button></div>`;
    return html`<div class="pgrid">${list.map(p => {
      const stock = +p.stock || 0, withRes = resellerStockOf(p.id);
      return html`<article class="pcard">
        <button type="button" class="pimg" data-act="edit" data-id="${p.id}" aria-label="Abrir ${p.name}">${p.photos?.[0] ? html`<img src="${p.photos[0]}" alt="" loading="lazy">` : '💎'}</button>
        <div class="pbody">
          <span class="pname">${p.name}</span>
          <span class="pprice">${money(p.price)}</span>
          <span class="row" style="gap:6px">
            <span class="badge ${stock === 0 ? 'bad' : stock <= 1 ? 'warn' : 'good'}">${stock} em estoque</span>
            ${withRes ? html`<span class="badge gold">+${withRes} c/ revend.</span>` : ''}
          </span>
          <span class="small muted">Lucro ${money(p.price - p.cost)} / peça</span>
          <div class="pfoot">
            <button class="btn sm" type="button" data-act="edit" data-id="${p.id}">${icon('edit')} Abrir</button>
            <button class="btn sm whats" type="button" data-act="whats" data-id="${p.id}" aria-label="Enviar ${p.name} pelo WhatsApp">${icon('whats')}</button>
          </div>
        </div>
      </article>`;
    })}</div>`;
  },

  onInput(e) {
    if (e.target.id === 'p-search') { this.q = e.target.value; $('#pgrid').innerHTML = String(this.grid()); }
  },

  actions: {
    cat(el) { Views.produtos.cat = el.dataset.id; App.refresh(); },
    new() { productForm(); },
    edit(el) { productForm(Store.product(el.dataset.id)); },
    whats(el) { shareProduct(Store.product(el.dataset.id)); },
    'new-cat'() { newCategory(); },
    'manage-cats'() { manageCategories(); },
  },
};

const resellerStockOf = pid => Store.db.resellers.reduce((a, r) => a + (+r.stock?.[pid] || 0), 0);

function newCategory(after) {
  const name = (prompt('Nome da nova categoria (ex.: Brincos):') || '').trim();
  if (!name) return null;
  if (Store.db.categories.some(c => normalize(c.name) === normalize(name))) { toast('Essa categoria já existe'); return null; }
  const c = { id: uid(), name };
  Store.db.categories.push(c);
  Store.db.categories.sort((a, b) => a.name.localeCompare(b.name));
  Store.save();
  toast('Categoria criada');
  if (after) after(c); else App.refresh();
  return c;
}

function manageCategories() {
  const db = Store.db;
  Modal.open({
    title: 'Categorias',
    body: html`<p class="muted small">Renomeie ou exclua. Só é possível excluir categorias sem produtos.</p>
      ${db.categories.map(c => {
        const n = db.products.filter(p => p.categoryId === c.id).length;
        return html`<div class="row" style="margin-bottom:10px">
          <input class="grow" type="text" name="cat_${c.id}" value="${c.name}" aria-label="Nome da categoria" required style="flex:1">
          <span class="badge">${n} itens</span>
          <button type="button" class="btn sm danger" data-del-cat="${c.id}" ${n ? 'disabled' : ''} aria-label="Excluir ${c.name}">${icon('trash')}</button>
        </div>`;
      })}`,
    onOpen(form) {
      $('#dlg-body').onclick = e => {
        const b = e.target.closest('[data-del-cat]');
        if (!b) return;
        db.categories = db.categories.filter(c => c.id !== b.dataset.delCat);
        b.parentElement.remove();
        Store.save();
        toast('Categoria excluída');
      };
    },
    onSubmit(form) {
      const d = formData(form);
      db.categories.forEach(c => { const v = (d['cat_' + c.id] || '').trim(); if (v) c.name = v; });
      Store.save();
      App.refresh();
    },
  });
}

function productForm(p) {
  const db = Store.db;
  if (!db.categories.length) { toast('Crie uma categoria primeiro'); return newCategory(); }
  const isNew = !p;
  p = p || { categoryId: Views.produtos.cat || db.categories[0].id, photos: [], stock: 1 };
  let photos = [...(p.photos || [])];
  const removed = [];

  const photosHtml = () => html`${photos.map((u, i) => html`<div class="photo"><img src="${u}" alt="Foto ${i + 1}"><button type="button" data-rm-photo="${i}" aria-label="Remover foto ${i + 1}">✕</button></div>`)}
    <label class="photo-add">${icon('image')}<span>Adicionar<br>fotos</span><input type="file" id="f-photos" accept="image/*" multiple></label>`;

  const actions = [];
  if (!isNew) {
    actions.push({ id: 'whats', label: 'WhatsApp', icon: 'whats', cls: 'whats', run: () => shareProduct(p) });
    if (navigator.share) actions.push({ id: 'share', label: 'Com foto', icon: 'share', run: () => shareProduct(p, true) });
    actions.push({ id: 'del', label: 'Excluir', icon: 'trash', cls: 'danger', run: async () => {
      if (resellerStockOf(p.id)) return toast('Há peças com revendedoras. Registre a devolução antes de excluir.', 4000);
      if (!(await confirmBox(`Excluir "${p.name}"? As vendas antigas continuam registradas.`, 'Excluir'))) return;
      db.products = db.products.filter(x => x.id !== p.id);
      (p.photos || []).forEach(u => Store.removePhoto(u));
      Store.save(); toast('Produto excluído'); App.refresh();
    } });
  }

  Modal.open({
    title: isNew ? 'Novo produto' : 'Editar produto',
    actions,
    body: html`
      <div class="label small" style="font-weight:600;margin-bottom:6px">Fotos</div>
      <div class="photos" id="f-photo-list">${photosHtml()}</div>
      <div class="field"><label for="f-name">Nome do produto <span class="req">*</span></label><input id="f-name" name="name" type="text" required value="${p.name || ''}" placeholder="Ex.: Brinco Gota Cristal"></div>
      <div class="field"><label for="f-cat">Categoria <span class="req">*</span></label>
        <select id="f-cat" name="categoryId" required>
          ${db.categories.map(c => html`<option value="${c.id}" ${c.id === p.categoryId ? 'selected' : ''}>${c.name}</option>`)}
          <option value="__new">+ Nova categoria…</option>
        </select></div>
      <div class="field"><label for="f-desc">Descrição</label><textarea id="f-desc" name="description" placeholder="Material, banho, tamanho, detalhes…">${p.description || ''}</textarea></div>
      <div class="grid3">
        <div class="field"><label for="f-stock">Estoque (unid.) <span class="req">*</span></label><input id="f-stock" name="stock" type="number" min="0" step="1" inputmode="numeric" required value="${p.stock ?? 0}"></div>
        <div class="field"><label for="f-price">Preço de venda <span class="req">*</span></label><input id="f-price" name="price" type="number" min="0" step="0.01" inputmode="decimal" required value="${p.price ?? ''}" placeholder="0,00"></div>
        <div class="field"><label for="f-cost">Valor investido <span class="req">*</span></label><input id="f-cost" name="cost" type="number" min="0" step="0.01" inputmode="decimal" required value="${p.cost ?? ''}" placeholder="0,00"><span class="hint">Quanto você pagou por 1 peça</span></div>
      </div>
      <div class="profit-box" aria-live="polite">
        <div><span class="small muted">Lucro líquido por peça</span><b id="f-profit">—</b></div>
        <div><span class="small muted">Margem</span><b id="f-margin">—</b></div>
      </div>
      ${!isNew && resellerStockOf(p.id) ? html`<p class="small muted">+ ${resellerStockOf(p.id)} peça(s) com revendedoras.</p>` : ''}`,
    onOpen(form) {
      const calc = () => {
        const price = +form.price.value || 0, cost = +form.cost.value || 0;
        $('#f-profit').textContent = money(price - cost);
        $('#f-margin').textContent = price ? pct((price - cost) / price) : '—';
      };
      calc();
      form.price.oninput = form.cost.oninput = calc;
      form.categoryId.onchange = () => {
        if (form.categoryId.value !== '__new') return;
        const c = newCategory(c => {
          form.categoryId.insertAdjacentHTML('afterbegin', String(html`<option value="${c.id}">${c.name}</option>`));
        });
        form.categoryId.value = c ? c.id : (p.categoryId || db.categories[0].id);
      };
      const list = $('#f-photo-list');
      list.onclick = e => {
        const b = e.target.closest('[data-rm-photo]');
        if (!b) return;
        removed.push(...photos.splice(+b.dataset.rmPhoto, 1));
        list.innerHTML = String(photosHtml());
      };
      list.onchange = async e => {
        if (e.target.id !== 'f-photos') return;
        const files = [...e.target.files].slice(0, 8);
        list.querySelector('.photo-add').innerHTML = '<span class="spinner"></span>';
        for (const f of files) {
          try { photos.push(await Store.addPhoto(f)); } catch (err) { toast('Erro ao enviar foto: ' + err.message, 4000); }
        }
        list.innerHTML = String(photosHtml());
      };
    },
    onSubmit(form) {
      const d = formData(form);
      if (d.categoryId === '__new') { toast('Escolha a categoria'); return false; }
      if (list_uploading()) { toast('Aguarde as fotos terminarem de enviar'); return false; }
      Object.assign(p, {
        name: d.name.trim(), categoryId: d.categoryId, description: d.description.trim(),
        stock: Math.max(0, parseInt(d.stock, 10) || 0), price: round2(d.price), cost: round2(d.cost), photos,
      });
      if (isNew) { p.id = uid(); p.createdAt = Date.now(); p.active = true; db.products.push(p); }
      removed.forEach(u => Store.removePhoto(u));
      Store.save();
      toast(isNew ? 'Produto cadastrado ✓' : 'Produto atualizado ✓');
      App.refresh();
    },
  });
}
const list_uploading = () => !!$('#f-photo-list .spinner');

// ---- catálogo / WhatsApp ----
function catalogLink(pid) {
  if (!location.protocol.startsWith('http') || !Store.cfg.apiUrl) return '';
  const u = new URL('loja.html', location.href);
  if (pid) u.searchParams.set('p', pid);
  if (Store.cfg.apiUrl !== window.LOJA_CONFIG?.apiUrl) u.searchParams.set('api', Store.cfg.apiUrl);
  return u.toString();
}

async function shareProduct(p, withPhoto = false) {
  if (!p) return;
  const link = catalogLink(p.id);
  const text = [
    `✨ *${p.name}*`,
    p.description ? p.description : null,
    `💰 *${money(p.price)}*`,
    link ? `\n📸 Veja as fotos e outras peças da loja:\n${link}` : null,
    `\n_${Store.db.settings.storeName}_`,
  ].filter(Boolean).join('\n');

  if (withPhoto && navigator.share) {
    try {
      let file = null;
      const src = p.photos?.[0];
      if (src?.startsWith('data:')) file = dataURLtoFile(src, 'foto.jpg');
      else if (src) {
        const blob = await fetch(src).then(r => r.ok ? r.blob() : null).catch(() => null);
        if (blob) file = new File([blob], 'foto.jpg', { type: blob.type || 'image/jpeg' });
      }
      const data = file && navigator.canShare?.({ files: [file] }) ? { files: [file], text } : { text };
      await navigator.share(data);
      return;
    } catch (e) { if (e.name === 'AbortError') return; }
  }
  if (!link) toast('Dica: publique o app no GitHub e conecte o Drive para enviar o link do catálogo com fotos.', 5000);
  openWhatsApp(text);
}
