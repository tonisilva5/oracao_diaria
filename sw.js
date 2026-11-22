/* =========================================================================
   Service worker — Oração Diária

   Regra de ouro: uma app já instalada NUNCA pode deixar de abrir por causa
   do servidor. A versão anterior servia a resposta do servidor mesmo quando
   era um 404, porque um 404 não rejeita a promessa do fetch — e foi isso que
   partiu a app quando o alojamento expirou. Aqui a cache manda sempre, e o
   que vem da rede só entra na cache depois de verificado.
   ========================================================================= */

const VERSAO = "3.2.0";
const CACHE_APP = "od-app-" + VERSAO;    // casca da aplicação, renovada a cada versão
// As orações gravadas sobrevivem de propósito às atualizações da app — são 6 MB
// que ninguém quer voltar a descarregar por causa de um retoque no código.
// Este nome não precisa de mudar: uma oração regravada traz uma versão nova no
// endereço (audio/<id>.mp3?v=…, tirada de audio/index.json), vai à rede, e a
// versão antiga só sai da cache depois de a nova estar guardada.
const CACHE_AUDIO = "od-audio-v1";
// Leituras do dia: o texto do Evangelizo, o índice das gravações e o áudio de
// cada dia. Limpa-se sozinha (ver limparLeiturasAntigas).
const CACHE_LEITURAS = "od-leituras-v2";

/* Casca mínima sem a qual a app não arranca. */
const ESSENCIAIS = [
  "./",
  "./index.html",
  "./styles.css",
  "./data.js",
  "./app.js"
];

/* Desejáveis, mas que não devem impedir a instalação se falharem. */
const OPCIONAIS = [
  "./audio/index.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png"
];

/* ---------------------------------------------------------------------------
   Uma resposta 200 não chega para ser boa. Quando um domínio expira, o
   servidor costuma responder 200 com uma página de estacionamento para
   qualquer endereço — e guardá-la por cima da app partia-a na abertura
   seguinte. Por isso o HTML tem de ser mesmo o da app, e um .js, .css ou .mp3
   nunca pode chegar como página HTML.
--------------------------------------------------------------------------- */
async function respostaValida(caminho, r) {
  if (!r || !r.ok || r.status !== 200) return false;
  const tipo = (r.headers.get("Content-Type") || "").toLowerCase();
  const ext = ((/\.([a-z0-9]+)$/i.exec(caminho) || [])[1] || "").toLowerCase();

  if (!ext || ext === "html") {
    if (!tipo.includes("text/html")) return false;
    try { return (await r.clone().text()).includes("app.js"); }
    catch (_) { return false; }
  }
  if (tipo.includes("text/html")) return false;
  if (ext === "mp3") return !tipo || tipo.startsWith("audio/") || tipo.includes("octet-stream");
  return true;
}

/* Busca um ficheiro para a cache, passando ao lado da cache HTTP do navegador
   ("reload"): uma versão nova não pode ficar com cópias antigas lá de dentro. */
async function buscarParaCache(u) {
  const pedido = new Request(u, { cache: "reload" });
  const r = await fetch(pedido);
  if (!(await respostaValida(new URL(pedido.url).pathname, r))) {
    throw new Error("Resposta inválida para " + u);
  }
  return r;
}

/* A casca só muda aqui, numa instalação nova, e muda toda de uma vez: se um só
   ficheiro essencial vier mal, a instalação falha e o service worker anterior
   continua a servir a versão que funcionava. Nunca há index.html novo com
   app.js antigo. */
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const respostas = await Promise.all(ESSENCIAIS.map(buscarParaCache));
    const c = await caches.open(CACHE_APP);
    await Promise.all(respostas.map((r, i) => c.put(ESSENCIAIS[i], r)));
    // Um opcional que falhe fica com a cópia da versão anterior: o activate vai
    // apagar essa cache, e com ela a única cópia do índice das orações.
    await Promise.all(OPCIONAIS.map(u =>
      buscarParaCache(u).then(r => c.put(u, r)).catch(async () => {
        try {
          const anterior = await caches.match(u);
          if (anterior) await c.put(u, anterior);
        } catch (_) {}
      })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const manter = [CACHE_APP, CACHE_AUDIO, CACHE_LEITURAS];
    const chaves = await caches.keys();
    await Promise.all(chaves.map(k => manter.includes(k) ? null : caches.delete(k)));
    await limparLeiturasAntigas().catch(() => {});
    await self.clients.claim();
  })());
});

/* Leituras com mais de uma semana já não servem a ninguém. Sem isto, cada dia
   ouvido acrescentava uns MB, e o iOS acabaria por apagar os dados do site
   inteiro — casca da app incluída. */
function diaRelativo(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return "" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
}
async function limparLeiturasAntigas() {
  const corte = diaRelativo(-7);
  const cache = await caches.open(CACHE_LEITURAS);
  const pedidos = await cache.keys();
  await Promise.all(pedidos.map(p => {
    const m = /(?:[?&]date=|\/audio\/leituras\/)(\d{8})/.exec(p.url);
    return m && m[1] < corte ? cache.delete(p) : null;
  }));
}

/* ---------------------------------------------------------------------------
   Pedidos com cabeçalho Range (o Safari usa-os para áudio)
   A Cache API só guarda respostas inteiras. Devolver um 200 completo a um
   pedido Range faz o áudio falhar em silêncio no iOS, por isso recortamos
   aqui o troço pedido e respondemos 206 como o servidor faria.
--------------------------------------------------------------------------- */
async function respostaParcial(pedido, resposta) {
  const cabecalho = pedido.headers.get("range") || "";
  const m = /bytes=(\d*)-(\d*)/.exec(cabecalho);
  const buffer = await resposta.arrayBuffer();
  const total = buffer.byteLength;

  if (!m) return new Response(buffer, { status: 200, headers: resposta.headers });

  let inicio = m[1] === "" ? null : parseInt(m[1], 10);
  let fim = m[2] === "" ? null : parseInt(m[2], 10);

  if (inicio === null && fim === null) return new Response(buffer, { status: 200 });
  if (inicio === null) {                 // sufixo: os últimos N bytes
    inicio = Math.max(0, total - fim);
    fim = total - 1;
  } else if (fim === null || fim >= total) {
    fim = total - 1;
  }

  if (inicio > fim || inicio >= total) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": "bytes */" + total }
    });
  }

  const troco = buffer.slice(inicio, fim + 1);
  return new Response(troco, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": resposta.headers.get("Content-Type") || "audio/mpeg",
      "Content-Length": String(troco.byteLength),
      "Content-Range": `bytes ${inicio}-${fim}/${total}`,
      "Accept-Ranges": "bytes"
    }
  });
}

/* Rede primeiro, cache como rede de segurança. Para conteúdo que muda todos os
   dias — as leituras e o índice das suas gravações.
   `chave`: guarda e procura sob este endereço em vez do pedido. O índice das
   gravações é pedido com a data no endereço (para fugir à cache HTTP), mas
   guardado sem ela — senão, offline, o pedido de amanhã nunca encontrava a
   cópia de hoje.
   `validar`: só para ficheiros nossos; o texto do Evangelizo é a app que o
   verifica. */
async function redePrimeiro(pedido, nomeCache, chave, validar) {
  try {
    const r = await fetch(pedido);
    if (!r || !r.ok) throw new Error("HTTP " + (r && r.status));
    if (validar && !(await respostaValida(new URL(pedido.url).pathname, r))) {
      throw new Error("Resposta inválida");
    }
    const cache = await caches.open(nomeCache);
    cache.put(chave || pedido.url, r.clone()).catch(() => {});
    return r;
  } catch (_) {
    const guardado = await caches.match(chave || pedido, { cacheName: nomeCache });
    if (guardado) return guardado;
    return new Response("", { status: 504, statusText: "Sem ligacao" });
  }
}

/* O mesmo ficheiro guardado com outra versão no endereço (outro ?v=). */
async function outrasVersoes(cache, endereco) {
  const alvo = new URL(endereco);
  return (await cache.keys()).filter(k => {
    const u = new URL(k.url);
    return u.pathname === alvo.pathname && u.search !== alvo.search;
  });
}

/* Guarda a gravação nova e só depois apaga as versões antigas dela. */
async function guardarGravacao(cache, endereco, resposta) {
  await cache.put(endereco, resposta);
  const antigas = await outrasVersoes(cache, endereco);
  await Promise.all(antigas.map(k => cache.delete(k)));
}

/* Cache primeiro; a rede só repõe o que faltar, e só depois de verificado.
   Não há revalidação em segundo plano: a casca só muda com uma VERSAO nova
   (ver install) e cada gravação é imutável — uma regravada tem endereço novo. */
async function cachePrimeiro(e, pedido, nomeCache, eAudio) {
  const cache = await caches.open(nomeCache);
  const guardado = await cache.match(pedido, { ignoreVary: true });
  const comRange = !!pedido.headers.get("range");

  if (guardado) return comRange ? respostaParcial(pedido, guardado.clone()) : guardado;

  // O Safari pede o áudio aos bocados (Range) e o servidor responde 206, que
  // não se pode guardar. Pede-se o ficheiro inteiro, guarda-se, e recorta-se
  // aqui o troço pedido — assim a oração ou a leitura fica logo para offline.
  let resposta = null;
  try { resposta = await fetch(eAudio && comRange ? pedido.url : pedido); } catch (_) {}

  if (resposta && await respostaValida(new URL(pedido.url).pathname, resposta)) {
    // Guarda-se pelo URL e não pelo pedido: um pedido feito com "no-store"
    // não pode ser usado como chave, e a gravação falharia em silêncio.
    e.waitUntil((eAudio
      ? guardarGravacao(cache, pedido.url, resposta.clone())
      : cache.put(pedido.url, resposta.clone())).catch(() => {}));
    if (!comRange) return resposta;
    // O recorte lê o ficheiro inteiro; se a ligação cair a meio, ainda há a
    // versão anterior.
    try { return await respostaParcial(pedido, resposta.clone()); }
    catch (_) { resposta = null; }
  }

  // Sem rede (ou o servidor em baixo) e uma gravação regravada que ainda não
  // chegou: a versão anterior, com a voz antiga, é melhor do que nenhuma.
  if (eAudio) {
    const [antiga] = await outrasVersoes(cache, pedido.url);
    const r = antiga && await cache.match(antiga);
    if (r) return comRange ? respostaParcial(pedido, r) : r;
  }
  if (resposta) return resposta;
  throw new Error("Sem ligação");
}

self.addEventListener("fetch", e => {
  const pedido = e.request;
  if (pedido.method !== "GET") return;

  let url;
  try { url = new URL(pedido.url); } catch (_) { return; }

  /* Leituras do dia (Evangelizo). */
  if (url.hostname === "feed.evangelizo.org" || url.hostname.endsWith(".evangelizo.org")) {
    e.respondWith(redePrimeiro(pedido, CACHE_LEITURAS));
    return;
  }

  if (url.origin !== location.origin) return;

  /* Índice das leituras gravadas: muda todos os dias, por isso não pode vir da
     cache enquanto houver rede — senão a app ficava presa às gravações de ontem. */
  if (url.pathname.endsWith("/audio/leituras/index.json")) {
    e.respondWith(redePrimeiro(pedido, CACHE_LEITURAS, url.origin + url.pathname, true));
    e.waitUntil(limparLeiturasAntigas().catch(() => {}));
    return;
  }

  /* Índice das orações gravadas: rede primeiro, guardado na casca. Diz que
     versão de cada gravação pedir; preso a uma cópia antiga (uma instalação
     que não o conseguiu buscar), o telemóvel nunca veria uma oração regravada. */
  if (url.pathname.endsWith("/audio/index.json")) {
    e.respondWith(redePrimeiro(pedido, CACHE_APP, url.origin + url.pathname, true));
    return;
  }

  /* Navegação: abre sempre a partir da cache. */
  if (pedido.mode === "navigate") {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_APP);
      const guardado = await cache.match("./index.html");
      if (guardado) return guardado;
      try {
        const r = await fetch(pedido);
        if (await respostaValida(url.pathname, r)) {
          cache.put("./index.html", r.clone()).catch(() => {});
        }
        return r;
      } catch (_) {
        return new Response(
          "<!doctype html><meta charset=utf-8><title>Oração Diária</title>" +
          "<p style='font-family:sans-serif;padding:2rem'>Sem ligação e sem cópia guardada. " +
          "Abra a aplicação uma vez com internet.",
          { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    })());
    return;
  }

  const eAudio = url.pathname.includes("/audio/") && /\.mp3$/i.test(url.pathname);
  const eLeitura = eAudio && url.pathname.includes("/audio/leituras/");
  const nomeCache = eLeitura ? CACHE_LEITURAS : (eAudio ? CACHE_AUDIO : CACHE_APP);
  e.respondWith(
    cachePrimeiro(e, pedido, nomeCache, eAudio)
      .catch(() => caches.match(pedido).then(h => h || Response.error()))
  );
});

/* ---------------------------------------------------------------------------
   Descarregamento das orações gravadas, pedido pela app.
   Vai relatando o progresso para a página poder mostrá-lo nas Definições.
--------------------------------------------------------------------------- */
self.addEventListener("message", e => {
  const dados = e.data || {};
  if (dados.tipo !== "precarregar-audio" || !Array.isArray(dados.urls)) return;

  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_AUDIO);
    let feitos = 0, falhas = 0;

    for (const u of dados.urls) {
      try {
        if (await cache.match(u)) { feitos++; }
        else {
          const r = await fetch(u, { cache: "no-store" });
          if (await respostaValida(new URL(u).pathname, r)) { await guardarGravacao(cache, u, r.clone()); feitos++; }
          else falhas++;
        }
      } catch (_) { falhas++; }

      if ((feitos + falhas) % 5 === 0 || feitos + falhas === dados.urls.length) {
        // Logo a seguir à instalação a página pode ainda não estar sob controlo
        // deste service worker; tem de receber o progresso na mesma.
        const clientes = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
        clientes.forEach(c => c.postMessage({
          tipo: "progresso-audio", feitos, falhas, total: dados.urls.length
        }));
      }
    }
  })());
});
