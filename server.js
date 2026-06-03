// ============================================================
// server.js — Ponto de Entrada Local do Servidor Backend
// ============================================================

const app = require('./api/index');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n============================================================`);
  console.log(`🚀 Servidor rodando localmente em: http://localhost:${PORT}`);
  console.log(`   Arquivos estáticos do frontend sendo servidos na raiz.`);
  console.log(`============================================================\n`);
});
