/* Banco de dados da loja.
 * - Sempre salva no aparelho (localStorage) para funcionar offline.
 * - Se o Google Drive estiver configurado (Apps Script), envia o banco inteiro para lá
 *   alguns segundos depois de cada alteração e baixa a versão do Drive ao abrir o app.
 * dev-senior: o banco é um único JSON; para uma loja pequena (milhares de vendas) é suficiente.
 */
const LS_DB = 'ir.db', LS_CFG = 'ir.cfg', LS_DIRTY = 'ir.dirty';

const emptyDb = () => ({
  version: 1,
  updatedAt: 0,
  settings: { storeName: 'Isabel Ribeiro Semijoias', storePhone: '', instagram: '' },
  categories: [],
  products: [],
  clients: [],
  resellers: [],
  stockMoves: [],
  sales: [],
});

const Store = {
  db: emptyDb(),
  cfg: { apiUrl: '', key: '' },
  dirty: false,
  status: 'local', // local | ok | saving | error | offline
  listeners: [],
  _timer: null,

  init() {
    try { this.cfg = { ...this.cfg, ...JSON.parse(localStorage.getItem(LS_CFG) || '{}') }; } catch { /* config corrompida: usa padrão */ }
    if (!this.cfg.apiUrl && window.LOJA_CONFIG?.apiUrl) this.cfg.apiUrl = window.LOJA_CONFIG.apiUrl;
    try {
      const saved = localStorage.getItem(LS_DB);
      if (saved) this.db = fixDb(JSON.parse(saved));
    } catch (e) { console.error('Banco local ilegível', e); }
    this.dirty = localStorage.getItem(LS_DIRTY) === '1';
    this.setStatus(this.remote ? 'ok' : 'local');
  },

  get remote() { return !!(this.cfg.apiUrl && this.cfg.key); },

  saveCfg(cfg) {
    this.cfg = { ...this.cfg, ...cfg };
    localStorage.setItem(LS_CFG, JSON.stringify(this.cfg));
    this.setStatus(this.remote ? 'ok' : 'local');
  },

  onChange(fn) { this.listeners.push(fn); },
  setStatus(s) { this.status = s; this.listeners.forEach(fn => fn('status')); },

  // Chame depois de qualquer alteração em Store.db
  save() {
    this.db.updatedAt = Date.now();
    this.writeLocal();
    this.dirty = true;
    localStorage.setItem(LS_DIRTY, '1');
    if (this.remote) {
      clearTimeout(this._timer);
      this.setStatus('saving');
      this._timer = setTimeout(() => this.push(), 1500);
    }
  },

  writeLocal() {
    try {
      localStorage.setItem(LS_DB, JSON.stringify(this.db));
    } catch (e) {
      // Fotos sem Drive configurado ocupam muito espaço local
      toast('Espaço do aparelho cheio! Configure o Google Drive em Configurações.', 6000);
      console.error(e);
    }
  },

  async api(action, payload = {}) {
    const res = await fetch(this.cfg.apiUrl, {
      method: 'POST',
      // text/plain evita a requisição "preflight", que o Apps Script não aceita
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, key: this.cfg.key, ...payload }),
    });
    if (!res.ok) throw new Error('Falha de conexão (' + res.status + ')');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Erro no Google Drive');
    return data;
  },

  // Baixa do Drive. Se houver alterações locais ainda não enviadas, envia primeiro.
  async pull() {
    if (!this.remote) return;
    if (this.dirty) return this.push();
    try {
      this.setStatus('saving');
      const { data } = await this.api('load');
      if (data) { this.db = fixDb(data); this.writeLocal(); }
      else await this.push(true); // Drive vazio: sobe o que existe no aparelho
      this.setStatus('ok');
      this.listeners.forEach(fn => fn('data'));
    } catch (e) {
      console.error(e);
      this.setStatus(navigator.onLine ? 'error' : 'offline');
    }
  },

  async push(force = false) {
    if (!this.remote || (!this.dirty && !force)) return;
    try {
      this.setStatus('saving');
      await this.api('save', { data: this.db });
      this.dirty = false;
      localStorage.removeItem(LS_DIRTY);
      this.setStatus('ok');
    } catch (e) {
      console.error(e);
      this.setStatus(navigator.onLine ? 'error' : 'offline');
    }
  },

  // Recebe um File, reduz e devolve a URL da foto (Drive) ou a própria imagem (modo local)
  async addPhoto(file) {
    const dataURL = await resizeImage(file);
    if (!this.remote) return dataURL;
    const { url } = await this.api('upload', { name: file.name || 'foto.jpg', data: dataURL.split(',')[1] });
    return url;
  },

  removePhoto(url) {
    const id = String(url).match(/[?&]id=([\w-]+)/)?.[1];
    if (id && this.remote) this.api('deletePhoto', { id }).catch(console.error);
  },

  // ---- busca rápida ----
  product(id) { return this.db.products.find(p => p.id === id); },
  category(id) { return this.db.categories.find(c => c.id === id); },
  client(id) { return this.db.clients.find(c => c.id === id); },
  reseller(id) { return this.db.resellers.find(r => r.id === id); },
  sale(id) { return this.db.sales.find(s => s.id === id); },
  clientName(id) { const c = this.client(id); return c ? `${c.firstName} ${c.lastName || ''}`.trim() : 'Cliente removido'; },
  sellerName(id) { return id ? (this.reseller(id)?.name || 'Revendedora removida') : 'Venda direta'; },
};

// Garante que todas as listas existam (banco antigo ou vazio)
function fixDb(d) {
  const base = emptyDb();
  const out = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
  for (const k of ['categories', 'products', 'clients', 'resellers', 'stockMoves', 'sales']) if (!Array.isArray(out[k])) out[k] = [];
  out.resellers.forEach(r => { r.stock ||= {}; });
  return out;
}

window.addEventListener('online', () => Store.dirty ? Store.push() : Store.pull());
