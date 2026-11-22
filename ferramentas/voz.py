"""
O motor de voz da aplicação: a única peça que fala com o serviço de síntese.

As orações gravadas (gerar_audio.py) e as leituras do dia (gerar_leituras.py)
pedem o áudio aqui, por isso usam sempre a mesma voz. O motor escolhe-se em
ferramentas/voz.json:

    "motor": "edge"          voz neural da Microsoft (edge-tts), gratuita
    "motor": "elevenlabs"    ElevenLabs, com a voz de "elevenlabs.voice_id"

ElevenLabs só usa a biblioteca padrão. A chave vem EXCLUSIVAMENTE da variável de
ambiente ELEVENLABS_API_KEY: nunca é lida de ficheiros, escrita em ficheiros nem
impressa. Na GitHub Action vem de secrets.ELEVENLABS_API_KEY.

API para os scripts:
    sintetizar(texto, destino_mp3)   grava o áudio (escreve num .parcial e só
                                     depois move, por isso nunca deixa MP3 a meio)
    identificacao()                  "edge:<voz>" ou "elevenlabs:<voice_id>:<model_id>"
    preparar_motor()                 verifica chave/biblioteca antes de gravar
    estimar(texto)                   (caracteres, pedidos) que seriam enviados
"""

import asyncio
import copy
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CAMINHO_CONFIG = Path(__file__).resolve().parent / "voz.json"

MOTORES = ("edge", "elevenlabs")

# Valores usados se faltar alguma chave no voz.json. O ficheiro manda.
_PADRAO = {
    "motor": "edge",
    "edge": {"voz": "pt-PT-RaquelNeural", "ritmo": "-12%", "tom": "-2Hz"},
    "elevenlabs": {
        "voice_id": "",
        "model_id": "eleven_multilingual_v2",
        "output_format": "mp3_44100_128",
        "stability": 0.6,
        "similarity_boost": 0.75,
        "style": 0.05,
        "speed": 0.9,
        "use_speaker_boost": True,
    },
}

TAMANHO_MINIMO = 500            # abaixo disto o MP3 está vazio ou truncado
API_ELEVENLABS = "https://api.elevenlabs.io/v1/text-to-speech"
LIMITE_BLOCO = 900              # caracteres por pedido ao ElevenLabs
MAX_ENCADEADOS = 3              # previous_request_ids aceita no máximo 3
ESPERAS = (2, 4, 8, 16)         # segundos antes de cada repetição (429 e 5xx)
# O edge-tts às vezes responde «No audio was received» a um texto que, pedido
# outra vez, grava sem problema: o serviço da Microsoft está a travar pedidos.
# Esperas curtas não chegam (aconteceu a 22/11/2026 com duas leituras em 13).
ESPERAS_EDGE = (5, 15, 30, 60)  # segundos antes de cada repetição do edge-tts
TIMEOUT = 120

_SOBREPOSTO_EDGE = {}


class ErroVoz(RuntimeError):
    """Falha ao sintetizar este texto; os restantes podem correr bem."""


class ErroVozFatal(ErroVoz):
    """Configuração, chave ou conta em falta: insistir nos outros textos é inútil."""


# ---------------------------------------------------------------- configuração

def configuracao() -> dict:
    cfg = copy.deepcopy(_PADRAO)
    try:
        dados = json.loads(CAMINHO_CONFIG.read_text(encoding="utf-8"))
    except FileNotFoundError:
        dados = {}
    except json.JSONDecodeError as erro:
        raise ErroVozFatal(f"{CAMINHO_CONFIG.name} não é JSON válido: {erro}")

    if "motor" in dados:
        cfg["motor"] = dados["motor"]
    for motor in MOTORES:
        cfg[motor].update(dados.get(motor) or {})
    cfg["edge"].update({k: v for k, v in _SOBREPOSTO_EDGE.items() if v})

    cfg["motor"] = str(cfg["motor"]).strip().lower()
    if cfg["motor"] not in MOTORES:
        raise ErroVozFatal(
            f'motor "{cfg["motor"]}" desconhecido em {CAMINHO_CONFIG.name}; use "edge" ou "elevenlabs"'
        )
    return cfg


def sobrepor_edge(voz=None, ritmo=None, tom=None):
    """Para as opções --voz/--ritmo/--tom da linha de comandos (só motor edge)."""
    for chave, valor in (("voz", voz), ("ritmo", ritmo), ("tom", tom)):
        if valor:
            _SOBREPOSTO_EDGE[chave] = valor


def identificacao() -> str:
    """Quem fala. Vai para os índices e entra na decisão de regravar ou não."""
    cfg = configuracao()
    if cfg["motor"] == "edge":
        return f"edge:{cfg['edge']['voz']}"
    e = cfg["elevenlabs"]
    return f"elevenlabs:{e['voice_id']}:{e['model_id']}"


def descricao() -> str:
    """Uma linha para o registo dos scripts."""
    cfg = configuracao()
    if cfg["motor"] == "edge":
        e = cfg["edge"]
        return f"{identificacao()} · ritmo {e['ritmo']} · tom {e['tom']}"
    e = cfg["elevenlabs"]
    return (f"{identificacao()} · estabilidade {e['stability']} · velocidade {e['speed']}")


def voz_do_indice(indice) -> "str | None":
    """Identificação guardada num índice. Os índices antigos só tinham o nome da
    voz do edge ("pt-PT-RaquelNeural"), sem motor à frente."""
    if not isinstance(indice, dict):
        return None
    valor = indice.get("voz")
    if not valor or not isinstance(valor, str):
        return None
    return valor if ":" in valor else f"edge:{valor}"


def _chave() -> str:
    chave = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not chave:
        raise ErroVozFatal(
            "Falta a chave do ElevenLabs na variável de ambiente ELEVENLABS_API_KEY. "
            "Defina-a sem a escrever na linha de comandos, para não ficar no histórico do shell:\n"
            "  PowerShell: $s = Read-Host 'Chave ElevenLabs' -AsSecureString; "
            "$env:ELEVENLABS_API_KEY = [Net.NetworkCredential]::new('', $s).Password\n"
            "  bash:       read -rs ELEVENLABS_API_KEY && export ELEVENLABS_API_KEY\n"
            "  GitHub:     Settings > Secrets and variables > Actions > ELEVENLABS_API_KEY\n"
            "A chave nunca é lida de ficheiros."
        )
    return chave


def _voice_id(cfg_eleven: dict) -> str:
    voice_id = str(cfg_eleven.get("voice_id") or "").strip()
    if not voice_id:
        raise ErroVozFatal(
            'Falta a voz do ElevenLabs: preencha "elevenlabs.voice_id" em ferramentas/voz.json.'
        )
    return voice_id


def preparar_motor():
    """Falha já, com mensagem clara, se o motor escolhido não puder trabalhar."""
    cfg = configuracao()
    if cfg["motor"] == "edge":
        try:
            import edge_tts  # noqa: F401
        except ImportError:
            raise ErroVozFatal("Falta o edge-tts: pip install edge-tts")
    else:
        _voice_id(cfg["elevenlabs"])
        _chave()


# ------------------------------------------------------------ divisão do texto

_FIM_DE_FRASE = re.compile(r'[.!?…]+["»”’)\]]*(?=\s|$)')


def _frases(texto: str) -> list:
    frases, inicio = [], 0
    for m in _FIM_DE_FRASE.finditer(texto):
        frase = texto[inicio:m.end()].strip()
        if frase:
            frases.append(frase)
        inicio = m.end()
    resto = texto[inicio:].strip()
    if resto:
        frases.append(resto)
    return frases


def _partir_frase_longa(frase: str, limite: int) -> list:
    """Só para uma frase que sozinha passa do limite: corta na última pausa
    (; : ,) e, não havendo, no último espaço."""
    partes, resto = [], frase.strip()
    while len(resto) > limite:
        janela = resto[:limite]
        pausa = max(janela.rfind("; "), janela.rfind(": "), janela.rfind(", "))
        if pausa > limite // 3:
            fim = pausa + 1
        else:
            espaco = janela.rfind(" ")
            fim = espaco if espaco > 0 else limite
        partes.append(resto[:fim].strip())
        resto = resto[fim:].strip()
    if resto:
        partes.append(resto)
    return partes


def dividir_em_blocos(texto: str, limite: int = LIMITE_BLOCO) -> list:
    """Blocos de até `limite` caracteres, sempre no fim de uma frase."""
    texto = re.sub(r"\s+", " ", texto).strip()
    if not texto:
        return []
    frases = []
    for frase in _frases(texto):
        frases.extend([frase] if len(frase) <= limite else _partir_frase_longa(frase, limite))

    blocos, atual = [], ""
    for frase in frases:
        if atual and len(atual) + 1 + len(frase) > limite:
            blocos.append(atual)
            atual = frase
        else:
            atual = f"{atual} {frase}" if atual else frase
    if atual:
        blocos.append(atual)
    return blocos


def estimar(texto: str) -> tuple:
    """(caracteres, pedidos) que seriam enviados ao motor. Não chama nada."""
    if configuracao()["motor"] == "elevenlabs":
        blocos = dividir_em_blocos(texto)
        return sum(len(b) for b in blocos), len(blocos)
    return len(texto.strip()), (1 if texto.strip() else 0)


# ----------------------------------------------------------------- motor edge

def _verificar_tamanho(parcial: Path):
    if not parcial.exists() or parcial.stat().st_size < TAMANHO_MINIMO:
        parcial.unlink(missing_ok=True)
        raise ErroVoz("áudio vazio")


def _sintetizar_edge(texto: str, parcial: Path, cfg: dict):
    try:
        import edge_tts
    except ImportError:
        raise ErroVozFatal("Falta o edge-tts: pip install edge-tts")

    async def gravar():
        fala = edge_tts.Communicate(texto, cfg["voz"], rate=cfg["ritmo"], pitch=cfg["tom"])
        await fala.save(str(parcial))

    ultimo = None
    for tentativa in range(len(ESPERAS_EDGE) + 1):
        if tentativa:
            time.sleep(ESPERAS_EDGE[tentativa - 1])
        try:
            asyncio.run(gravar())
            _verificar_tamanho(parcial)
            return
        except Exception as erro:
            ultimo = erro
            parcial.unlink(missing_ok=True)
    raise ErroVoz(f"edge-tts falhou em {len(ESPERAS_EDGE) + 1} tentativas: {ultimo}")


# ----------------------------------------------------------- motor ElevenLabs

def _redigir(texto: str, chave: str) -> str:
    return texto.replace(chave, "***") if chave else texto


def _corpo_do_erro(erro: urllib.error.HTTPError, chave: str) -> str:
    try:
        bruto = erro.read().decode("utf-8", errors="replace").strip()
    except Exception:
        bruto = ""
    return _redigir(bruto, chave)[:500] or "(sem corpo)"


def _pedir_bloco(url: str, chave: str, corpo: dict):
    """Um POST ao ElevenLabs. Devolve (bytes mp3, request-id)."""
    pedido = urllib.request.Request(
        url,
        data=json.dumps(corpo).encode("utf-8"),
        method="POST",
        headers={
            "xi-api-key": chave,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
            "User-Agent": "OracaoDiaria/1.0",
        },
    )
    for tentativa in range(len(ESPERAS) + 1):
        ultimo = tentativa == len(ESPERAS)
        try:
            with urllib.request.urlopen(pedido, timeout=TIMEOUT) as resposta:
                return resposta.read(), resposta.headers.get("request-id")
        except urllib.error.HTTPError as erro:
            detalhe = _corpo_do_erro(erro, chave)
            repetivel = erro.code == 429 or 500 <= erro.code < 600
            if repetivel and not ultimo:
                time.sleep(ESPERAS[tentativa])
                continue
            mensagem = f"ElevenLabs respondeu HTTP {erro.code}: {detalhe}"
            if repetivel:
                raise ErroVoz(f"{mensagem} (desisti após {tentativa + 1} tentativas)")
            if erro.code in (401, 402, 403, 404):
                raise ErroVozFatal(mensagem)
            raise ErroVoz(mensagem)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as erro:
            if not ultimo:
                time.sleep(ESPERAS[tentativa])
                continue
            raise ErroVoz(
                f"sem resposta do ElevenLabs após {tentativa + 1} tentativas: {_redigir(str(erro), chave)}"
            )


def _sintetizar_elevenlabs(texto: str, parcial: Path, cfg: dict):
    chave = _chave()
    voice_id = _voice_id(cfg)
    url = (f"{API_ELEVENLABS}/{urllib.parse.quote(voice_id, safe='')}"
           f"?output_format={urllib.parse.quote(str(cfg['output_format']), safe='')}")

    definicoes = {
        "stability": cfg["stability"],
        "similarity_boost": cfg["similarity_boost"],
        "style": cfg["style"],
        "use_speaker_boost": cfg["use_speaker_boost"],
        "speed": cfg["speed"],
    }

    partes, ids = [], []
    for bloco in dividir_em_blocos(texto):
        corpo = {"text": bloco, "model_id": cfg["model_id"], "voice_settings": definicoes}
        if ids:
            corpo["previous_request_ids"] = list(ids)
        audio, id_pedido = _pedir_bloco(url, chave, corpo)
        partes.append(audio)
        if id_pedido:
            ids = (ids + [id_pedido])[-MAX_ENCADEADOS:]

    parcial.write_bytes(b"".join(partes))
    _verificar_tamanho(parcial)


# ------------------------------------------------------------------ entrada

def sintetizar(texto: str, destino_mp3):
    """Grava `texto` em `destino_mp3` com o motor configurado.

    Escreve primeiro em <destino>.parcial e só move no fim. Levanta ErroVoz se
    falhar e ErroVozFatal se o problema for de configuração, chave ou conta."""
    cfg = configuracao()
    destino = Path(destino_mp3)
    parcial = destino.with_name(destino.name + ".parcial")
    if not texto or not texto.strip():
        raise ErroVoz("texto vazio")
    try:
        if cfg["motor"] == "edge":
            _sintetizar_edge(texto.strip(), parcial, cfg["edge"])
        else:
            _sintetizar_elevenlabs(texto.strip(), parcial, cfg["elevenlabs"])
        parcial.replace(destino)
    finally:
        parcial.unlink(missing_ok=True)
