/* =========================================================================
   Oração Diária — Conteúdos (orações, mistérios do terço, intenções do Papa)
   Português europeu, conforme o uso em Portugal. Referência dos textos das
   orações: santidade.net; das intenções do Papa: Rede Mundial de Oração do
   Papa (versão portuguesa). Todo o conteúdo aqui funciona sem internet.

   O campo "id" de cada oração é também o nome do ficheiro de áudio em
   audio/<id>.mp3, gravado com voz neural portuguesa. Ao alterar um texto,
   é preciso regravar o áudio correspondente (ver ferramentas/gerar_audio.py).
   ========================================================================= */

const APP_VERSION = "3.2.0";

/* ---------- Orações do terço ---------- */
const ORACOES = {
  sinalDaCruz: {
    id: "sinal-da-cruz",
    titulo: "Sinal da Cruz",
    texto: "Em nome do Pai, e do Filho, e do Espírito Santo. Ámen."
  },

  oferecimento: {
    id: "oferecimento",
    titulo: "Oferecimento do Terço",
    texto: "Divino Jesus, nós Vos oferecemos este terço que vamos rezar, " +
      "meditando nos mistérios da Vossa Redenção. Concedei-nos, por intercessão " +
      "da Virgem Maria, Mãe de Deus e nossa Mãe, as virtudes que nos são necessárias " +
      "e a graça de o rezarmos bem."
  },

  credo: {
    id: "credo",
    titulo: "Credo (Símbolo Niceno-Constantinopolitano)",
    texto: "Creio em um só Deus, Pai todo-poderoso Criador do Céu e da Terra, " +
      "de todas as coisas visíveis e invisíveis. Creio em um só Senhor, Jesus Cristo, " +
      "Filho Unigénito de Deus, nascido do Pai antes de todos os séculos: Deus de Deus, " +
      "luz da luz, Deus verdadeiro de Deus verdadeiro; gerado, não criado, " +
      "consubstancial ao Pai. Por Ele todas as coisas foram feitas. " +
      "E por nós homens e para nossa salvação desceu dos Céus. " +
      "E encarnou pelo Espírito Santo, no seio da Virgem Maria, e se fez homem. " +
      "Também por nós foi crucificado sob Pôncio Pilatos; padeceu e foi sepultado. " +
      "Ressuscitou ao terceiro dia, conforme as Escrituras; e subiu aos Céus, " +
      "onde está sentado à direita do Pai. De novo há-de vir em sua glória " +
      "para julgar os vivos e os mortos; e o seu Reino não terá fim. " +
      "Creio no Espírito Santo, Senhor que dá a vida, e procede do Pai e do Filho; " +
      "e com o Pai e o Filho é adorado e glorificado: Ele que falou pelos profetas. " +
      "Creio na Igreja una, santa, católica e apostólica. " +
      "Professo um só Baptismo para a remissão dos pecados. " +
      "E espero a ressurreição dos mortos e a vida do mundo que há-de vir. Ámen."
  },

  paiNosso: {
    id: "pai-nosso",
    titulo: "Pai-Nosso",
    texto: "Pai Nosso, que estais nos Céus, santificado seja o Vosso Nome, " +
      "venha a nós o Vosso Reino, seja feita a Vossa vontade, assim na Terra como no Céu. " +
      "O pão nosso de cada dia nos dai hoje, perdoai-nos as nossas ofensas, " +
      "assim como nós perdoamos a quem nos tem ofendido, e não nos deixeis cair " +
      "em tentação, mas livrai-nos do mal. Ámen."
  },

  aveMaria: {
    id: "ave-maria",
    titulo: "Avé-Maria",
    texto: "Avé-Maria, cheia de graça, o Senhor é convosco, bendita sois Vós " +
      "entre as mulheres e bendito é o fruto do Vosso ventre, Jesus. " +
      "Santa Maria, Mãe de Deus, rogai por nós, pecadores, agora e na hora " +
      "da nossa morte. Ámen."
  },

  gloria: {
    id: "gloria",
    titulo: "Glória ao Pai",
    texto: "Glória ao Pai e ao Filho e ao Espírito Santo. " +
      "Como era no princípio, agora e sempre. Ámen."
  },

  oMeuJesus: {
    id: "o-meu-jesus",
    titulo: "Ó meu Jesus (Oração de Fátima)",
    texto: "Ó meu Jesus, perdoai-nos, livrai-nos do fogo do inferno; " +
      "levai as almas todas para o Céu, principalmente as que mais precisarem."
  },

  oMariaConcebida: {
    id: "o-maria-concebida",
    titulo: "Ó Maria concebida sem pecado",
    texto: "Ó Maria concebida sem pecado, rogai por nós que recorremos a Vós."
  },

  aveMariasIntroducao: [
    {
      id: "ave-maria-fe",
      titulo: "1.ª Avé-Maria — pela Fé",
      texto: "Pela virtude da Fé.\n\nAvé-Maria, cheia de graça, o Senhor é convosco, " +
        "bendita sois Vós entre as mulheres e bendito é o fruto do Vosso ventre, Jesus. " +
        "Santa Maria, Mãe de Deus, rogai por nós, pecadores, agora e na hora da nossa morte. Ámen."
    },
    {
      id: "ave-maria-esperanca",
      titulo: "2.ª Avé-Maria — pela Esperança",
      texto: "Pela virtude da Esperança.\n\nAvé-Maria, cheia de graça, o Senhor é convosco, " +
        "bendita sois Vós entre as mulheres e bendito é o fruto do Vosso ventre, Jesus. " +
        "Santa Maria, Mãe de Deus, rogai por nós, pecadores, agora e na hora da nossa morte. Ámen."
    },
    {
      id: "ave-maria-caridade",
      titulo: "3.ª Avé-Maria — pela Caridade",
      texto: "Pela virtude da Caridade.\n\nAvé-Maria, cheia de graça, o Senhor é convosco, " +
        "bendita sois Vós entre as mulheres e bendito é o fruto do Vosso ventre, Jesus. " +
        "Santa Maria, Mãe de Deus, rogai por nós, pecadores, agora e na hora da nossa morte. Ámen."
    }
  ],

  salveRainha: {
    id: "salve-rainha",
    titulo: "Salve-Rainha",
    texto: "Salvé, Rainha, mãe de misericórdia, vida, doçura e esperança nossa, salve! " +
      "A Vós bradamos, os degredados filhos de Eva. A Vós suspiramos, gemendo e chorando " +
      "neste vale de lágrimas. Eia, pois, advogada nossa, esses Vossos olhos misericordiosos " +
      "a nós volvei. E, depois deste desterro, nos mostrai Jesus, bendito fruto do Vosso ventre. " +
      "Ó clemente, ó piedosa, ó doce Virgem Maria."
  },

  versiculoFinal: {
    id: "versiculo-final",
    titulo: "Rogai por nós, Santa Mãe de Deus",
    texto: "Rogai por nós, Santa Mãe de Deus.\n\nPara que sejamos dignos das promessas de Cristo."
  },

  oracaoFinal: {
    id: "oracao-final",
    titulo: "Oração final do Rosário",
    texto: "Oremos: Infundi, Senhor, a vossa graça, em nossas almas, para que nós, " +
      "que, pela anunciação do Anjo, conhecemos a encarnação de Cristo, vosso Filho, " +
      "pela sua paixão e morte na cruz, sejamos conduzidos à glória da Ressurreição. " +
      "Pelo mesmo Cristo Senhor nosso. Ámen."
  },

  sobVossaProteccao: {
    id: "sob-vossa-proteccao",
    titulo: "Sob vossa protecção",
    texto: "À Vossa protecção recorremos, Santa Mãe de Deus; " +
      "não desprezeis as nossas súplicas em nossas necessidades; " +
      "mas livrai-nos de todos os perigos, ó Virgem gloriosa e bendita."
  },

  saoMiguel: {
    id: "sao-miguel",
    titulo: "Oração a São Miguel Arcanjo",
    texto: "São Miguel Arcanjo, defendei-nos neste combate, sede o nosso auxílio " +
      "contra as maldades e as ciladas do demónio. Instante e humildemente vos pedimos " +
      "que Deus sobre ele impere. E vós, Príncipe da Milícia Celeste, com esse poder divino, " +
      "precipitai no inferno a satanás e aos outros espíritos malignos que vagueiam " +
      "pelo mundo para perdição das almas. Ámen."
  },

  /* Ladainha Lauretana, sem as três invocações acrescentadas em 2020
     (Mãe da misericórdia, Mãe da esperança, Amparo dos migrantes). */
  ladainha: {
    id: "ladainha",
    titulo: "Ladainha de Nossa Senhora",
    texto: [
      "Senhor, tende piedade de nós.",
      "Cristo, tende piedade de nós.",
      "Senhor, tende piedade de nós.",
      "Cristo, ouvi-nos.",
      "Cristo, atendei-nos.",
      "Deus Pai do Céu, tende piedade de nós.",
      "Deus Filho, Redentor do mundo, tende piedade de nós.",
      "Deus Espírito Santo, tende piedade de nós.",
      "Santíssima Trindade, que sois um só Deus, tende piedade de nós.",
      "",
      "Santa Maria, rogai por nós.",
      "Santa Mãe de Deus, rogai por nós.",
      "Santa Virgem das virgens, rogai por nós.",
      "Mãe de Cristo, rogai por nós.",
      "Mãe da Igreja, rogai por nós.",
      "Mãe da divina graça, rogai por nós.",
      "Mãe puríssima, rogai por nós.",
      "Mãe castíssima, rogai por nós.",
      "Mãe sempre virgem, rogai por nós.",
      "Mãe imaculada, rogai por nós.",
      "Mãe amável, rogai por nós.",
      "Mãe admirável, rogai por nós.",
      "Mãe do bom conselho, rogai por nós.",
      "Mãe do Criador, rogai por nós.",
      "Mãe do Salvador, rogai por nós.",
      "",
      "Virgem prudentíssima, rogai por nós.",
      "Virgem digna de veneração, rogai por nós.",
      "Virgem digna de louvor, rogai por nós.",
      "Virgem poderosa, rogai por nós.",
      "Virgem clemente, rogai por nós.",
      "Virgem fiel, rogai por nós.",
      "",
      "Espelho de justiça, rogai por nós.",
      "Trono da sabedoria, rogai por nós.",
      "Causa da nossa alegria, rogai por nós.",
      "Vaso espiritual, rogai por nós.",
      "Vaso digno de honra, rogai por nós.",
      "Vaso insigne de devoção, rogai por nós.",
      "Rosa mística, rogai por nós.",
      "Torre de David, rogai por nós.",
      "Torre de marfim, rogai por nós.",
      "Casa de ouro, rogai por nós.",
      "Arca da aliança, rogai por nós.",
      "Porta do Céu, rogai por nós.",
      "Estrela da manhã, rogai por nós.",
      "",
      "Saúde dos enfermos, rogai por nós.",
      "Refúgio dos pecadores, rogai por nós.",
      "Consoladora dos aflitos, rogai por nós.",
      "Auxílio dos cristãos, rogai por nós.",
      "",
      "Rainha dos Anjos, rogai por nós.",
      "Rainha dos Patriarcas, rogai por nós.",
      "Rainha dos Profetas, rogai por nós.",
      "Rainha dos Apóstolos, rogai por nós.",
      "Rainha dos Mártires, rogai por nós.",
      "Rainha dos Confessores da Fé, rogai por nós.",
      "Rainha das Virgens, rogai por nós.",
      "Rainha de todos os Santos, rogai por nós.",
      "Rainha concebida sem pecado original, rogai por nós.",
      "Rainha elevada ao Céu, rogai por nós.",
      "Rainha do Santíssimo Rosário, rogai por nós.",
      "Rainha da família, rogai por nós.",
      "Rainha da paz, rogai por nós.",
      "",
      "Cordeiro de Deus, que tirais o pecado do mundo, perdoai-nos, Senhor.",
      "Cordeiro de Deus, que tirais o pecado do mundo, ouvi-nos, Senhor.",
      "Cordeiro de Deus, que tirais o pecado do mundo, tende piedade de nós."
    ].join("\n")
  },

  conclusao: {
    id: "conclusao",
    titulo: "Terço concluído",
    texto: "Que a Virgem Maria interceda por si e pelas intenções do Santo Padre.\n\n" +
      "Louvado seja Nosso Senhor Jesus Cristo."
  }
};

/* ---------- Mistérios do terço ----------
   Distribuição semanal em vigor (Rosarium Virginis Mariae, 2002), conforme
   o Santuário de Fátima:
     Segunda(1) e Sábado(6): Gozosos
     Terça(2) e Sexta(5):    Dolorosos
     Quarta(3) e Domingo(0): Gloriosos
     Quinta(4):              Luminosos
   (getDay(): 0=Domingo ... 6=Sábado)
------------------------------------------------ */
const MISTERIOS = {
  gozosos: {
    nome: "Mistérios Gozosos",
    dias: [1, 6],
    diasTexto: "Segunda-feira e Sábado",
    cor: "#3f6f4e",
    lista: [
      { id: "gozoso-1",
        titulo: "1.º Mistério Gozoso — A Anunciação do Anjo a Nossa Senhora",
        meditacao: "O Anjo anuncia a Maria que será Mãe do Filho de Deus, e ela responde: «Eis a serva do Senhor.» Peçamos a humildade e a disponibilidade de Maria." },
      { id: "gozoso-2",
        titulo: "2.º Mistério Gozoso — A Visitação de Nossa Senhora a Santa Isabel",
        meditacao: "Maria parte apressadamente para servir a sua prima Isabel. Peçamos um coração atento, pronto a servir quem precisa de nós." },
      { id: "gozoso-3",
        titulo: "3.º Mistério Gozoso — O Nascimento de Jesus em Belém",
        meditacao: "O Filho de Deus nasce pobre, numa manjedoura. Peçamos a simplicidade de coração e a alegria de acolher Jesus." },
      { id: "gozoso-4",
        titulo: "4.º Mistério Gozoso — A Apresentação do Menino Jesus no Templo",
        meditacao: "Maria e José oferecem o Menino ao Senhor, e Simeão reconhece n'Ele a luz das nações. Peçamos a graça de nos entregarmos inteiramente a Deus." },
      { id: "gozoso-5",
        titulo: "5.º Mistério Gozoso — A Perda e o Encontro do Menino Jesus no Templo",
        meditacao: "Depois de três dias de angústia, Maria e José encontram Jesus no Templo. Peçamos a graça de O procurar sempre, mesmo quando parece ausente." }
    ]
  },
  dolorosos: {
    nome: "Mistérios Dolorosos",
    dias: [2, 5],
    diasTexto: "Terça-feira e Sexta-feira",
    cor: "#7a3b3b",
    lista: [
      { id: "doloroso-1",
        titulo: "1.º Mistério Doloroso — A Agonia de Jesus no Horto",
        meditacao: "No Getsémani, Jesus reza: «Não se faça a minha vontade, mas a Vossa.» Peçamos força para aceitar a vontade de Deus nas horas de provação." },
      { id: "doloroso-2",
        titulo: "2.º Mistério Doloroso — A Flagelação de Jesus",
        meditacao: "Jesus é açoitado por nossa causa, em silêncio. Peçamos a pureza de coração e a coragem de renunciar ao que nos afasta de Deus." },
      { id: "doloroso-3",
        titulo: "3.º Mistério Doloroso — A Coroação de Espinhos",
        meditacao: "Coroam Jesus de espinhos e escarnecem d'Ele. Peçamos humildade e paciência diante das humilhações." },
      { id: "doloroso-4",
        titulo: "4.º Mistério Doloroso — Jesus a caminho do Calvário com a Cruz às costas",
        meditacao: "Jesus carrega a cruz e cai, e volta a levantar-se. Peçamos paciência para carregar a nossa cruz de cada dia." },
      { id: "doloroso-5",
        titulo: "5.º Mistério Doloroso — A Crucifixão e Morte de Jesus",
        meditacao: "Do alto da cruz, Jesus perdoa e entrega-nos a sua Mãe. Peçamos verdadeira contrição e um coração capaz de perdoar." }
    ]
  },
  gloriosos: {
    nome: "Mistérios Gloriosos",
    dias: [3, 0],
    diasTexto: "Quarta-feira e Domingo",
    cor: "#8a6a2a",
    lista: [
      { id: "glorioso-1",
        titulo: "1.º Mistério Glorioso — A Ressurreição de Jesus",
        meditacao: "Ao terceiro dia, Jesus ressuscita e vence a morte. Peçamos uma fé viva e a esperança que não se deixa abater." },
      { id: "glorioso-2",
        titulo: "2.º Mistério Glorioso — A Ascensão de Jesus ao Céu",
        meditacao: "Jesus sobe ao Céu e senta-Se à direita do Pai. Peçamos o desejo das coisas do alto, sem fugir às deste mundo." },
      { id: "glorioso-3",
        titulo: "3.º Mistério Glorioso — A Vinda do Espírito Santo",
        meditacao: "No Pentecostes, o Espírito Santo desce sobre Maria e os Apóstolos. Peçamos os seus dons e a coragem de dar testemunho." },
      { id: "glorioso-4",
        titulo: "4.º Mistério Glorioso — A Assunção de Nossa Senhora ao Céu",
        meditacao: "Maria é elevada ao Céu em corpo e alma. Peçamos a graça de uma boa morte e uma verdadeira devoção a Nossa Senhora." },
      { id: "glorioso-5",
        titulo: "5.º Mistério Glorioso — A Coroação de Nossa Senhora",
        meditacao: "Maria é coroada Rainha do Céu e da Terra. Peçamos a sua protecção maternal e a perseverança até ao fim." }
    ]
  },
  luminosos: {
    nome: "Mistérios Luminosos",
    dias: [4],
    diasTexto: "Quinta-feira",
    cor: "#2f5e7a",
    lista: [
      { id: "luminoso-1",
        titulo: "1.º Mistério Luminoso — O Baptismo de Jesus no rio Jordão",
        meditacao: "O Pai proclama: «Este é o meu Filho muito amado.» Peçamos fidelidade às promessas do nosso próprio Baptismo." },
      { id: "luminoso-2",
        titulo: "2.º Mistério Luminoso — As Bodas de Caná",
        meditacao: "A pedido de Maria, Jesus realiza o primeiro sinal, e ela diz-nos: «Fazei tudo o que Ele vos disser.» Peçamos confiança na sua intercessão." },
      { id: "luminoso-3",
        titulo: "3.º Mistério Luminoso — O Anúncio do Reino de Deus",
        meditacao: "Jesus anuncia o Reino e chama à conversão. Peçamos um coração disposto a mudar de vida." },
      { id: "luminoso-4",
        titulo: "4.º Mistério Luminoso — A Transfiguração de Jesus",
        meditacao: "No monte Tabor, Jesus revela a sua glória aos discípulos. Peçamos o desejo sincero da santidade." },
      { id: "luminoso-5",
        titulo: "5.º Mistério Luminoso — A Instituição da Eucaristia",
        meditacao: "Na Última Ceia, Jesus dá-Se em alimento. Peçamos amor à Eucaristia e gratidão por este dom." }
    ]
  }
};

/* Devolve a chave dos mistérios recomendados para um dado dia da semana. */
function misteriosDoDia(diaSemana /* 0-6 */) {
  for (const chave in MISTERIOS) {
    if (MISTERIOS[chave].dias.includes(diaSemana)) return chave;
  }
  return "gozosos";
}

/* ---------- Intenções de oração do Papa para 2026 ----------
   Papa Leão XIV — Rede Mundial de Oração do Papa (Apostolado da Oração).
   MANUTENÇÃO ANUAL: todos os anos há 12 intenções novas. Ao atualizar este
   bloco é preciso regravar os áudios audio/papa-01.mp3 … papa-12.mp3.
   Confirme a formulação oficial em popesprayer.va / redemundialdeoracaodopapa.pt
------------------------------------------------------------------- */
const INTENCOES_PAPA = {
  ano: 2026,
  papa: "Papa Leão XIV",
  fonte: "Rede Mundial de Oração do Papa",
  meses: [
    { mes: 1,  id: "papa-01", tema: "Pela oração com a Palavra de Deus",
      texto: "Rezemos para que a oração com a Palavra de Deus seja alimento nas nossas vidas e fonte de esperança nas nossas comunidades, ajudando-nos a construir uma Igreja mais fraterna e missionária." },
    { mes: 2,  id: "papa-02", tema: "Pelas crianças com doenças incuráveis",
      texto: "Rezemos para que as crianças que sofrem de doenças incuráveis e as suas famílias recebam os cuidados médicos e o apoio necessários, sem nunca perderem a força e a esperança." },
    { mes: 3,  id: "papa-03", tema: "Pelo desarmamento e pela paz",
      texto: "Rezemos para que as nações avancem em direção a um desarmamento efetivo, especialmente o desarmamento nuclear, e para que os líderes mundiais escolham o caminho do diálogo e da diplomacia em vez da violência." },
    { mes: 4,  id: "papa-04", tema: "Pelos sacerdotes em crise",
      texto: "Rezemos pelos sacerdotes que atravessam momentos de crise na sua vocação, para que encontrem o acompanhamento necessário e para que as comunidades os apoiem com compreensão e oração." },
    { mes: 5,  id: "papa-05", tema: "Por uma alimentação para todos",
      texto: "Rezemos para que todos, desde os grandes produtores até aos pequenos consumidores, se comprometam a evitar o desperdício de alimentos e para que todos tenham acesso a uma alimentação de qualidade." },
    { mes: 6,  id: "papa-06", tema: "Pelos valores do desporto",
      texto: "Rezemos para que o desporto seja um instrumento de paz, encontro e diálogo entre culturas e nações, promovendo valores como o respeito, a solidariedade e a superação pessoal." },
    { mes: 7,  id: "papa-07", tema: "Pelo respeito da vida humana",
      texto: "Rezemos pelo respeito e pela proteção da vida humana em todas as suas etapas, reconhecendo-a como um dom de Deus." },
    { mes: 8,  id: "papa-08", tema: "Pela evangelização na cidade",
      texto: "Rezemos para que, nas grandes cidades, muitas vezes marcadas pelo anonimato e pela solidão, encontremos novas formas de anunciar o Evangelho, descobrindo caminhos criativos para construir comunidade." },
    { mes: 9,  id: "papa-09", tema: "Pelo cuidado com a água",
      texto: "Rezemos por uma gestão justa e sustentável da água, recurso vital, para que todos tenham acesso equitativo a ela." },
    { mes: 10, id: "papa-10", tema: "Pela pastoral da saúde mental",
      texto: "Rezemos para que a pastoral da saúde mental seja integrada em toda a Igreja, ajudando a superar o estigma e a discriminação contra as pessoas com doenças mentais." },
    { mes: 11, id: "papa-11", tema: "Pelo bom uso das riquezas",
      texto: "Rezemos pelo bom uso das riquezas, para que, resistindo à tentação do egoísmo, estejam sempre ao serviço do bem comum e da solidariedade com os mais necessitados." },
    // Dezembro: traduzido da versão inglesa; trocar pelo texto oficial português quando sair.
    { mes: 12, id: "papa-12", tema: "Pelas famílias monoparentais",
      texto: "Rezemos pelas famílias que vivem a ausência de uma mãe ou de um pai, para que encontrem apoio e acompanhamento na Igreja, e ajuda e força na fé nos momentos difíceis." }
  ],
  /* Um mês que não esteja na lista acima (sobretudo janeiro, antes da manutenção
     anual) reza pelas intenções do Santo Padre em geral, e nunca pela intenção
     do mesmo mês de outro ano. */
  geral: { id: "papa-geral", geral: true, tema: "Pelas intenções do Santo Padre",
    texto: "Rezemos pelas intenções do Santo Padre." },
  intencaoDoMes: function (data) {
    const d = data || new Date();
    if (d.getFullYear() !== this.ano) return this.geral;
    return this.meses.find(m => m.mes === d.getMonth() + 1) || this.geral;
  }
};

/* Nomes em português para datas */
const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
  "Quinta-feira", "Sexta-feira", "Sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
