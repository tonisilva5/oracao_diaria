"""
Grava as orações do terço com a voz configurada em ferramentas/voz.json, para audio/*.mp3.

Porquê gravar em vez de sintetizar no telemóvel: a voz do sistema soa metálica,
e no iPhone nem sempre há voz de Portugal instalada. As orações são texto fixo,
por isso grava-se uma vez e a app fica com voz própria, que funciona offline.

O motor (edge ou elevenlabs) e a voz escolhem-se em ferramentas/voz.json e são
os mesmos das leituras do dia (gerar_leituras.py). Tudo o que fala com o motor
está em ferramentas/voz.py. O índice audio/index.json regista a voz usada
("voz"); se a voz mudar, as orações são regravadas todas. Regista também, por
oração, uma impressão do texto falado e dos parâmetros do motor ("impressoes"):
se o texto de uma oração mudar, só essa é regravada; se um parâmetro do motor
mudar (ritmo, tom, estabilidade...), são todas; sem impressão registada (índice
antigo), também. O índice é reescrito depois de cada oração gravada, por isso
uma interrupção não obriga a pagar outra vez o que já ficou gravado.
"versoes" guarda uma impressão de cada MP3: a app pede audio/<id>.mp3?v=<versão>,
e assim uma oração regravada chega aos telemóveis sem apagar as outras.

Uso:
    python ferramentas/extrair_textos.js      (primeiro, via node)
    python ferramentas/gerar_audio.py         (só o que falta, mudou de texto ou de voz)
    python ferramentas/gerar_audio.py --forcar        (regrava tudo)
    python ferramentas/gerar_audio.py --estimar       (conta caracteres; não grava nada)
    python ferramentas/gerar_audio.py --voz pt-PT-DuarteNeural   (só motor edge)

Requer:  pip install edge-tts   (só se o motor for edge)
         variável de ambiente ELEVENLABS_API_KEY   (só se o motor for elevenlabs)
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import voz

RAIZ = Path(__file__).resolve().parent.parent
TEXTOS = RAIZ / "ferramentas" / "textos.json"
DESTINO = RAIZ / "audio"

# Os parâmetros que mudam o som, por motor. Entram na impressão de cada oração.
PARAMETROS_DO_MOTOR = {
    "edge": ("voz", "ritmo", "tom"),
    "elevenlabs": ("voice_id", "model_id", "stability", "similarity_boost",
                   "style", "speed", "use_speaker_boost"),
}


def preparar(texto: str) -> str:
    """Junta as quebras de linha; a pontuação é que dá as pausas ao motor."""
    return re.sub(r"\s*\n\s*", " ", texto).strip()


def parametros_do_motor() -> str:
    """Os parâmetros do motor ativo (voz.json + --voz/--ritmo/--tom), serializados
    sempre da mesma maneira."""
    cfg = voz.configuracao()
    motor = cfg["motor"]
    return json.dumps({k: cfg[motor].get(k) for k in PARAMETROS_DO_MOTOR[motor]}, sort_keys=True)


def impressao(falado: str, parametros: str) -> str:
    return hashlib.sha1(f"{falado}|{parametros}".encode("utf-8")).hexdigest()


def escrever_indice(indice: dict):
    """Escreve num .parcial e só depois substitui: nunca deixa um index.json a meio."""
    parcial = DESTINO / "index.json.parcial"
    parcial.write_text(json.dumps(indice, ensure_ascii=False, indent=2), encoding="utf-8")
    parcial.replace(DESTINO / "index.json")


def ler_indice_anterior() -> dict:
    try:
        return json.loads((DESTINO / "index.json").read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def principal(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--voz", default=None, help="só motor edge: sobrepõe a voz do voz.json")
    # Valores negativos escrevem-se com «=», senão parecem uma opção: --ritmo=-18%
    ap.add_argument("--ritmo", default=None, help="só motor edge: sobrepõe o ritmo do voz.json (ex.: --ritmo=-18%%)")
    ap.add_argument("--tom", default=None, help="só motor edge: sobrepõe o tom do voz.json (ex.: --tom=-2Hz)")
    ap.add_argument("--forcar", action="store_true")
    ap.add_argument("--estimar", action="store_true",
                    help="conta os caracteres que seriam enviados ao motor, sem gravar nada")
    args = ap.parse_args(argv)

    if not TEXTOS.exists():
        sys.exit("Falta ferramentas/textos.json — corra antes: node ferramentas/extrair_textos.js")

    try:
        voz.sobrepor_edge(args.voz, args.ritmo, args.tom)
        identificacao = voz.identificacao()
        dados = json.loads(TEXTOS.read_text(encoding="utf-8"))
        itens = dados["itens"]

        # Uma gravação só se reaproveita se o índice anterior a lista, foi feita
        # com a voz de agora E com o mesmo texto e parâmetros (impressão). Num
        # índice todos os ficheiros têm a mesma voz. Sem impressão registada
        # (índice antigo) não se sabe com que texto foi gravada: regrava-se.
        parametros = parametros_do_motor()
        impressoes = {item["id"]: impressao(preparar(item["texto"]), parametros) for item in itens}
        anterior = ler_indice_anterior()
        mesma_voz = voz.voz_do_indice(anterior) == identificacao
        listados = set(anterior.get("ficheiros", []))
        impressoes_anteriores = anterior.get("impressoes")
        if not isinstance(impressoes_anteriores, dict):
            impressoes_anteriores = {}

        def reaproveitavel(item):
            return (not args.forcar and mesma_voz and item["id"] in listados
                    and impressoes_anteriores.get(item["id"]) == impressoes[item["id"]]
                    and (DESTINO / f"{item['id']}.mp3").exists())

        if args.estimar:
            return estimar(itens, reaproveitavel)

        voz.preparar_motor()
    except voz.ErroVozFatal as erro:
        sys.exit(str(erro))

    DESTINO.mkdir(exist_ok=True)
    print(f"{len(itens)} orações · voz {voz.descricao()}")

    feitos, total_bytes, falhados = [], 0, []
    gravados_agora = []
    fatal = False   # chave, voz ou conta com problema: não vale a pena tentar as seguintes
    versoes = {}    # id → impressão do MP3 gravado (cache: ler o ficheiro uma vez só)

    def versao_do_mp3(ident):
        # A app pede audio/<id>.mp3?v=<isto>. Vem do próprio som e não do texto:
        # uma regravação com o mesmo texto (outro take) também tem de chegar.
        if ident not in versoes:
            versoes[ident] = hashlib.sha1((DESTINO / f"{ident}.mp3").read_bytes()).hexdigest()[:12]
        return versoes[ident]

    def guardar_indice():
        # Listam-se as gravações feitas ou reaproveitadas nesta corrida. Com a
        # mesma voz ficam também as que o índice já listava e não foram
        # regravadas (ainda não visitadas, falhadas, ou --forcar interrompido),
        # com a impressão antiga — a corrida seguinte regrava só o que difere.
        # Com voz nova, o índice passa à voz nova e lista só o gravado com ela.
        imp = {i: impressoes[i] for i in feitos}
        if mesma_voz:
            for i in listados:
                if i not in imp and i in impressoes and (DESTINO / f"{i}.mp3").exists():
                    imp[i] = impressoes_anteriores.get(i)
        ids = sorted(imp)
        escrever_indice({
            "versao": dados.get("versao", ""),
            "voz": identificacao,
            "ficheiros": ids,
            "impressoes": {i: imp[i] for i in ids if imp[i]},
            "versoes": {i: versao_do_mp3(i) for i in ids},
        })

    try:
        for item in itens:
            alvo = DESTINO / f"{item['id']}.mp3"
            if reaproveitavel(item):
                feitos.append(item["id"])
                total_bytes += alvo.stat().st_size
                print(f"  {'existia':8} {item['id']:24} {alvo.stat().st_size/1024:7.1f} KB")
                continue
            if fatal:
                falhados.append(item["id"])
                continue
            try:
                voz.sintetizar(preparar(item["texto"]), alvo)
            except voz.ErroVozFatal as erro:
                fatal = True
                print(f"  FALHOU   {item['id']:24} {erro}")
                falhados.append(item["id"])
                continue
            except Exception as erro:
                print(f"  FALHOU   {item['id']:24} {erro}")
                falhados.append(item["id"])
                continue
            feitos.append(item["id"])
            gravados_agora.append(item["id"])
            versoes.pop(item["id"], None)
            total_bytes += alvo.stat().st_size
            print(f"  {'gravado':8} {item['id']:24} {alvo.stat().st_size/1024:7.1f} KB")
            guardar_indice()
    finally:
        # Também num Ctrl+C: o que já foi pago fica no índice. Se nada foi
        # gravado, o índice anterior continua a valer tal como estava.
        if gravados_agora:
            guardar_indice()

    print(f"\n{len(feitos)} ficheiros · {total_bytes/1024/1024:.1f} MB · índice em audio/index.json")
    if falhados:
        print("Falharam: " + ", ".join(falhados))
        sys.exit(1)


def estimar(itens, reaproveitavel):
    """Conta o que seria enviado ao motor. Não chama motor nem escreve ficheiros."""
    print(f"{len(itens)} orações · voz {voz.descricao()}")
    por_gravar = {"caracteres": 0, "pedidos": 0, "oracoes": 0}
    tudo = {"caracteres": 0, "pedidos": 0}
    for item in itens:
        caracteres, pedidos = voz.estimar(preparar(item["texto"]))
        tudo["caracteres"] += caracteres
        tudo["pedidos"] += pedidos
        if reaproveitavel(item):
            estado = "existia"
        else:
            estado = "a gravar"
            por_gravar["caracteres"] += caracteres
            por_gravar["pedidos"] += pedidos
            por_gravar["oracoes"] += 1
        print(f"  {estado:8} {item['id']:24} {caracteres:6d} caracteres")

    print(f"\nA enviar agora (só o que falta, mudou de texto ou de voz): "
          f"{por_gravar['oracoes']} orações · {por_gravar['caracteres']} caracteres · "
          f"{por_gravar['pedidos']} pedidos")
    print(f"Se regravar tudo (--forcar, voz nova ou parâmetros novos): "
          f"{len(itens)} orações · {tudo['caracteres']} caracteres · {tudo['pedidos']} pedidos")


if __name__ == "__main__":
    principal()
