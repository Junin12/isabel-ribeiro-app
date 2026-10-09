/**
 * Backend da loja no Google Drive (Google Apps Script).
 * Cria no seu Drive a pasta "Isabel Ribeiro - App" com:
 *   - banco-de-dados.json  → todos os dados do app
 *   - Fotos/               → fotos dos produtos (compartilhadas por link, para o catálogo)
 *
 * Instalação: veja o README.md do projeto.
 * 1) Rode a função configurar() uma vez e copie a CHAVE que aparece no registro de execução.
 * 2) Implante como "App da Web" (executar como: Eu; acesso: Qualquer pessoa).
 */

const FOLDER_NAME = 'Isabel Ribeiro - App';
const DB_FILE = 'banco-de-dados.json';

function configurar() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('SECRET');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('SECRET', key);
  }
  getFolder_(); // cria a pasta e pede as permissões do Drive
  Logger.log('Sua chave secreta (cole nas Configurações do app): ' + key);
}

function doGet(e) {
  const action = (e.parameter || {}).action;
  if (action === 'catalog') return json_(catalog_());
  return json_({ ok: true, message: 'API da loja funcionando.' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Requisição inválida' }); }
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret || body.key !== secret) return json_({ ok: false, error: 'Chave inválida' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (body.action) {
      case 'load': return json_({ ok: true, data: readDb_() });
      case 'save':
        if (!body.data || typeof body.data !== 'object') return json_({ ok: false, error: 'Dados vazios' });
        writeDb_(body.data);
        return json_({ ok: true });
      case 'upload': return json_(upload_(body));
      case 'deletePhoto':
        try { DriveApp.getFileById(String(body.id)).setTrashed(true); } catch (err) { /* já removida */ }
        return json_({ ok: true });
      default: return json_({ ok: false, error: 'Ação desconhecida' });
    }
  } finally {
    lock.releaseLock();
  }
}

// Catálogo público: só nome, descrição, preço e fotos de peças com estoque. Nunca custo nem clientes.
function catalog_() {
  const db = readDb_();
  if (!db) return { ok: true, store: { name: 'Isabel Ribeiro Semijoias' }, categories: [], products: [] };
  const resellerStock = {};
  (db.resellers || []).forEach(function (r) {
    Object.keys(r.stock || {}).forEach(function (pid) { resellerStock[pid] = (resellerStock[pid] || 0) + Math.max(0, +r.stock[pid] || 0); });
  });
  const products = (db.products || [])
    .filter(function (p) { return p.active !== false && ((+p.stock || 0) + (resellerStock[p.id] || 0)) > 0; })
    .map(function (p) { return { id: p.id, name: p.name, description: p.description || '', price: +p.price || 0, categoryId: p.categoryId, photos: p.photos || [] }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
  return {
    ok: true,
    store: { name: db.settings.storeName, phone: db.settings.storePhone || '', instagram: db.settings.instagram || '' },
    categories: (db.categories || []).map(function (c) { return { id: c.id, name: c.name }; }),
    products: products,
  };
}

function upload_(body) {
  if (!body.data) return { ok: false, error: 'Foto vazia' };
  const bytes = Utilities.base64Decode(body.data);
  if (bytes.length > 5 * 1024 * 1024) return { ok: false, error: 'Foto muito grande' };
  const blob = Utilities.newBlob(bytes, 'image/jpeg', String(body.name || 'foto').replace(/[^\w.\- ]/g, '') + '.jpg');
  const file = getSubfolder_('Fotos').createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, id: file.getId(), url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200' };
}

function readDb_() {
  const files = getFolder_().getFilesByName(DB_FILE);
  if (!files.hasNext()) return null;
  return JSON.parse(files.next().getBlob().getDataAsString('UTF-8'));
}

function writeDb_(data) {
  const folder = getFolder_();
  const files = folder.getFilesByName(DB_FILE);
  const content = JSON.stringify(data);
  if (files.hasNext()) {
    const file = files.next();
    backup_(file);
    file.setContent(content);
  } else {
    folder.createFile(DB_FILE, content, 'application/json');
  }
}

// Guarda uma cópia por dia (últimos 30 dias) na pasta Backups
function backup_(file) {
  const name = 'backup-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '.json';
  const folder = getSubfolder_('Backups');
  if (folder.getFilesByName(name).hasNext()) return;
  folder.createFile(name, file.getBlob().getDataAsString('UTF-8'), 'application/json');
  const limit = new Date(Date.now() - 30 * 864e5);
  const it = folder.getFiles();
  while (it.hasNext()) { const f = it.next(); if (f.getDateCreated() < limit) f.setTrashed(true); }
}

function getFolder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function getSubfolder_(name) {
  const parent = getFolder_();
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
