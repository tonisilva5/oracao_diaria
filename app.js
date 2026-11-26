/* =========================================================================
   Oração Diária — Lógica da aplicação
   ========================================================================= */
"use strict";

/* ---------- Utilidades de data ---------- */
function meiaNoite(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function yyyymmdd(d) {
  return "" + d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
}
function dataExtenso(d) {
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
function dataCurta(d) {
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

const $ = id => document.getElementById(id);

/* As leituras guardadas para uso offline (od_leit_AAAAMMDD) acumulam-se dia a
   dia; apagam-se as anteriores a hoje menos `diasAManter`. */
function limparLeiturasGuardadas(diasAManter) {
  try {
    const limite = new Date(); limite.setDate(limite.getDate() - diasAManter);
    const corte = yyyymmdd(limite);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      const m = /^od_leit_(\d{8})$/.exec(k || "");
      if (m && m[1] < corte) localStorage.removeItem(k);
    }
  } catch (e) {}
}

const guardar = (chave, valor) => {
  try { localStorage.setItem(chave, valor); }
  catch (e) {
    // Quase sempre é a quota cheia de leituras antigas. Se não se limpasse,
    // nem as definições voltariam a ficar gravadas — e ninguém daria por isso.
    limparLeiturasGuardadas(0);
    try { localStorage.setItem(chave, valor); } catch (e2) {}
  }
};
const lido = (chave, omissao) => {
  try { const v = localStorage.getItem(chave); return v === null ? omissao : v; }
  catch (e) { return omissao; }
};

/* ---------- Estado ---------- */
const state = {
  hoje: meiaNoite(new Date()),
  dataLeitura: meiaNoite(new Date()),
  misterioSel: null,
  passos: [],
  passoIdx: 0,
  vozGuiada: false,
  settings: {
    voiceURI: lido("od_voiceURI", ""),
    rate: parseFloat(lido("od_rate", "0.88")),
    pitch: parseFloat(lido("od_pitch", "0.96")),
    autoAvancar: lido("od_auto", "1") !== "0",
    vozGravada: lido("od_gravada", "1") !== "0",
    jaculatoria: lido("od_jaculatoria", "1") !== "0",
    oracoesFinais: lido("od_finais", "1") !== "0",
    oracoesPapa: lido("od_papa", "0") !== "0",
    ladainha: lido("od_ladainha", "marianos")   // nunca | marianos | sempre
  }
};

/* =========================================================================
   LOCUTOR
   Duas vozes possíveis, pela mesma interface:
     1. Orações gravadas com voz neural portuguesa (audio/*.mp3) — a boa;
     2. A voz do sistema, só para texto que muda todos os dias.
   ========================================================================= */

/* 10 ms de silêncio. Serve para desbloquear a reprodução no iOS: o Safari
   só deixa tocar áudio a partir de um toque do utilizador, e a autorização
   fica ligada ao elemento <audio> que foi usado nesse toque. */
const SILENCIO = "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

/* Abreviaturas bíblicas por extenso, para a voz do sistema não as soletrar. */
const LIVROS_BIBLICOS = {
  "Gn": "Génesis", "Ex": "Êxodo", "Lv": "Levítico", "Nm": "Números", "Dt": "Deuteronómio",
  "Js": "Josué", "Jz": "Juízes", "Rt": "Rute", "Sm": "Samuel", "Rs": "Reis",
  "Cr": "Crónicas", "Esd": "Esdras", "Ne": "Neemias", "Tb": "Tobias", "Jdt": "Judite",
  "Est": "Ester", "Mac": "Macabeus", "Jb": "Job", "Sl": "Salmo", "Pr": "Provérbios",
  "Ecl": "Eclesiastes", "Ct": "Cântico dos Cânticos", "Sb": "Sabedoria", "Si": "Ben Sira",
  "Is": "Isaías", "Jr": "Jeremias", "Lm": "Lamentações", "Br": "Baruc", "Ez": "Ezequiel",
  "Dn": "Daniel", "Os": "Oseias", "Jl": "Joel", "Am": "Amós", "Ab": "Abdias",
  "Jn": "Jonas", "Mq": "Miqueias", "Na": "Naum", "Hab": "Habacuc", "Sf": "Sofonias",
  "Ag": "Ageu", "Zc": "Zacarias", "Ml": "Malaquias",
  "Mt": "Mateus", "Mc": "Marcos", "Lc": "Lucas", "Jo": "João", "Act": "Actos dos Apóstolos",
  "At": "Actos dos Apóstolos", "Rm": "Romanos", "Co": "Coríntios", "Gl": "Gálatas",
  "Ef": "Efésios", "Fl": "Filipenses", "Cl": "Colossenses", "Ts": "Tessalonicenses",
  "Tm": "Timóteo", "Tt": "Tito", "Fm": "Filémon", "Hb": "Hebreus", "Tg": "Tiago",
  "Pe": "Pedro", "Jd": "Judas", "Ap": "Apocalipse"
};

/* Prepara o texto para ser falado: tira o que a voz leria mal. */
function textoParaVoz(texto) {
  if (!texto) return "";
  let t = texto;

  t = t.replace(/[«»""]/g, " ");                 // aspas angulares soam a ruído
  t = t.replace(/\b([dnDN])'([EA])/g, (m, a, b) => a + b.toLowerCase());  // d'Ele -> dele
  t = t.replace(/\bV\.\s*/g, "").replace(/\bR\.\s*/g, "");  // versículo/resposta

  // "1_Co 9,16-19" e "Mt 18,21-35." -> nome do livro por extenso
  t = t.replace(/\b(\d)?[_ ]?([A-Z][a-zç]{1,3})\s+(\d+)\s*,\s*[\d.\-–]+/g,
    (todo, num, abrev, cap) => {
      const livro = LIVROS_BIBLICOS[abrev];
      if (!livro) return todo;
      const ordinal = num ? (num === "1" ? "primeira carta aos " : "segunda carta aos ") : "";
      return `${ordinal}${livro}, capítulo ${cap}`;
    });

  t = t.replace(/\s{2,}/g, " ").trim();
  return t;
}

const Locutor = {
  vozes: [],
  voz: null,
  disponiveis: new Set(),   // ids com gravação em audio/<id>.mp3
  leituras: {},             // dias com leituras gravadas: { "20260913": ["salmo", …] }
  fila: [],
  idx: 0,
  aFalar: false,
  pausado: false,
  _parado: false,
  _pendente: false,         // pausado no intervalo entre orações: a seguinte espera pelo ▶
  _timer: null,
  _emCurso: null,           // item de áudio entregue ao elemento <audio>
  onDone: null,
  keepAlive: null,
  audioEl: null,
  _armado: false,
  _vozArmada: false,
  versoes: {},              // id → impressão do MP3 gravado (audio/index.json)
  _pausaPropria: false,     // a app pausou o elemento ela própria: não é o sistema

  suportaVoz() { return "speechSynthesis" in window; },

  iniciar() {
    const a = this.audioEl = new Audio();
    a.preload = "auto";
    a.addEventListener("ended", () => this._terminouItem(this._emCurso));
    a.addEventListener("error", () => this._falharAudio(this._emCurso));
    // O iOS também pausa e retoma sozinho: auscultadores tirados, chamada,
    // botões do ecrã bloqueado — mesmo com a oração ainda a carregar. A app
    // tem de dar por isso, senão o ▶ da barra fica trocado e o terço parado.
    // As pausas da própria app trazem pausado=true (alternar), aFalar=false
    // (parar) ou a marca _pausaPropria; a do fim da oração traz ended.
    a.addEventListener("pause", () => {
      if (this._pausaPropria) { this._pausaPropria = false; return; }
      if (!this.aFalar || this.pausado || a.ended || !a.paused) return;
      if (this.fila[this.idx] !== this._emCurso) return;
      this.pausado = true;
      atualizarBotaoVoiceBar();
    });
    a.addEventListener("play", () => {
      if (!this.aFalar || !this.pausado) return;
      const item = this.fila[this.idx];
      if (this._pendente || !item || item.tipo !== "audio") {
        // O elemento ainda tem a oração anterior: retoma-se a fila, não ela.
        if (!a.paused) { this._pausaPropria = true; a.pause(); }
        this.alternar();
        return;
      }
      this.pausado = false;
      atualizarBotaoVoiceBar();
    });
    if (this.suportaVoz()) {
      this.carregarVozes();
      window.speechSynthesis.onvoiceschanged = () => this.carregarVozes();
    }
    this.carregarIndiceAudio();
  },

  /* Chamado a partir de um toque do utilizador, para o iOS autorizar o áudio. */
  armar() {
    // A voz do sistema tem a sua própria autorização no iOS: um speak() fora de
    // um toque é descartado sem aviso. Sem isto, a voz que substitui uma
    // gravação em falta (offline) nunca falava e a oração ficava parada.
    if (!this._vozArmada && this.suportaVoz()) {
      try {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
        this._vozArmada = true;
      } catch (e) {}
    }
    if (this._armado || !this.audioEl) return;
    this._armado = true;
    const a = this.audioEl;
    a.src = SILENCIO;
    const p = a.play();
    // Um AbortError aqui é normal: quer dizer que a oração começou logo a seguir
    // e interrompeu o silêncio. O desbloqueio valeu na mesma — só um erro a sério
    // é que obriga a tentar outra vez no toque seguinte.
    if (p && p.catch) p.catch(erro => {
      if (!erro || erro.name !== "AbortError") this._armado = false;
    });
  },

  async carregarIndiceAudio() {
    try {
      const r = await fetch("audio/index.json");
      if (!r.ok) throw new Error("sem índice");
      const dados = await r.json();
      (dados.ficheiros || []).forEach(f => this.disponiveis.add(f));
      this.versoes = dados.versoes || {};
    } catch (e) { /* sem gravações: a voz do sistema assume */ }
    atualizarEstadoAudio();

    // As leituras do dia são gravadas de véspera por uma automatização.
    // Se não houver, não faz mal: lê-se com a voz do telemóvel.
    // A data no endereço obriga o navegador a ir buscar o índice de hoje em vez
    // de reaproveitar o de ontem da sua própria cache.
    try {
      const r = await fetch("audio/leituras/index.json?d=" + yyyymmdd(state.hoje));
      if (r.ok) this.leituras = (await r.json()).dias || {};
    } catch (e) { /* sem gravações das leituras: a voz do sistema assume */ }
  },

  temGravacao(id) {
    return !!id && state.settings.vozGravada && this.disponiveis.has(id);
  },

  /* Endereço da gravação de uma oração. A versão no endereço faz com que uma
     oração regravada seja pedida de novo, enquanto as outras continuam a sair
     da cache do telemóvel. */
  srcGravacao(id) {
    const v = this.versoes[id];
    return `audio/${id}.mp3` + (v ? "?v=" + encodeURIComponent(String(v).slice(0, 12)) : "");
  },

  /* Caminho do áudio de uma leitura, se tiver sido gravada para aquele dia. */
  gravacaoDaLeitura(data, chave) {
    if (!state.settings.vozGravada || !chave) return null;
    const dia = this.leituras[yyyymmdd(data)];
    return dia && dia.includes(chave) ? `audio/leituras/${yyyymmdd(data)}-${chave}.mp3` : null;
  },

  /* ---------- voz do sistema, para as leituras do dia ---------- */
  carregarVozes() {
    if (!this.suportaVoz()) return;
    this.vozes = window.speechSynthesis.getVoices() || [];
    this._escolherVoz();
    preencherSelectVozes();
    atualizarAvisoVoz();
  },

  _lang(v) { return (v.lang || "").replace(/_/g, "-"); },
  ePortugalPT(v) { return /^pt-PT$/i.test(this._lang(v)); },
  ePortugues(v) { return /^pt\b/i.test(this._lang(v)); },

  _escolherVoz() {
    const boa = v => !/compact/i.test(v.voiceURI || "") ||
      /(enhanced|premium|melhorad|neural|natural|siri)/i.test((v.voiceURI || "") + " " + (v.name || ""));
    const ptPT = this.vozes.filter(v => this.ePortugalPT(v));

    let v = null;
    if (state.settings.voiceURI) {
      v = this.vozes.find(x => x.voiceURI === state.settings.voiceURI);
      // Versões antigas da app podiam ter deixado gravada uma voz do Brasil sem
      // o utilizador dar por isso. Corrige-se uma única vez; a partir daí, quem
      // escolher uma voz de propósito fica com ela.
      if (v && !this.ePortugalPT(v) && ptPT.length && lido("od_vozMigrada", "0") !== "1") {
        v = null;
        guardar("od_vozMigrada", "1");
      }
    }
    if (!v) v = ptPT.find(boa) || ptPT[0] || null;
    if (!v) v = this.vozes.filter(x => this.ePortugues(x)).find(boa) ||
               this.vozes.find(x => this.ePortugues(x)) || null;
    this.voz = v;
  },

  definirVoz(voiceURI) {
    state.settings.voiceURI = voiceURI;
    guardar("od_voiceURI", voiceURI);
    guardar("od_vozMigrada", "1");   // escolha deliberada: a migração nunca a desfaz
    this.voz = this.vozes.find(v => v.voiceURI === voiceURI) || this.voz;
    atualizarAvisoVoz();
  },

  _trocos(texto) {
    const limpo = textoParaVoz(texto);
    if (!limpo) return [];
    const frases = limpo.match(/[^.!?…]+[.!?…]+(?:\s|$)|[^.!?…]+$/g) || [limpo];
    const trocos = [];
    let buf = "";
    for (let s of frases) {
      s = s.trim();
      if (!s) continue;
      if ((buf + " " + s).trim().length > 190) {
        if (buf) trocos.push(buf.trim());
        buf = s;
      } else buf = (buf ? buf + " " : "") + s;
    }
    if (buf.trim()) trocos.push(buf.trim());
    return trocos;
  },

  /* seccoes: [{label, sub, texto, id, btn}] — id indica gravação disponível */
  ler(seccoes, onDone) {
    this.parar(true);
    this.fila = [];

    seccoes.forEach(sec => {
      const gravacao = sec.src || (this.temGravacao(sec.id) ? this.srcGravacao(sec.id) : null);
      if (gravacao) {
        this.fila.push({ tipo: "audio", src: gravacao, textoAlternativo: sec.texto,
          label: sec.label, sub: sec.sub || "Oração Diária", btn: sec.btn || null });
      } else {
        const trocos = this._trocos(sec.texto);
        if (!trocos.length) return;
        trocos.forEach(t => this.fila.push({ tipo: "voz", texto: t,
          label: sec.label, sub: sec.sub || "Oração Diária", btn: sec.btn || null }));
      }
    });

    if (!this.fila.length) { if (onDone) onDone(); return; }
    if (!this.fila.some(i => i.tipo === "audio") && !this.suportaVoz()) {
      alert("Este dispositivo não suporta leitura em voz alta.");
      return;
    }

    this.idx = 0;
    this.onDone = onDone || null;
    this._parado = false;
    this.aFalar = true;
    this.pausado = false;
    this._pendente = false;
    mostrarVoiceBar(true);
    this._arrancarKeepAlive();
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    this._agendar(80);
  },

  /* Um só temporizador de cada vez: dois em paralelo tocariam a mesma oração duas vezes. */
  _agendar(ms) {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => { this._timer = null; if (!this._parado) this._tocar(); }, ms);
  },

  /* Os eventos do áudio e da voz chegam com atraso — às vezes já depois de o
     utilizador ter passado a outra oração. Cada item da fila é um objeto novo,
     por isso só conta o evento do item que está de facto a tocar agora. */
  _eAtual(item) {
    return !!item && !this._parado && this.aFalar && this.fila[this.idx] === item;
  },

  _tocar() {
    if (this._parado) return;
    // Pausado no intervalo entre duas orações: a seguinte só arranca com o ▶.
    // Vem antes do fim da fila — no terço, terminar a fila é avançar de passo.
    if (this.pausado) { this._pendente = true; return; }
    if (this.idx >= this.fila.length) { this._terminar(); return; }

    const item = this.fila[this.idx];
    marcarBotaoALer(item.btn);
    atualizarVoiceBar(item.label, item.sub);

    if (item.tipo === "audio") {
      const a = this.audioEl;
      const alvo = new URL(item.src, location.href).href;
      this._emCurso = item;
      // Dez Avé-Marias seguidas usam o mesmo ficheiro. Reatribuir o mesmo src
      // nem sempre rebobina o áudio, e a oração ficaria parada no fim sem nunca
      // terminar — daí repor o tempo à mão quando a gravação não muda.
      if (a.src === alvo) { try { a.currentTime = 0; } catch (e) {} }
      else { this._pausaPropria = false; a.src = item.src; }   // carregar outro som anula a pausa pendente
      const p = a.play();
      // Um AbortError só quer dizer que alguém pausou ou mudou de oração antes
      // de o som arrancar; não é uma gravação estragada.
      if (p && p.catch) p.catch(erro => {
        if (!erro || erro.name !== "AbortError") this._falharAudio(item);
      });
    } else {
      const utt = new SpeechSynthesisUtterance(item.texto);
      if (this.voz) utt.voice = this.voz;
      utt.lang = (this.voz && this._lang(this.voz)) || "pt-PT";
      utt.rate = state.settings.rate;
      utt.pitch = state.settings.pitch;
      utt.onstart = () => { item.comecou = true; };
      utt.onend = () => this._terminouItem(item);
      utt.onerror = () => this._terminouItem(item);
      try { window.speechSynthesis.speak(utt); } catch (e) { this._terminouItem(item); }
      // Rede de segurança: uma frase que o sistema recusa em silêncio não dá
      // início, fim nem erro, e a oração ficaria parada para sempre. Uma
      // recusada nem entra na fila do sintetizador; se ele tem alguma coisa a
      // falar ou à espera, a frase está só atrasada — espera-se mais.
      const vigiar = () => setTimeout(() => {
        if (item.comecou || this.pausado || !this._eAtual(item)) return;
        const s = window.speechSynthesis;
        if (s && (s.speaking || s.pending)) { vigiar(); return; }
        this._terminouItem(item);
      }, 5000);
      vigiar();
    }
  },

  _terminouItem(item) {
    if (this._eAtual(item)) this._avancar();
  },

  /* Uma gravação que não toque não pode calar a oração: lê-se pela voz do sistema.
     O play() e o evento error avisam ambos da mesma falha; como a fila troca o
     item pelos substitutos, o segundo aviso já não encontra o item e é ignorado. */
  _falharAudio(item) {
    if (!this._eAtual(item) || item.tipo !== "audio") return;
    const trocos = this.suportaVoz() ? this._trocos(item.textoAlternativo) : [];
    if (trocos.length) {
      const substitutos = trocos.map(t => ({ tipo: "voz", texto: t,
        label: item.label, sub: item.sub, btn: item.btn }));
      this.fila.splice(this.idx, 1, ...substitutos);
      this._tocar();
    } else this._avancar();
  },

  /* Pausa curta entre frases — é o que torna a leitura orante e não corrida. */
  _avancar() {
    if (this._parado || !this.aFalar) return;   // ignora o fim do som de desbloqueio
    this.idx++;
    const pausa = this.fila[this.idx - 1] && this.fila[this.idx - 1].tipo === "audio" ? 420 : 260;
    this._agendar(pausa);
  },

  _terminar() {
    this.aFalar = false;
    this.pausado = false;
    this._pararKeepAlive();
    marcarBotaoALer(null);
    mostrarVoiceBar(false);
    const cb = this.onDone;
    this.onDone = null;
    if (cb) cb();
    // A mudança de dia não se faz a meio de uma leitura; fica para quando acabar.
    setTimeout(verificarMudancaDeDia, 0);
  },

  alternar() {
    if (!this.aFalar) return;
    const item = this.fila[this.idx];
    if (this.pausado) {
      this.pausado = false;
      // A voz do sistema pode ter ficado em pausa mesmo sem estar a falar
      // (pausa no intervalo); sem o resume, a frase seguinte nunca sairia.
      try { window.speechSynthesis && window.speechSynthesis.resume(); } catch (e) {}
      if (this._pendente) { this._pendente = false; this._tocar(); }
      else if (item && item.tipo === "audio") this.audioEl.play().catch(() => {});
      else if (item && !item.comecou) {
        // A frase nunca chegou a começar (recusada fora de um toque). O ▶ é um
        // toque: volta a pedi-la. A cópia faz o cancel() da antiga ser ignorado.
        this.fila[this.idx] = Object.assign({}, item);
        try { window.speechSynthesis.cancel(); } catch (e) {}
        this._agendar(0);   // e não _tocar(): um intervalo pendente diria a frase duas vezes
      }
    } else {
      this.pausado = true;
      if (item && item.tipo === "audio") this.audioEl.pause();
      else { try { window.speechSynthesis.pause(); } catch (e) {} }
    }
    atualizarBotaoVoiceBar();
  },

  parar(silencioso) {
    this._parado = true;
    this.aFalar = false;
    this.pausado = false;
    this._pendente = false;
    this._emCurso = null;
    this.onDone = null;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._pararKeepAlive();
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    if (this.audioEl) { try { this.audioEl.pause(); } catch (e) {} }
    marcarBotaoALer(null);
    if (!silencioso) {
      mostrarVoiceBar(false);
      // Parada à mão (⏹): a mudança de dia que ficou adiada faz-se agora.
      setTimeout(verificarMudancaDeDia, 0);
    }
  },

  /* Alguns navegadores calam a voz do sistema ao fim de ~15 s. */
  _arrancarKeepAlive() {
    this._pararKeepAlive();
    this.keepAlive = setInterval(() => {
      const item = this.fila[this.idx];
      if (this.aFalar && !this.pausado && item && item.tipo === "voz") {
        try { window.speechSynthesis.resume(); } catch (e) {}
      }
    }, 9000);
  },
  _pararKeepAlive() { if (this.keepAlive) { clearInterval(this.keepAlive); this.keepAlive = null; } }
};

/* ---------- Barra de leitura ---------- */
function mostrarVoiceBar(mostrar) {
  $("voiceBar").classList.toggle("show", mostrar);
  if (mostrar) atualizarBotaoVoiceBar();
}
function atualizarVoiceBar(titulo, sub) {
  $("vbTitle").textContent = titulo || "A ler…";
  $("vbSub").textContent = sub || "Oração Diária";
}
function atualizarBotaoVoiceBar() {
  $("vbToggle").textContent = Locutor.pausado ? "▶" : "⏸";
}
function marcarBotaoALer(btn) {
  document.querySelectorAll(".speak-btn.speaking").forEach(b => {
    b.classList.remove("speaking");
    b.innerHTML = b.dataset.label || "🔊 Ler";
  });
  if (btn) { btn.classList.add("speaking"); btn.innerHTML = "⏹ Parar"; }
}

/* =========================================================================
   NAVEGAÇÃO
   ========================================================================= */
function mostrarVista(nome) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const alvo = $("view-" + nome);
  if (alvo) alvo.classList.add("active");
  document.querySelectorAll(".tabbar .tab").forEach(t => {
    t.classList.toggle("active", t.dataset.view === nome);
  });
  window.scrollTo({ top: 0 });
  if (nome === "leituras" && !leiturasCarregadas) carregarLeituras();
}

/* =========================================================================
   INÍCIO
   ========================================================================= */
function preencherInicio() {
  $("topDate").textContent = dataExtenso(state.hoje);
  $("heroTitulo").textContent = "Louvado seja Jesus Cristo";
  $("heroSub").textContent = dataExtenso(state.hoje);

  const chaveHoje = misteriosDoDia(state.hoje.getDay());
  $("quickTercoDesc").textContent = "Hoje: " + MISTERIOS[chaveHoje].nome + ".";

  const intc = INTENCOES_PAPA.intencaoDoMes(state.hoje);
  $("intMes").textContent = MESES[state.hoje.getMonth()] + " " + state.hoje.getFullYear();
  $("intTema").textContent = intc.tema;
  $("intTexto").textContent = intc.texto;
  $("intAssina").textContent = intc.geral
    ? "A intenção deste mês ainda não está na aplicação."
    : INTENCOES_PAPA.papa + " · " + INTENCOES_PAPA.fonte;
}

/* =========================================================================
   LEITURAS DO DIA (Evangelizo — Lecionário português)
   ========================================================================= */
let leiturasCarregadas = false;

function urlEvangelizo(d) {
  return `https://feed.evangelizo.org/v2/reader.php?date=${yyyymmdd(d)}&type=xml&lang=PT`;
}
function getTag(doc, tag) {
  const el = doc.getElementsByTagName(tag)[0];
  return el ? (el.textContent || "").trim() : "";
}

/* Uma resposta com o Evangelho preenchido. Dias futuros ainda por publicar vêm
   vazios — esses não se guardam, senão ficavam vazios para sempre. O feed
   embrulha o texto em CDATA, por isso um CDATA vazio também conta como vazio. */
function leituraCompleta(texto) {
  return !!texto && /<evangelizo>/i.test(texto) &&
    /<reading_gospel>(?!\s*(?:<!\[CDATA\[\s*\]\]>\s*)?<\/reading_gospel>)/i.test(texto);
}

/* Texto de um endereço, ou null. Uma ligação pendurada (rede fraca na igreja)
   não pode deixar o ecrã eternamente a carregar. */
async function pedirTexto(endereco, ms) {
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const limite = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  try {
    const resp = await fetch(endereco, ctl ? { signal: ctl.signal } : undefined);
    if (!resp.ok) return null;
    return await resp.text();
  } catch (err) {
    return null;
  } finally {
    if (limite) clearTimeout(limite);
  }
}

async function obterXml(d) {
  const chaveCache = "od_leit_" + yyyymmdd(d);
  // As leituras de um dia não mudam: havendo cópia completa, nem se vai à rede.
  const guardado = lido(chaveCache, null);
  if (leituraCompleta(guardado)) return guardado;

  // Primeiro a cópia publicada no próprio site pela automação diária (os
  // próximos dias). No iPhone o pedido direto ao Evangelizo falhava; um
  // ficheiro do mesmo endereço da app não depende de outro site.
  const doSite = await pedirTexto(`audio/leituras/${yyyymmdd(d)}.xml`, 8000);
  if (leituraCompleta(doSite)) { guardar(chaveCache, doSite); return doSite; }

  // Dias fora dessa janela (anteriores ou mais adiante): o Evangelizo.
  const doFeed = await pedirTexto(urlEvangelizo(d), 8000);
  if (doFeed && /<evangelizo>/i.test(doFeed)) {
    if (leituraCompleta(doFeed)) guardar(chaveCache, doFeed);
    return doFeed;
  }
  return guardado;
}

let pedidoLeituras = 0;   // só o pedido mais recente pode desenhar o ecrã

async function carregarLeituras() {
  const cont = $("leiturasConteudo");
  const data = state.dataLeitura;
  const pedido = ++pedidoLeituras;
  $("leituraData").textContent = dataCurta(data);
  atualizarNavData();
  cont.innerHTML = `<div class="status"><div class="spinner"></div>A carregar as leituras…</div>`;
  cont._seccoes = null;     // o «Ler tudo» não pode ler o dia anterior enquanto este carrega
  // Cala-se a leitura do dia anterior; o terço com voz guiada continua a rezar.
  if (!state.vozGuiada) Locutor.parar();

  const xmlTexto = await obterXml(data);
  if (pedido !== pedidoLeituras) return;   // entretanto o utilizador mudou de dia
  if (!xmlTexto) {
    cont.innerHTML = `<div class="status">
      Não foi possível obter as leituras deste dia.<br>Verifique a ligação à internet.
      <br><button class="retry-btn" onclick="carregarLeituras()">Tentar de novo</button>
    </div>`;
    leiturasCarregadas = false;
    return;
  }

  const doc = new DOMParser().parseFromString(xmlTexto, "text/xml");
  const santo = getTag(doc, "saint");
  const titLit = getTag(doc, "litugic_t") || getTag(doc, "liturgic_t");

  const seccoes = [];
  const push = (chave, eyebrow, ref, texto) => {
    if (texto && texto.trim()) seccoes.push({ chave, eyebrow, ref, texto: texto.trim() });
  };
  push("primeira", "Primeira Leitura", getTag(doc, "reading_text1_lt"), getTag(doc, "reading_text1"));
  push("salmo", "Salmo Responsorial", getTag(doc, "reading_text2_lt"), getTag(doc, "reading_text2"));
  push("segunda", "Segunda Leitura", getTag(doc, "reading_text3_lt"), getTag(doc, "reading_text3"));
  push("evangelho", "Evangelho", getTag(doc, "reading_gospel_lt"), getTag(doc, "reading_gospel"));

  renderLeituras(data, santo, titLit, seccoes);
  leiturasCarregadas = true;
  preCarregarDiasSeguintes(data);
}

/* Guarda em silêncio os dias seguintes, para a app servir offline. */
function preCarregarDiasSeguintes(desde) {
  for (let i = 1; i <= 3; i++) {
    const d = new Date(desde);
    d.setDate(d.getDate() + i);
    if (leituraCompleta(lido("od_leit_" + yyyymmdd(d), null))) continue;
    obterXml(d);
  }
}

function renderLeituras(data, santo, titLit, seccoes) {
  const cont = $("leiturasConteudo");
  let html = "";

  if (titLit || santo) {
    html += `<div class="card">`;
    if (santo) html += `<div class="saint-badge">✨ ${escapeHtml(santo)}</div>`;
    if (titLit) html += `<h2 style="margin-top:8px">${escapeHtml(titLit)}</h2>`;
    html += `</div>`;
  }

  if (!seccoes.length) {
    html += `<div class="status">Não há leituras disponíveis para este dia.</div>`;
  }

  seccoes.forEach((s, i) => {
    html += `<div class="card">
      <div class="card-head">
        <div class="h-txt">
          <div class="eyebrow">${escapeHtml(s.eyebrow)}</div>
          ${s.ref ? `<div class="reading-ref">${escapeHtml(s.ref)}</div>` : ""}
        </div>
        <button class="speak-btn" data-sec="${i}" data-label="🔊 Ler">🔊 Ler</button>
      </div>
      <div class="reading">${escapeHtml(s.texto)}</div>
    </div>`;
  });

  cont.innerHTML = html;
  cont._seccoes = seccoes;
  cont._santo = santo;
  cont._data = data;

  cont.querySelectorAll(".speak-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      Locutor.armar();
      if (btn.classList.contains("speaking")) { Locutor.parar(); return; }
      desligarVozGuiada();
      const s = seccoes[+btn.dataset.sec];
      Locutor.ler([{ label: s.eyebrow, sub: s.ref || dataCurta(data),
        texto: s.texto, src: Locutor.gravacaoDaLeitura(data, s.chave), btn }]);
    });
  });
}

function lerTodasLeituras() {
  Locutor.armar();
  const cont = $("leiturasConteudo");
  const seccoes = cont._seccoes || [];
  if (!seccoes.length) return;
  desligarVozGuiada();
  const data = cont._data;
  const lista = [];
  if (cont._santo) lista.push({ label: "Santo do dia", sub: dataCurta(data), texto: cont._santo });
  seccoes.forEach(s => lista.push({
    label: s.eyebrow, sub: s.ref || dataCurta(data), texto: s.texto,
    src: Locutor.gravacaoDaLeitura(data, s.chave)
  }));
  Locutor.ler(lista);
}

function atualizarNavData() {
  const maxFuturo = new Date(state.hoje); maxFuturo.setDate(maxFuturo.getDate() + 30);
  $("diaSeguinte").disabled = state.dataLeitura >= maxFuturo;
}
function mudarDia(delta) {
  const nova = new Date(state.dataLeitura); nova.setDate(nova.getDate() + delta);
  const maxFuturo = new Date(state.hoje); maxFuturo.setDate(maxFuturo.getDate() + 30);
  if (nova > maxFuturo) return;
  state.dataLeitura = meiaNoite(nova);
  carregarLeituras();
}

/* =========================================================================
   TERÇO
   ========================================================================= */
function preencherSetupTerco() {
  const opts = $("misteriosOpts");
  const chaveHoje = misteriosDoDia(state.hoje.getDay());
  if (!state.misterioSel) state.misterioSel = chaveHoje;

  const ordem = ["gozosos", "dolorosos", "gloriosos", "luminosos"];
  opts.innerHTML = ordem.map(k => {
    const m = MISTERIOS[k];
    const sel = k === state.misterioSel ? " sel" : "";
    const badge = k === chaveHoje ? `<span class="m-badge">Hoje</span>` : "";
    return `<button class="mist-opt${sel}" data-key="${k}">
      <span class="dot" style="background:${m.cor}"></span>
      <span class="m-txt"><span class="m-name">${m.nome}</span>
      <span class="m-days">${m.diasTexto}</span></span>
      ${badge}
    </button>`;
  }).join("");

  opts.querySelectorAll(".mist-opt").forEach(b => {
    b.addEventListener("click", () => {
      state.misterioSel = b.dataset.key;
      opts.querySelectorAll(".mist-opt").forEach(x => x.classList.remove("sel"));
      b.classList.add("sel");
    });
  });

  const intc = INTENCOES_PAPA.intencaoDoMes(state.hoje);
  $("setupIntencao").textContent = intc.geral ? "" : ": " + intc.tema.toLowerCase();
}

/* A ladainha é própria dos meses marianos — maio e outubro. */
function incluirLadainha() {
  const modo = state.settings.ladainha;
  if (modo === "sempre") return true;
  if (modo === "nunca") return false;
  const mes = state.hoje.getMonth();      // 4 = maio, 9 = outubro
  return mes === 4 || mes === 9;
}

function construirPassos(chave) {
  const m = MISTERIOS[chave];
  const intc = INTENCOES_PAPA.intencaoDoMes(state.hoje);
  const P = [];
  const add = (fase, kind, title, body, opts) =>
    P.push(Object.assign({ fase, kind, title, body, speak: body }, opts || {}));
  const daOracao = (fase, kind, o, extra) =>
    add(fase, kind, o.titulo, o.texto, Object.assign({ audioId: o.id }, extra || {}));

  /* ---- Introdução ---- */
  daOracao("Introdução", "Início", ORACOES.sinalDaCruz);
  daOracao("Introdução", "Oferecimento", ORACOES.oferecimento);
  add("Introdução", "Intenção do Papa", intc.tema,
    intc.geral ? intc.texto : intc.texto + "\n\n— " + INTENCOES_PAPA.papa + ", " +
      MESES[state.hoje.getMonth()] + " de " + state.hoje.getFullYear(),
    { audioId: intc.id, speak: intc.texto });
  daOracao("Introdução", "Profissão de fé", ORACOES.credo);
  daOracao("Introdução", "Oração", ORACOES.paiNosso);
  ORACOES.aveMariasIntroducao.forEach(a => daOracao("Introdução", "Avé-Maria", a));
  daOracao("Introdução", "Doxologia", ORACOES.gloria);

  /* ---- Cinco dezenas ---- */
  m.lista.forEach((mist, i) => {
    add(m.nome, `${i + 1}.º Mistério`, mist.titulo, mist.meditacao,
      { medit: true, audioId: mist.id, speak: mist.titulo + ". " + mist.meditacao });
    daOracao(m.nome, "Oração", ORACOES.paiNosso);
    for (let n = 1; n <= 10; n++) {
      add(m.nome, "Avé-Maria", `Avé-Maria · ${n} de 10`, ORACOES.aveMaria.texto,
        { audioId: ORACOES.aveMaria.id, beads: { total: 10, index: n } });
    }
    daOracao(m.nome, "Doxologia", ORACOES.gloria);
    daOracao(m.nome, "Oração de Fátima", ORACOES.oMeuJesus);
    if (state.settings.jaculatoria) daOracao(m.nome, "Jaculatória", ORACOES.oMariaConcebida);
  });

  /* ---- Conclusão ---- */
  daOracao("Conclusão", "Conclusão", ORACOES.salveRainha);
  if (state.settings.oracoesFinais) daOracao("Conclusão", "Versículo", ORACOES.versiculoFinal);
  if (incluirLadainha()) daOracao("Conclusão", "Ladainha", ORACOES.ladainha, { ladainha: true });
  if (state.settings.oracoesFinais) daOracao("Conclusão", "Oração", ORACOES.oracaoFinal);
  if (state.settings.oracoesPapa) {
    daOracao("Conclusão", "Oração", ORACOES.sobVossaProteccao);
    daOracao("Conclusão", "Oração", ORACOES.saoMiguel);
  }
  daOracao("Conclusão", "Conclusão", ORACOES.sinalDaCruz);
  daOracao("Fim", "Terço concluído", ORACOES.conclusao);
  return P;
}

function iniciarTerco() {
  Locutor.armar();
  state.passos = construirPassos(state.misterioSel);
  state.passoIdx = 0;
  $("tercoSetup").style.display = "none";
  $("tercoRunner").classList.add("active");
  const intc = INTENCOES_PAPA.intencaoDoMes(state.hoje);
  $("runnerIntencao").innerHTML = `📿 <b>${MISTERIOS[state.misterioSel].nome}</b> · ` + (intc.geral
    ? "pelas intenções do Santo Padre"
    : `pela intenção do Papa: <b>${escapeHtml(intc.tema.toLowerCase())}</b>`);
  renderPasso();
}

function sairTerco() {
  cancelarAvanco();
  Locutor.parar();
  state.vozGuiada = false;
  atualizarChipVoz();
  $("tercoRunner").classList.remove("active");
  $("tercoSetup").style.display = "block";
  verificarMudancaDeDia();   // adiada enquanto o terço estava aberto
}

/* Outra leitura vai ocupar o locutor: a voz guiada do terço desliga-se, e o
   chip diz a verdade em vez de continuar «ligada» sem nada a falar. */
function desligarVozGuiada() {
  if (!state.vozGuiada) return;
  cancelarAvanco();
  state.vozGuiada = false;
  atualizarChipVoz();
}

function renderPasso() {
  cancelarAvanco();
  const p = state.passos[state.passoIdx];
  const total = state.passos.length;
  $("stepKind").textContent = p.kind;
  $("stepTitle").textContent = p.title;
  $("stepBody").textContent = p.body;
  $("stepBody").classList.toggle("medit", !!p.medit);
  $("stepBody").classList.toggle("ladainha", !!p.ladainha);

  const beadsEl = $("stepBeads");
  if (p.beads) {
    beadsEl.classList.remove("hidden");
    let h = "";
    for (let j = 1; j <= p.beads.total; j++) {
      const cls = j < p.beads.index ? "done" : (j === p.beads.index ? "current" : "");
      h += `<span class="bead ${cls}"></span>`;
    }
    beadsEl.innerHTML = h;
  } else beadsEl.classList.add("hidden");

  $("tercoProg").style.width = ((state.passoIdx + 1) / total * 100) + "%";
  $("tercoFase").textContent = p.fase;
  $("tercoContagem").textContent = `${state.passoIdx + 1} / ${total}`;
  $("stepPrev").disabled = state.passoIdx === 0;
  $("stepNext").textContent = state.passoIdx >= total - 1 ? "Concluir" : "Seguinte ›";

  if (state.vozGuiada) lerPassoAtual();
}

/* O avanço automático espera 600 ms depois de cada oração. Se nesse intervalo
   o utilizador tocar em Seguinte ou Anterior, o avanço pendente tem de morrer,
   senão salta-se uma Avé-Maria ou desfaz-se o «Anterior». */
let timerAvanco = null;
function cancelarAvanco() {
  if (timerAvanco) { clearTimeout(timerAvanco); timerAvanco = null; }
}

function lerPassoAtual() {
  const idx = state.passoIdx;
  const p = state.passos[idx];
  Locutor.ler(
    [{ label: p.title, sub: p.fase, texto: p.speak, id: p.audioId }],
    () => {
      if (state.vozGuiada && state.settings.autoAvancar && idx < state.passos.length - 1) {
        cancelarAvanco();
        timerAvanco = setTimeout(() => {
          timerAvanco = null;
          // Se entretanto outra leitura ocupou o locutor, não se lhe passa por cima.
          if (state.vozGuiada && state.passoIdx === idx && !Locutor.aFalar) { state.passoIdx++; renderPasso(); }
        }, 600);
      }
    }
  );
}

function passoSeguinte() {
  if (state.passoIdx >= state.passos.length - 1) { sairTerco(); return; }
  state.passoIdx++;
  renderPasso();
}
function passoAnterior() {
  if (state.passoIdx === 0) return;
  state.passoIdx--;
  renderPasso();
}
function alternarVozGuiada() {
  Locutor.armar();
  state.vozGuiada = !state.vozGuiada;
  atualizarChipVoz();
  if (state.vozGuiada) lerPassoAtual();
  else { cancelarAvanco(); Locutor.parar(); }
}
function atualizarChipVoz() {
  const c = $("chipVoz");
  c.classList.toggle("on", state.vozGuiada);
  c.textContent = state.vozGuiada ? "🔊 Voz guiada: ligada" : "🔊 Voz guiada: desligada";
}

/* =========================================================================
   DEFINIÇÕES
   ========================================================================= */
function preencherSelectVozes() {
  const sel = $("vozSelect");
  if (!sel) return;
  if (!Locutor.vozes.length) { sel.innerHTML = `<option>Sem vozes disponíveis</option>`; return; }

  const ptPT = Locutor.vozes.filter(v => Locutor.ePortugalPT(v));
  const ptOutras = Locutor.vozes.filter(v => Locutor.ePortugues(v) && !Locutor.ePortugalPT(v));
  const outras = Locutor.vozes.filter(v => !Locutor.ePortugues(v));
  const compacta = v => /compact/i.test(v.voiceURI || "");
  const ordenar = arr => arr.slice().sort((a, b) => (compacta(a) ? 1 : 0) - (compacta(b) ? 1 : 0));

  const opt = v => `<option value="${escapeAttr(v.voiceURI)}"${
    Locutor.voz && v.voiceURI === Locutor.voz.voiceURI ? " selected" : ""
  }>${escapeHtml(v.name)}${compacta(v) ? "" : " ⭐"}</option>`;

  let html = "";
  if (ptPT.length) html += `<optgroup label="Português de Portugal">${ordenar(ptPT).map(opt).join("")}</optgroup>`;
  if (ptOutras.length) html += `<optgroup label="Português do Brasil e outros">${ordenar(ptOutras).map(opt).join("")}</optgroup>`;
  if (outras.length) html += `<optgroup label="Outras línguas">${ordenar(outras).map(opt).join("")}</optgroup>`;
  sel.innerHTML = html;
}

function atualizarAvisoVoz() {
  const aviso = $("avisoVoz");
  if (!aviso) return;
  const v = Locutor.voz;
  if (!v) {
    aviso.className = "aviso mau";
    aviso.innerHTML = "Não há vozes de leitura disponíveis neste dispositivo.";
    return;
  }
  const lang = Locutor._lang(v);
  if (Locutor.ePortugalPT(v)) {
    aviso.className = "aviso bom";
    aviso.innerHTML = `Voz do sistema em uso: <b>${escapeHtml(v.name)}</b> (${escapeHtml(lang)}) — de Portugal.`;
  } else {
    aviso.className = "aviso mau";
    aviso.innerHTML = `A voz do sistema em uso é <b>${escapeHtml(v.name)}</b> (${escapeHtml(lang)}), que <b>não é de Portugal</b>.
      Para ter voz portuguesa: Definições do iPhone → Acessibilidade → Conteúdo falado → Vozes → Português (Portugal).`;
  }
}

function idsDeAudioDoTerco() {
  const ids = new Set();
  Object.values(ORACOES).forEach(o => {
    if (Array.isArray(o)) o.forEach(x => x.id && ids.add(x.id));
    else if (o && o.id) ids.add(o.id);
  });
  Object.values(MISTERIOS).forEach(m => m.lista.forEach(x => ids.add(x.id)));
  INTENCOES_PAPA.meses.forEach(x => ids.add(x.id));
  ids.add(INTENCOES_PAPA.geral.id);
  return [...ids].filter(id => Locutor.disponiveis.has(id));
}

function atualizarEstadoAudio(progresso) {
  const el = $("estadoAudio");
  if (!el) return;
  const total = Locutor.disponiveis.size;
  if (!total) {
    el.className = "aviso mau";
    el.textContent = "As orações gravadas não foram encontradas. A app usa a voz do telemóvel.";
    $("btnDescarregarAudio").style.display = "none";
    return;
  }
  if (progresso) {
    const { feitos, falhas, total: t } = progresso;
    if (progresso.erro) {
      el.className = "aviso mau";
      el.textContent = progresso.erro;
    } else if (feitos + falhas >= t) {
      el.className = "aviso bom";
      el.textContent = falhas
        ? `${feitos} de ${t} orações guardadas (${falhas} falharam). Tente de novo com melhor ligação.`
        : progresso.semOffline
          ? `As ${feitos} orações foram transferidas, mas este navegador não permite garantir que funcionem sem internet.`
          : `As ${feitos} orações estão guardadas no telemóvel e funcionam sem internet.`;
    } else {
      el.className = "aviso";
      el.textContent = `A guardar orações… ${feitos + falhas} de ${t}.`;
    }
    return;
  }
  el.className = "aviso bom";
  el.textContent = `${total} orações gravadas com voz portuguesa disponíveis.`;
  $("btnDescarregarAudio").style.display = "";
}

function descarregarAudio() {
  const ids = idsDeAudioDoTerco();
  if (!ids.length) return;
  // Resolver contra o documento, e não cortar o último segmento do endereço:
  // num endereço sem barra final (…/oracao-diaria) o corte dava caminhos errados.
  const urls = ids.map(id => new URL(Locutor.srcGravacao(id), location.href).href);
  const total = urls.length;

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    // Só o service worker guarda para uso offline. Logo a seguir à instalação a
    // página ainda pode não estar sob o seu controlo, por isso fala-se com o
    // service worker ativo e não com o «controller».
    atualizarEstadoAudio({ feitos: 0, falhas: 0, total });
    const espera = new Promise(res => setTimeout(() => res(null), 15000));
    Promise.race([navigator.serviceWorker.ready, espera]).then(reg => {
      if (reg && reg.active) reg.active.postMessage({ tipo: "precarregar-audio", urls });
      else atualizarEstadoAudio({ feitos: 0, falhas: 0, total,
        erro: "O modo offline ainda não está pronto. Tente de novo daqui a um minuto, com internet." });
    });
    return;
  }

  // Sem service worker, o browser só guarda na sua própria cache, que pode
  // apagar quando quiser — transfere-se, mas sem prometer o uso offline.
  // Um 404 também resolve o fetch, por isso conta como falha; e os erros de
  // rede têm de contar, senão o contador nunca chega ao fim.
  let feitos = 0, falhas = 0;
  const avisar = () => atualizarEstadoAudio({ feitos, falhas, total, semOffline: true });
  urls.forEach(u => fetch(u)
    .then(r => { if (r.ok) feitos++; else falhas++; }, () => { falhas++; })
    .then(avisar));
}

/* =========================================================================
   Helpers
   ========================================================================= */
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

/* =========================================================================
   MUDANÇA DE DIA
   No iPhone a app instalada fica dias suspensa em segundo plano sem recarregar.
   Ao voltar, se o dia mudou, atualiza-se tudo o que depende de «hoje» — mas
   nunca a meio de um terço ou de uma leitura em voz alta.
   ========================================================================= */
function verificarMudancaDeDia() {
  if (document.visibilityState === "hidden") return;
  const agora = meiaNoite(new Date());
  if (yyyymmdd(agora) === yyyymmdd(state.hoje)) return;
  if (Locutor.aFalar || $("tercoRunner").classList.contains("active")) return;

  const viaHoje = yyyymmdd(state.dataLeitura) === yyyymmdd(state.hoje);
  state.hoje = agora;
  if (viaHoje) state.dataLeitura = agora;
  state.misterioSel = null;          // volta a sugerir os mistérios do dia
  preencherInicio();
  preencherSetupTerco();
  Locutor.carregarIndiceAudio();
  limparLeiturasGuardadas(7);
  leiturasCarregadas = false;
  if ($("view-leituras").classList.contains("active")) carregarLeituras();
}

/* =========================================================================
   ARRANQUE
   ========================================================================= */
let arrancou = false;

function init() {
  if (arrancou) return;
  arrancou = true;

  limparLeiturasGuardadas(7);
  Locutor.iniciar();
  preencherInicio();
  preencherSetupTerco();
  document.addEventListener("visibilitychange", verificarMudancaDeDia);
  window.addEventListener("pageshow", verificarMudancaDeDia);

  /* Definições — voz */
  $("vozRate").value = state.settings.rate;
  $("rateVal").textContent = state.settings.rate.toFixed(2) + "×";
  $("vozPitch").value = state.settings.pitch;
  $("pitchVal").textContent = state.settings.pitch.toFixed(2);
  $("autoAvancar").checked = state.settings.autoAvancar;
  $("vozGravada").checked = state.settings.vozGravada;

  /* Definições — terço */
  $("optJaculatoria").checked = state.settings.jaculatoria;
  $("optFinais").checked = state.settings.oracoesFinais;
  $("optPapa").checked = state.settings.oracoesPapa;
  $("optLadainha").value = state.settings.ladainha;

  if (!Locutor.suportaVoz()) {
    $("vozSelect").innerHTML = `<option>Não suportado neste navegador</option>`;
  }

  /* Navegação */
  document.querySelectorAll(".tabbar .tab").forEach(t =>
    t.addEventListener("click", () => mostrarVista(t.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach(b =>
    b.addEventListener("click", () => mostrarVista(b.dataset.goto)));
  $("btnSettings").addEventListener("click", () => mostrarVista("definicoes"));

  /* Leituras */
  $("diaAnterior").addEventListener("click", () => mudarDia(-1));
  $("diaSeguinte").addEventListener("click", () => mudarDia(1));
  $("lerTudo").addEventListener("click", lerTodasLeituras);

  /* Terço */
  $("iniciarTerco").addEventListener("click", iniciarTerco);
  $("btnSairTerco").addEventListener("click", sairTerco);
  $("chipVoz").addEventListener("click", alternarVozGuiada);
  $("stepNext").addEventListener("click", passoSeguinte);
  $("stepPrev").addEventListener("click", passoAnterior);

  /* Barra de leitura */
  $("vbToggle").addEventListener("click", () => Locutor.alternar());
  $("vbStop").addEventListener("click", () => Locutor.parar());

  /* Controlos das definições */
  $("vozSelect").addEventListener("change", e => Locutor.definirVoz(e.target.value));
  $("vozRate").addEventListener("input", e => {
    const r = parseFloat(e.target.value);
    $("rateVal").textContent = r.toFixed(2) + "×";
    state.settings.rate = r;
    guardar("od_rate", String(r));
  });
  $("vozPitch").addEventListener("input", e => {
    const p = parseFloat(e.target.value);
    $("pitchVal").textContent = p.toFixed(2);
    state.settings.pitch = p;
    guardar("od_pitch", String(p));
  });
  $("autoAvancar").addEventListener("change", e => {
    state.settings.autoAvancar = e.target.checked;
    guardar("od_auto", e.target.checked ? "1" : "0");
  });
  $("vozGravada").addEventListener("change", e => {
    state.settings.vozGravada = e.target.checked;
    guardar("od_gravada", e.target.checked ? "1" : "0");
  });
  $("optJaculatoria").addEventListener("change", e => {
    state.settings.jaculatoria = e.target.checked;
    guardar("od_jaculatoria", e.target.checked ? "1" : "0");
  });
  $("optFinais").addEventListener("change", e => {
    state.settings.oracoesFinais = e.target.checked;
    guardar("od_finais", e.target.checked ? "1" : "0");
  });
  $("optPapa").addEventListener("change", e => {
    state.settings.oracoesPapa = e.target.checked;
    guardar("od_papa", e.target.checked ? "1" : "0");
  });
  $("optLadainha").addEventListener("change", e => {
    state.settings.ladainha = e.target.value;
    guardar("od_ladainha", e.target.value);
  });
  $("btnDescarregarAudio").addEventListener("click", descarregarAudio);
  $("testarVoz").addEventListener("click", () => {
    Locutor.armar();
    desligarVozGuiada();
    Locutor.ler([{ label: "Avé-Maria", sub: "Teste de voz",
      texto: ORACOES.aveMaria.texto, id: ORACOES.aveMaria.id }]);
  });

  $("appVersao").textContent = APP_VERSION;

  /* Service worker */
  const nota = $("offlineNote");
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    // O register() resolve antes de a instalação acabar; só o «ready» garante
    // que há um service worker ativo, com a app guardada.
    navigator.serviceWorker.register("sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => { nota.textContent = "✓ Preparada para funcionar sem internet."; })
      .catch(() => { nota.textContent = "Não foi possível preparar o modo offline."; });
    navigator.serviceWorker.addEventListener("message", e => {
      if (e.data && e.data.tipo === "progresso-audio") atualizarEstadoAudio(e.data);
    });
  } else if (location.protocol === "file:") {
    nota.textContent = "Para instalar no telemóvel e funcionar offline, abra a partir de um endereço https.";
  }
}

document.addEventListener("DOMContentLoaded", init);
if (document.readyState !== "loading") init();
