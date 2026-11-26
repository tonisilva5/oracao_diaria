"""
Grava as leituras do dia com a mesma voz das orações (ferramentas/voz.json).

Ao contrário das orações, as leituras mudam todos os dias, por isso isto
corre numa GitHub Action, uma vez por dia, para os próximos dias. A app
toca o ficheiro do dia se existir; se não existir, lê com a voz do telemóvel.

O motor (edge ou elevenlabs) e a voz escolhem-se em ferramentas/voz.json, e
tudo o que fala com o motor está em ferramentas/voz.py. O índice
audio/leituras/index.json regista a voz usada ("voz"); um ficheiro só se
reaproveita se foi gravado com a voz de agora. Se o feed falhar ou vier vazio
para um dia, o dia mantém no índice o que já estava gravado com a voz de agora.

Uso:
    python ferramentas/gerar_leituras.py --dias 4
    python ferramentas/gerar_leituras.py --dias 1 --estimar   (conta caracteres; não grava nada)

Requer:  pip install edge-tts   (só se o motor for edge)
         variável de ambiente ELEVENLABS_API_KEY   (só se o motor for elevenlabs)
"""

import argparse
import json
import re
import sys
import time
import urllib.request
from datetime import date, timedelta
from pathlib import Path
from xml.etree import ElementTree

import voz

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "audio" / "leituras"
FONTE = "https://feed.evangelizo.org/v2/reader.php?date={}&type=xml&lang=PT"
ESPERAS_FEED = (3, 6)   # segundos antes de cada nova tentativa ao feed

# O texto do feed de cada dia, tal como veio, para publicar ao lado do áudio
# (audio/leituras/AAAAMMDD.xml). A app lê-o primeiro do próprio site: no iPhone
# o pedido direto ao Evangelizo falhava, e um ficheiro do mesmo endereço não
# depende de outro site nem de bloqueadores. Só entra aqui um dia com leituras.
XML_DO_DIA = {}

SECCOES = [
    ("primeira", "reading_text1"),
    ("salmo", "reading_text2"),
    ("segunda", "reading_text3"),
    ("evangelho", "reading_gospel"),
]


def buscar(dia: date) -> dict:
    """As leituras do dia. Se o feed falhar ou vier vazio, tenta mais
    len(ESPERAS_FEED) vezes; no fim levanta o último erro ou devolve {}."""
    erro_final = None
    for tentativa in range(len(ESPERAS_FEED) + 1):
        if tentativa:
            time.sleep(ESPERAS_FEED[tentativa - 1])
        try:
            leituras = _ler_feed(dia)
        except Exception as erro:
            erro_final = erro
            continue
        if leituras:
            return leituras
        erro_final = None
    if erro_final is not None:
        raise erro_final
    return {}


def _ler_feed(dia: date) -> dict:
    url = FONTE.format(dia.strftime("%Y%m%d"))
    pedido = urllib.request.Request(url, headers={"User-Agent": "OracaoDiaria/1.0"})
    with urllib.request.urlopen(pedido, timeout=30) as resposta:
        bruto = resposta.read().decode("utf-8", errors="replace")

    if "<evangelizo>" not in bruto:
        raise RuntimeError(f"resposta inesperada para {dia}")

    raiz = ElementTree.fromstring(bruto)
    saida = {}
    for chave, etiqueta in SECCOES:
        elemento = raiz.find(f".//{etiqueta}")
        texto = (elemento.text or "").strip() if elemento is not None else ""
        if len(texto) > 40:
            saida[chave] = texto
    if "evangelho" in saida:
        XML_DO_DIA[dia.strftime("%Y%m%d")] = bruto
    return saida


def preparar(texto: str) -> str:
    """Tira o que a voz leria mal e junta as quebras de linha."""
    limpo = re.sub(r"[«»]", "", texto)
    limpo = re.sub(r"\s*\n\s*", " ", limpo)
    return re.sub(r"\s{2,}", " ", limpo).strip()


def ler_indice_anterior() -> dict:
    try:
        return json.loads((DESTINO / "index.json").read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def principal(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, default=4, help="quantos dias a partir de hoje")
    ap.add_argument("--estimar", action="store_true",
                    help="conta os caracteres que seriam enviados ao motor, sem gravar nada")
    args = ap.parse_args(argv)

    try:
        identificacao = voz.identificacao()
        if not args.estimar:
            voz.preparar_motor()
    except voz.ErroVozFatal as erro:
        sys.exit(str(erro))

    hoje = date.today()
    janela = [hoje + timedelta(days=i) for i in range(args.dias)]
    validos = {d.strftime("%Y%m%d") for d in janela}

    # Só se reaproveita um ficheiro se o índice anterior o lista E foi gravado com
    # a voz de agora. Num índice todos os ficheiros têm a mesma voz: o que falha
    # ao regravar fica de fora.
    anterior = ler_indice_anterior()
    mesma_voz = voz.voz_do_indice(anterior) == identificacao
    dias_anteriores = anterior.get("dias", {})

    def reaproveitavel(etiqueta, chave):
        return (mesma_voz and chave in dias_anteriores.get(etiqueta, [])
                and (DESTINO / f"{etiqueta}-{chave}.mp3").exists())

    if args.estimar:
        print(f"{args.dias} dia(s) a partir de {hoje} · voz {voz.descricao()}")
    else:
        DESTINO.mkdir(parents=True, exist_ok=True)
        # Fora da janela não interessa: apagar mantém o repositório pequeno.
        antigos = list(DESTINO.glob("*.mp3")) + list(DESTINO.glob("*.xml"))
        for antigo in antigos:
            if antigo.name.split("-")[0].split(".")[0] not in validos:
                antigo.unlink()
                print(f"  apagado  {antigo.name}")

    indice = {"voz": identificacao, "dias": {}}
    janela_total = {"caracteres": 0, "pedidos": 0}
    em_falta = {"caracteres": 0, "pedidos": 0}
    fatal = False   # chave, voz ou conta com problema: não vale a pena tentar as seguintes

    for dia in janela:
        etiqueta = dia.strftime("%Y%m%d")
        try:
            leituras = buscar(dia)
        except Exception as erro:
            print(f"  SEM DADOS {etiqueta}: {erro}")
            leituras = {}
        else:
            if not leituras:
                print(f"  SEM DADOS {etiqueta}: o feed veio vazio")
        if not leituras:
            # Sem feed não se sabe o que mudou: fica o que já estava gravado com a
            # voz de agora, para a app não perder MP3 publicados nem se pagar outra vez.
            manter = [c for c in dias_anteriores.get(etiqueta, []) if reaproveitavel(etiqueta, c)]
            if manter:
                indice["dias"][etiqueta] = manter
                print(f"  mantido  {etiqueta}: {', '.join(manter)} (do índice anterior)")
            continue

        if not args.estimar and etiqueta in XML_DO_DIA:
            (DESTINO / f"{etiqueta}.xml").write_text(XML_DO_DIA[etiqueta], encoding="utf-8")

        feitas = []
        for chave, texto in leituras.items():
            alvo = DESTINO / f"{etiqueta}-{chave}.mp3"
            falada = preparar(texto)

            if args.estimar:
                caracteres, pedidos = voz.estimar(falada)
                janela_total["caracteres"] += caracteres
                janela_total["pedidos"] += pedidos
                if reaproveitavel(etiqueta, chave):
                    estado = "existia"
                else:
                    estado = "a gravar"
                    em_falta["caracteres"] += caracteres
                    em_falta["pedidos"] += pedidos
                print(f"  {estado:8} {etiqueta}-{chave:10} {caracteres:6d} caracteres")
                continue

            if reaproveitavel(etiqueta, chave):
                feitas.append(chave)
                continue
            if fatal:
                continue
            try:
                voz.sintetizar(falada, alvo)
                feitas.append(chave)
                print(f"  gravado  {alvo.name}  {alvo.stat().st_size/1024:.0f} KB")
            except voz.ErroVozFatal as erro:
                fatal = True
                print(f"  FALHOU   {alvo.name}: {erro}")
            except Exception as erro:
                print(f"  FALHOU   {alvo.name}: {erro}")
        if feitas:
            indice["dias"][etiqueta] = feitas

    if args.estimar:
        print(f"\nA enviar agora (só o que falta ou mudou de voz): "
              f"{em_falta['caracteres']} caracteres · {em_falta['pedidos']} pedidos")
        print(f"Janela completa de {args.dias} dia(s): "
              f"{janela_total['caracteres']} caracteres · {janela_total['pedidos']} pedidos "
              f"(a Action só envia isto tudo se não encontrar as leituras já publicadas no gh-pages)")
        return

    (DESTINO / "index.json").write_text(
        json.dumps(indice, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    total = sum(f.stat().st_size for f in DESTINO.glob("*.mp3"))
    print(f"\n{len(indice['dias'])} dias · {total/1024/1024:.1f} MB")
    if fatal:
        sys.exit("A gravação parou: o motor recusou o pedido (ver a mensagem acima).")
    if not indice["dias"]:
        sys.exit("nenhum dia gravado")


if __name__ == "__main__":
    principal()
