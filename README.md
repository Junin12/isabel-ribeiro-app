# Isabel Ribeiro Semijoias — App de gestão

App simples para controlar **produtos, clientes, vendas, carteira, relatórios e revendedoras**.
Funciona no celular e no computador, pode ser instalado na tela inicial como um aplicativo e guarda os dados no **Google Drive**.

| Tela | O que faz |
|---|---|
| **Início** | Resumo do mês, alertas (parcelas atrasadas, estoque baixo) e botões de acesso |
| **Dashboard** | Indicadores e gráficos com filtros de período, cliente, categoria, produto e vendedora. Tocar numa barra ou fatia do gráfico aplica o filtro |
| **Produtos** | Categorias, fotos, descrição, estoque, preço, valor investido e lucro calculado. Envio da peça pelo WhatsApp com link do catálogo |
| **Clientes** | Nome, sobrenome, referência livre e, se quiser, telefone, e-mail e endereço |
| **Vendas** | Escolhe as peças e quantidades, a cliente, quem vendeu, desconto e parcelas com datas |
| **Carteira** | Recebido bruto e líquido, saldo a receber, parcelas atrasadas e botão "Recebi" |
| **Relatórios** | Relatório semanal ou mensal em PDF, com envio pelo WhatsApp |
| **Revendedoras** | Cadastro, peças com cada uma, vendas, comissão a pagar e acerto |

**Como o lucro é calculado:** lucro líquido = preço de venda − valor investido − comissão da revendedora (impostos não entram).
O valor investido é cadastrado uma vez no produto e fica "congelado" em cada venda, então mudar o preço depois não altera vendas antigas.
Na carteira, cada parcela recebida já entra separada em bruto e líquido.

---

## Instalação (uma vez só, cerca de 15 minutos)

### Passo 1 — Publicar o app no GitHub (grátis)

1. Crie uma conta em [github.com](https://github.com) (se ainda não tiver).
2. Clique em **New repository**, dê um nome (ex.: `isabel-ribeiro-app`), deixe **Public** e crie.
3. Envie os arquivos desta pasta. Pelo terminal:
   ```bash
   git init
   git add .
   git commit -m "App Isabel Ribeiro Semijoias"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/isabel-ribeiro-app.git
   git push -u origin main
   ```
   Se preferir, use o botão **uploading an existing file** no site do GitHub e arraste todos os arquivos e pastas.
4. No repositório, vá em **Settings → Pages**. Em *Source* escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e salve.
5. Em 1 ou 2 minutos o app estará em `https://SEU-USUARIO.github.io/isabel-ribeiro-app/`.

> O repositório público contém só o código. **Nenhum dado da loja fica no GitHub**: os dados ficam no Google Drive.

### Passo 2 — Criar o banco de dados no Google Drive

1. Entre em [script.google.com](https://script.google.com) com a conta Google onde os dados devem ficar e clique em **Novo projeto**.
2. Apague o conteúdo que aparecer e cole todo o conteúdo do arquivo [`apps-script/Code.gs`](apps-script/Code.gs). Salve (Ctrl+S) e dê um nome ao projeto.
3. No menu de funções lá em cima, escolha **configurar** e clique em **Executar**.
   - O Google vai pedir permissão para acessar o Drive. Clique em *Revisar permissões* → escolha a conta → *Avançado* → *Acessar (não seguro)* → *Permitir*. Isso aparece porque o script é seu e não passou por verificação do Google.
4. Abra o **Registro de execução** (embaixo). Copie a **chave secreta** que aparece. Guarde-a com cuidado, porque ela dá acesso aos dados.
5. Clique em **Implantar → Nova implantação**. Em *Tipo*, escolha **App da Web**:
   - *Executar como:* **Eu**
   - *Quem pode acessar:* **Qualquer pessoa**
6. Clique em **Implantar** e copie a **URL do app da Web** (termina em `/exec`).

No seu Drive vai aparecer a pasta **Isabel Ribeiro - App**, com:
- `banco-de-dados.json`, que guarda todos os dados;
- `Fotos/`, com as fotos dos produtos;
- `Backups/`, com uma cópia automática por dia (são mantidos os últimos 30 dias).

> "Qualquer pessoa" é necessário para o catálogo público abrir para as clientes. Mesmo assim, o catálogo mostra **apenas** nome, descrição, preço e fotos das peças com estoque. Custos, clientes e vendas só são acessados com a chave secreta.

### Passo 3 — Ligar o app ao Drive

1. No GitHub, abra o arquivo `js/config.js`, clique no lápis (editar) e cole a URL entre as aspas:
   ```js
   window.LOJA_CONFIG = {
     apiUrl: 'https://script.google.com/macros/s/XXXXXXXX/exec'
   };
   ```
   Salve com **Commit changes**. Isso deixa o link do catálogo do WhatsApp curto e bonito.
2. Abra o app, toque na engrenagem (**Configurações**), cole a **URL** e a **chave secreta** e toque em **Conectar e sincronizar**.
3. Repita o item 2 em cada aparelho que for usar (celular, computador). A chave fica guardada só no aparelho.

### Passo 4 — Instalar no celular

- **Android (Chrome):** abra o endereço do app → menu ⋮ → **Adicionar à tela inicial / Instalar app**.
- **iPhone (Safari):** abra o endereço → botão Compartilhar → **Adicionar à Tela de Início**.

---

## Primeiros passos no app

0. **Vendas antigas do caderninho:** em **Vender**, use a aba **Venda avulsa**. Basta informar o valor, a data e as parcelas, sem precisar cadastrar cliente nem produto (o estoque não é alterado). Depois, se quiser, edite a venda para ligar a uma cliente cadastrada.
1. **Produtos → + Categoria**: crie as categorias (Brincos, Colares, Anéis, Pulseiras…).
2. **Produtos → Novo produto**: fotos, nome, descrição, estoque, preço de venda e valor investido. O lucro aparece na hora.
3. **Clientes → Novo cliente** (ou cadastre direto na tela de venda, botão **+ Nova**).
4. **Revendedoras → Nova revendedora**: informe a comissão (%) e use **Enviar peças** para registrar o que ela levou.
5. **Vender** (botão + no rodapé): escolha quem vendeu, a cliente, as peças, o número de parcelas e a data do 1º pagamento.
6. Na **Carteira**, toque em **Recebi** quando uma parcela for paga, ou em **Lembrar** para mandar uma mensagem de cobrança gentil pelo WhatsApp.

### Envio pelo WhatsApp
- **Produto:** o botão verde envia nome, preço, descrição e o link do catálogo, onde a cliente vê as fotos e as outras peças da loja e pode tocar em **Quero esta peça**. No celular, o botão **Com foto** manda a imagem junto.
- **Relatório:** no celular, **Enviar PDF no WhatsApp** abre o compartilhamento já com o PDF. No computador, o PDF é baixado e o WhatsApp abre com o resumo para você anexar o arquivo.

---

## Detalhes técnicos

- HTML, CSS e JavaScript puros, sem etapa de build. Bibliotecas por CDN com versão fixa: Chart.js (gráficos), jsPDF e jsPDF-AutoTable (PDF).
- `index.html` é o app e `loja.html` é o catálogo público.
- O app salva tudo no aparelho e envia para o Drive 1,5 s depois de cada alteração. Também funciona offline e sincroniza quando a internet volta.
- Se dois aparelhos editarem ao mesmo tempo, vale a última gravação. O app sempre baixa a versão mais recente do Drive ao abrir.
- Sem o Drive configurado, os dados ficam só no navegador. Use **Configurações → Baixar backup** para ter uma cópia.
- Para alterar `apps-script/Code.gs` depois: **Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão**. Assim a URL continua a mesma.

```
index.html          app
loja.html           catálogo público (link enviado no WhatsApp)
css/app.css         visual (cores da marca no topo do arquivo)
js/config.js        URL do Apps Script
js/store.js         banco de dados local e sincronização com o Drive
js/analytics.js     regras de cálculo (lucro, parcelas, carteira, rankings)
js/*.js             uma tela por arquivo
apps-script/Code.gs backend no Google Drive
```
