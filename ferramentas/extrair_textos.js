/* Extrai de data.js a lista de textos a gravar, para ferramentas/textos.json.
   Uso:  node ferramentas/extrair_textos.js
   Corre o data.js tal como o browser o corre, por isso o que sai aqui é
   exatamente o que a app mostra — não há risco de o áudio divergir do texto. */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const raiz = path.join(__dirname, "..");
const fonte = fs.readFileSync(path.join(raiz, "data.js"), "utf8");

const contexto = vm.createContext({});
vm.runInContext(
  fonte + "\n;globalThis.__saida = { ORACOES, MISTERIOS, INTENCOES_PAPA, APP_VERSION };",
  contexto
);
const { ORACOES, MISTERIOS, INTENCOES_PAPA, APP_VERSION } = contexto.__saida;

const itens = [];
const juntar = (id, titulo, texto) => {
  if (!id || !texto) return;
  if (itens.some(i => i.id === id)) return;
  itens.push({ id, titulo, texto });
};

for (const chave of Object.keys(ORACOES)) {
  const o = ORACOES[chave];
  if (Array.isArray(o)) o.forEach(x => juntar(x.id, x.titulo, x.texto));
  else juntar(o.id, o.titulo, o.texto);
}

for (const chave of Object.keys(MISTERIOS)) {
  MISTERIOS[chave].lista.forEach(m => juntar(m.id, m.titulo, m.titulo + ". " + m.meditacao));
}

INTENCOES_PAPA.meses.forEach(m => juntar(m.id, m.tema, m.texto));
juntar(INTENCOES_PAPA.geral.id, INTENCOES_PAPA.geral.tema, INTENCOES_PAPA.geral.texto);

const destino = path.join(__dirname, "textos.json");
fs.writeFileSync(destino, JSON.stringify({ versao: APP_VERSION, itens }, null, 2), "utf8");

const caracteres = itens.reduce((n, i) => n + i.texto.length, 0);
console.log(`${itens.length} textos, ${caracteres} caracteres -> ${destino}`);
