"""
Testes do motor de voz (voz.py) e da forma como os scripts o usam.

    python ferramentas/testar_voz.py            (sem rede, sem gastar créditos)
    python ferramentas/testar_voz.py --edge     (acrescenta UMA frase real com edge-tts,
                                                 gravada na pasta temporária do sistema)

O ElevenLabs nunca é chamado a sério: urllib.request.urlopen é substituído por
um simulador. Nada é escrito em audio/.
"""

import contextlib
import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import gerar_audio  # noqa: E402
import gerar_leituras  # noqa: E402
import voz  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
CHAVE = "sk_chave_de_ensaio_NAO_REAL_123456"
VOICE_ID = "VOZ123"


def texto_de_ensaio(minimo: int) -> tuple:
    """Frases completas até chegar a `minimo` caracteres. Devolve (texto, frases)."""
    frases, i = [], 1
    while len(" ".join(frases)) < minimo:
        frases.append(f"Esta é a frase número {i} do texto de ensaio, com uma vírgula e um fim claro.")
        i += 1
    return " ".join(frases), frases


class RespostaFalsa:
    def __init__(self, corpo: bytes, request_id=None):
        self._corpo = corpo
        self.headers = {"request-id": request_id} if request_id else {}

    def read(self):
        return self._corpo

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def erro_http(codigo: int, corpo: str = "{}"):
    return urllib.error.HTTPError(
        "https://api.elevenlabs.io/", codigo, "erro", {}, io.BytesIO(corpo.encode("utf-8"))
    )


class Base(unittest.TestCase):
    """Cada teste usa um voz.json temporário (motor edge por omissão)."""

    def setUp(self):
        self.pasta = tempfile.TemporaryDirectory()
        self.addCleanup(self.pasta.cleanup)
        self.tmp = Path(self.pasta.name)
        self.config = self.tmp / "voz.json"
        patch = mock.patch.object(voz, "CAMINHO_CONFIG", self.config)
        patch.start()
        self.addCleanup(patch.stop)
        voz._SOBREPOSTO_EDGE.clear()
        self.addCleanup(voz._SOBREPOSTO_EDGE.clear)
        self.escrever_config("edge")

    def escrever_config(self, motor, voice_id=VOICE_ID):
        self.config.write_text(json.dumps({
            "motor": motor,
            "edge": {"voz": "pt-PT-RaquelNeural", "ritmo": "-12%", "tom": "-2Hz"},
            "elevenlabs": {
                "voice_id": voice_id, "model_id": "eleven_multilingual_v2",
                "output_format": "mp3_44100_128", "stability": 0.6,
                "similarity_boost": 0.75, "style": 0.05, "speed": 0.9,
                "use_speaker_boost": True,
            },
        }), encoding="utf-8")


class Configuracao(unittest.TestCase):
    def test_voz_json_do_projeto_fica_em_edge(self):
        dados = json.loads((RAIZ / "ferramentas" / "voz.json").read_text(encoding="utf-8"))
        self.assertEqual(dados["motor"], "edge")
        self.assertEqual(dados["edge"], {"voz": "pt-PT-RaquelNeural", "ritmo": "-12%", "tom": "-2Hz"})
        self.assertEqual(dados["elevenlabs"], {
            "voice_id": "", "model_id": "eleven_multilingual_v2", "output_format": "mp3_44100_128",
            "stability": 0.6, "similarity_boost": 0.75, "style": 0.05, "speed": 0.9,
            "use_speaker_boost": True,
        })
        self.assertEqual(voz.identificacao(), "edge:pt-PT-RaquelNeural")


class Identificacao(Base):
    def test_edge_e_elevenlabs(self):
        self.assertEqual(voz.identificacao(), "edge:pt-PT-RaquelNeural")
        self.escrever_config("elevenlabs")
        self.assertEqual(voz.identificacao(), "elevenlabs:VOZ123:eleven_multilingual_v2")

    def test_sobrepor_edge_muda_a_identificacao(self):
        voz.sobrepor_edge(voz="pt-PT-DuarteNeural")
        self.assertEqual(voz.identificacao(), "edge:pt-PT-DuarteNeural")

    def test_indice_antigo_conta_como_edge(self):
        self.assertEqual(voz.voz_do_indice({"voz": "pt-PT-RaquelNeural"}), "edge:pt-PT-RaquelNeural")
        self.assertEqual(voz.voz_do_indice({"voz": "elevenlabs:A:B"}), "elevenlabs:A:B")
        self.assertIsNone(voz.voz_do_indice({}))
        self.assertIsNone(voz.voz_do_indice(None))

    def test_motor_desconhecido(self):
        self.escrever_config("outro")
        with self.assertRaises(voz.ErroVozFatal):
            voz.identificacao()


class Blocos(unittest.TestCase):
    def test_texto_de_3000_caracteres(self):
        texto, frases = texto_de_ensaio(3000)
        blocos = voz.dividir_em_blocos(texto)
        self.assertGreaterEqual(len(texto), 3000)
        self.assertGreaterEqual(len(blocos), 4)
        self.assertTrue(all(len(b) <= 900 for b in blocos), [len(b) for b in blocos])
        self.assertEqual(" ".join(blocos), texto)                       # nada se perde nem se repete
        self.assertTrue(all(b.endswith(".") for b in blocos))            # fecham em fim de frase
        for frase in frases:                                             # nenhuma frase fica partida
            self.assertEqual(sum(frase in b for b in blocos), 1)

    def test_texto_curto_e_um_bloco(self):
        self.assertEqual(voz.dividir_em_blocos("Ave Maria.  Cheia\n de graça."), ["Ave Maria. Cheia de graça."])
        self.assertEqual(voz.dividir_em_blocos("   "), [])

    def test_frase_unica_maior_que_o_limite(self):
        texto = "palavra, " * 400 + "fim."
        blocos = voz.dividir_em_blocos(texto)
        self.assertGreater(len(blocos), 3)
        self.assertTrue(all(len(b) <= 900 for b in blocos))
        self.assertEqual("".join(" ".join(blocos).split()), "".join(texto.split()))

    def test_frase_sem_nenhuma_pausa(self):
        texto = "x" * 2000
        blocos = voz.dividir_em_blocos(texto)
        self.assertTrue(all(len(b) <= 900 for b in blocos))
        self.assertEqual("".join(blocos), texto)

    def test_aspas_e_reticencias_ficam_com_a_frase(self):
        texto = 'Disse-lhe: «Vem!» E ele veio… Depois calou-se.'
        self.assertEqual(voz._frases(texto), ['Disse-lhe: «Vem!»', "E ele veio…", "Depois calou-se."])


class ElevenLabs(Base):
    def setUp(self):
        super().setUp()
        self.escrever_config("elevenlabs")
        env = mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": CHAVE})
        env.start()
        self.addCleanup(env.stop)
        sleep = mock.patch.object(voz.time, "sleep")
        self.sleep = sleep.start()
        self.addCleanup(sleep.stop)
        self.destino = self.tmp / "saida.mp3"

    def simular(self, respostas):
        """Substitui urlopen por uma sequência de respostas (ou excepções)."""
        pedidos = []

        def falso(pedido, timeout=None):
            pedidos.append(pedido)
            resposta = respostas[len(pedidos) - 1]
            if isinstance(resposta, BaseException):
                raise resposta
            return resposta

        patch = mock.patch("urllib.request.urlopen", side_effect=falso)
        self.urlopen = patch.start()
        self.addCleanup(patch.stop)
        return pedidos

    @staticmethod
    def bytes_n(n):
        return (b"MP3-%d-" % n) * 100            # 600+ bytes: passa a verificação de tamanho mínimo

    def audio_n(self, n):
        return RespostaFalsa(self.bytes_n(n), f"req-{n}")

    def test_encadeamento_de_ids_e_juncao_dos_bytes(self):
        texto, _ = texto_de_ensaio(3000)
        n_blocos = len(voz.dividir_em_blocos(texto))
        self.assertGreaterEqual(n_blocos, 4)
        pedidos = self.simular([self.audio_n(i + 1) for i in range(n_blocos)])

        voz.sintetizar(texto, self.destino)

        self.assertEqual(len(pedidos), n_blocos)
        corpos = [json.loads(p.data.decode("utf-8")) for p in pedidos]
        self.assertNotIn("previous_request_ids", corpos[0])
        self.assertEqual(corpos[1]["previous_request_ids"], ["req-1"])
        self.assertEqual(corpos[2]["previous_request_ids"], ["req-1", "req-2"])
        self.assertEqual(corpos[3]["previous_request_ids"], ["req-1", "req-2", "req-3"])
        self.assertEqual(" ".join(c["text"] for c in corpos), texto)
        self.assertTrue(all(len(c["text"]) <= 900 for c in corpos))

        esperado = b"".join(self.bytes_n(i + 1) for i in range(n_blocos))
        self.assertEqual(self.destino.read_bytes(), esperado)           # bytes em sequência
        self.assertFalse(self.destino.with_name("saida.mp3.parcial").exists())

    def test_so_os_3_ultimos_ids(self):
        texto, _ = texto_de_ensaio(4500)
        n_blocos = len(voz.dividir_em_blocos(texto))
        self.assertGreaterEqual(n_blocos, 6)
        pedidos = self.simular([self.audio_n(i + 1) for i in range(n_blocos)])
        voz.sintetizar(texto, self.destino)
        corpos = [json.loads(p.data.decode("utf-8")) for p in pedidos]
        for i, corpo in enumerate(corpos[1:], start=1):                  # i = nº de blocos já enviados
            esperado = [f"req-{j}" for j in range(max(1, i - 2), i + 1)]
            self.assertEqual(corpo["previous_request_ids"], esperado)
        self.assertEqual(corpos[5]["previous_request_ids"], ["req-3", "req-4", "req-5"])

    def test_pedido_bem_formado(self):
        pedidos = self.simular([self.audio_n(1)])
        voz.sintetizar("Ave Maria, cheia de graça.", self.destino)
        pedido = pedidos[0]
        self.assertEqual(pedido.full_url,
                         "https://api.elevenlabs.io/v1/text-to-speech/VOZ123?output_format=mp3_44100_128")
        self.assertEqual(pedido.get_method(), "POST")
        self.assertEqual(pedido.get_header("Xi-api-key"), CHAVE)
        self.assertEqual(pedido.get_header("Content-type"), "application/json")
        self.assertEqual(json.loads(pedido.data.decode("utf-8")), {
            "text": "Ave Maria, cheia de graça.",
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {"stability": 0.6, "similarity_boost": 0.75, "style": 0.05,
                               "use_speaker_boost": True, "speed": 0.9},
        })

    def test_repete_num_429(self):
        pedidos = self.simular([erro_http(429, '{"detail":"too many"}'), self.audio_n(1)])
        voz.sintetizar("Ave Maria, cheia de graça.", self.destino)
        self.assertEqual(len(pedidos), 2)
        self.assertEqual(self.sleep.call_args_list, [mock.call(2)])
        self.assertTrue(self.destino.exists())

    def test_repete_num_5xx_com_espera_crescente_e_desiste_ao_fim(self):
        pedidos = self.simular([erro_http(503, "indisponível")] * 5)
        with self.assertRaises(voz.ErroVoz) as ctx:
            voz.sintetizar("Ave Maria, cheia de graça.", self.destino)
        self.assertNotIsInstance(ctx.exception, voz.ErroVozFatal)
        self.assertEqual(len(pedidos), 5)                                # 1 + 4 repetições
        self.assertEqual([c.args[0] for c in self.sleep.call_args_list], [2, 4, 8, 16])
        self.assertIn("503", str(ctx.exception))
        self.assertFalse(self.destino.exists())

    def test_erro_de_rede_tambem_repete(self):
        pedidos = self.simular([urllib.error.URLError("ligação caiu"), self.audio_n(1)])
        voz.sintetizar("Ave Maria, cheia de graça.", self.destino)
        self.assertEqual(len(pedidos), 2)

    def test_outro_codigo_da_erro_claro_sem_repetir(self):
        pedidos = self.simular([erro_http(422, '{"detail":"voice_settings invalidas"}')])
        with self.assertRaises(voz.ErroVoz) as ctx:
            voz.sintetizar("Ave Maria, cheia de graça.", self.destino)
        self.assertEqual(len(pedidos), 1)
        self.assertIn("422", str(ctx.exception))
        self.assertIn("voice_settings invalidas", str(ctx.exception))     # mostra o corpo
        self.assertEqual(self.sleep.call_count, 0)

    def test_401_e_fatal(self):
        self.simular([erro_http(401, '{"detail":"invalid api key"}')])
        with self.assertRaises(voz.ErroVozFatal):
            voz.sintetizar("Ave Maria, cheia de graça.", self.destino)

    def test_falha_a_meio_nao_deixa_ficheiros(self):
        texto, _ = texto_de_ensaio(3000)
        self.simular([self.audio_n(1), erro_http(400, "mau")])
        with self.assertRaises(voz.ErroVoz):
            voz.sintetizar(texto, self.destino)
        self.assertEqual(list(self.tmp.glob("saida*")), [])

    def test_sem_voice_id(self):
        self.escrever_config("elevenlabs", voice_id="")
        self.simular([])
        with self.assertRaises(voz.ErroVozFatal) as ctx:
            voz.sintetizar("Ave Maria.", self.destino)
        self.assertIn("voice_id", str(ctx.exception))
        self.assertEqual(self.urlopen.call_count, 0)


class Edge(Base):
    """O edge-tts às vezes responde «No audio was received» e, pedido outra vez,
    grava. O módulo edge_tts é simulado: nada vai à rede."""

    def setUp(self):
        super().setUp()
        sleep = mock.patch.object(voz.time, "sleep")
        self.sleep = sleep.start()
        self.addCleanup(sleep.stop)
        self.destino = self.tmp / "saida.mp3"

    def simular(self, resultados):
        """Cada save() devolve o resultado seguinte: bytes gravados ou uma excepção."""
        chamadas = []

        class Communicate:
            def __init__(self, texto, voz_, rate=None, pitch=None):
                self.args = (texto, voz_, rate, pitch)

            async def save(self, caminho):
                chamadas.append(self.args)
                resultado = resultados[len(chamadas) - 1]
                if isinstance(resultado, BaseException):
                    raise resultado
                Path(caminho).write_bytes(resultado)

        modulo = mock.Mock(Communicate=Communicate)
        patch = mock.patch.dict(sys.modules, {"edge_tts": modulo})
        patch.start()
        self.addCleanup(patch.stop)
        return chamadas

    def test_repete_quando_nao_vem_som(self):
        sem_som = RuntimeError("No audio was received. Please verify that your parameters are correct.")
        chamadas = self.simular([sem_som, sem_som, b"MP3" * 300])
        voz.sintetizar("Dizei entre as nações: O Senhor é Rei.", self.destino)
        self.assertEqual(len(chamadas), 3)
        self.assertEqual(chamadas[0], ("Dizei entre as nações: O Senhor é Rei.",
                                       "pt-PT-RaquelNeural", "-12%", "-2Hz"))
        self.assertEqual([c.args[0] for c in self.sleep.call_args_list], [5, 15])
        self.assertEqual(self.destino.read_bytes(), b"MP3" * 300)
        self.assertFalse(self.destino.with_name("saida.mp3.parcial").exists())

    def test_desiste_ao_fim_de_5_tentativas_sem_deixar_ficheiros(self):
        chamadas = self.simular([RuntimeError("No audio was received.")] * 5)
        with self.assertRaises(voz.ErroVoz) as ctx:
            voz.sintetizar("Ave Maria, cheia de graça.", self.destino)
        self.assertNotIsInstance(ctx.exception, voz.ErroVozFatal)
        self.assertEqual(len(chamadas), 5)
        self.assertEqual([c.args[0] for c in self.sleep.call_args_list], [5, 15, 30, 60])
        self.assertIn("5 tentativas", str(ctx.exception))
        self.assertEqual(list(self.tmp.glob("saida*")), [])

    def test_audio_vazio_tambem_repete(self):
        chamadas = self.simular([b"", b"MP3" * 300])
        voz.sintetizar("Ave Maria, cheia de graça.", self.destino)
        self.assertEqual(len(chamadas), 2)
        self.assertTrue(self.destino.exists())


class Chave(Base):
    def setUp(self):
        super().setUp()
        self.escrever_config("elevenlabs")
        self.destino = self.tmp / "saida.mp3"

    def test_sem_chave_da_erro_claro_e_nao_chama_nada(self):
        env = {k: v for k, v in os.environ.items() if k != "ELEVENLABS_API_KEY"}
        with mock.patch.dict(os.environ, env, clear=True), \
                mock.patch("urllib.request.urlopen") as urlopen:
            with self.assertRaises(voz.ErroVozFatal) as ctx:
                voz.sintetizar("Ave Maria, cheia de graça.", self.destino)
            with self.assertRaises(voz.ErroVozFatal):
                voz.preparar_motor()
        self.assertIn("ELEVENLABS_API_KEY", str(ctx.exception))
        self.assertEqual(urlopen.call_count, 0)
        self.assertEqual(list(self.tmp.glob("saida*")), [])

    def test_chave_vazia_conta_como_em_falta(self):
        with mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": "   "}):
            with self.assertRaises(voz.ErroVozFatal):
                voz.preparar_motor()

    def test_a_chave_nunca_e_impressa_nem_escrita_nem_aparece_em_erros(self):
        corpo_que_ecoa_a_chave = f'{{"detail":"chave {CHAVE} recusada"}}'
        saida, erros = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": CHAVE}), \
                mock.patch.object(voz.time, "sleep"), \
                mock.patch("urllib.request.urlopen", side_effect=erro_http(422, corpo_que_ecoa_a_chave)), \
                contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erros):
            with self.assertRaises(voz.ErroVoz) as ctx:
                voz.sintetizar("Ave Maria, cheia de graça.", self.destino)
            voz.identificacao()
            voz.descricao()
        self.assertNotIn(CHAVE, str(ctx.exception))
        self.assertIn("***", str(ctx.exception))
        self.assertEqual(saida.getvalue() + erros.getvalue(), "")
        for ficheiro in self.tmp.rglob("*"):
            if ficheiro.is_file():
                self.assertNotIn(CHAVE.encode(), ficheiro.read_bytes(), ficheiro)
        self.assertNotIn(CHAVE, voz.identificacao() + voz.descricao())


class ScriptsUsamAVoz(Base):
    """A ordem de regravar, os índices e o --estimar, com o motor substituído."""

    def setUp(self):
        super().setUp()
        self.chamadas = []

        def falso(texto, destino):
            self.chamadas.append((texto, Path(destino).name))
            Path(destino).write_bytes(b"x" * 700)

        p = mock.patch.object(voz, "sintetizar", side_effect=falso)
        self.sintetizar = p.start()
        self.addCleanup(p.stop)
        p = mock.patch.object(voz, "preparar_motor")
        p.start()
        self.addCleanup(p.stop)

        self.audio = self.tmp / "audio"
        self.audio.mkdir()
        self.textos = self.tmp / "textos.json"
        self.escrever_textos({"a": "Primeira oração.\nCom quebra.", "b": "Segunda oração."})
        for modulo, nome, valor in ((gerar_audio, "DESTINO", self.audio),
                                    (gerar_audio, "TEXTOS", self.textos)):
            p = mock.patch.object(modulo, nome, valor)
            p.start()
            self.addCleanup(p.stop)

    def escrever_textos(self, textos: dict):
        self.textos.write_text(json.dumps({"versao": "9.9.9", "itens": [
            {"id": ident, "texto": texto} for ident, texto in textos.items()
        ]}), encoding="utf-8")

    def indice_audio(self):
        return json.loads((self.audio / "index.json").read_text(encoding="utf-8"))

    def gravados(self):
        """Nomes dos MP3 que o motor (simulado) gravou, por ordem."""
        return [nome for _, nome in self.chamadas]

    def interromper_em(self, nome_mp3):
        """O motor grava normalmente até chegar a `nome_mp3`; aí simula um Ctrl+C."""
        def falso(texto, destino):
            if Path(destino).name == nome_mp3:
                raise KeyboardInterrupt
            self.chamadas.append((texto, Path(destino).name))
            Path(destino).write_bytes(b"x" * 700)
        self.sintetizar.side_effect = falso

    def correr_audio(self, *args):
        with contextlib.redirect_stdout(io.StringIO()):
            gerar_audio.principal(list(args))

    # --- orações ---

    def test_oracoes_indice_com_voz_e_nao_regrava_se_a_voz_for_a_mesma(self):
        self.correr_audio()
        self.assertEqual(len(self.chamadas), 2)
        self.assertEqual(self.chamadas[0][0], "Primeira oração. Com quebra.")
        indice = self.indice_audio()
        self.assertEqual(indice["voz"], "edge:pt-PT-RaquelNeural")
        self.assertEqual(indice["ficheiros"], ["a", "b"])
        self.assertEqual(indice["versao"], "9.9.9")
        self.correr_audio()
        self.assertEqual(len(self.chamadas), 2)                          # saltou as duas

    def test_oracoes_mudar_de_voz_regrava_tudo(self):
        self.correr_audio()
        self.escrever_config("elevenlabs")
        self.correr_audio()
        self.assertEqual(len(self.chamadas), 4)
        self.assertEqual(self.indice_audio()["voz"], "elevenlabs:VOZ123:eleven_multilingual_v2")
        self.correr_audio()
        self.assertEqual(len(self.chamadas), 4)

    def impressoes_atuais(self, textos):
        parametros = gerar_audio.parametros_do_motor()
        return {i: gerar_audio.impressao(gerar_audio.preparar(t), parametros) for i, t in textos.items()}

    def test_oracoes_indice_antigo_sem_motor_nao_obriga_a_regravar(self):
        for ident in ("a", "b"):
            (self.audio / f"{ident}.mp3").write_bytes(b"x" * 700)
        textos = {"a": "Primeira oração.\nCom quebra.", "b": "Segunda oração."}
        antigo = {"versao": "3.0.0", "voz": "pt-PT-RaquelNeural", "ficheiros": ["a", "b"],
                  "impressoes": self.impressoes_atuais(textos)}
        (self.audio / "index.json").write_text(json.dumps(antigo), encoding="utf-8")
        self.correr_audio()
        self.assertEqual(self.chamadas, [])                              # "pt-PT-…" conta como "edge:pt-PT-…"
        self.assertEqual(self.indice_audio(), antigo)                    # nada gravado: índice intacto

    def test_oracoes_voz_da_linha_de_comandos_tambem_regrava(self):
        self.correr_audio()
        self.correr_audio("--voz", "pt-PT-DuarteNeural")
        self.assertEqual(len(self.chamadas), 4)
        self.assertEqual(self.indice_audio()["voz"], "edge:pt-PT-DuarteNeural")

    def test_oracoes_forcar(self):
        self.correr_audio()
        self.correr_audio("--forcar")
        self.assertEqual(len(self.chamadas), 4)

    def test_oracoes_erro_fatal_para_e_deixa_de_fora_so_o_que_falhou(self):
        self.sintetizar.side_effect = voz.ErroVozFatal("sem chave")
        with self.assertRaises(SystemExit) as ctx, contextlib.redirect_stdout(io.StringIO()):
            gerar_audio.principal([])
        self.assertEqual(ctx.exception.code, 1)
        self.assertEqual(self.sintetizar.call_count, 1)                  # não insistiu na segunda
        self.assertFalse((self.audio / "index.json").exists())           # nada gravado: nada escrito

    def test_oracoes_estimar_nao_chama_o_motor_nem_escreve(self):
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            gerar_audio.principal(["--estimar"])
        self.assertEqual(self.chamadas, [])
        self.assertEqual(list(self.audio.iterdir()), [])
        n_a = len("Primeira oração. Com quebra.")
        n_b = len("Segunda oração.")
        self.assertIn(f"{n_a + n_b} caracteres", saida.getvalue())

    def test_oracoes_estimar_com_elevenlabs_sem_chave(self):
        self.escrever_config("elevenlabs", voice_id="")                  # nem voz nem chave
        env = {k: v for k, v in os.environ.items() if k != "ELEVENLABS_API_KEY"}
        saida = io.StringIO()
        with mock.patch.dict(os.environ, env, clear=True), mock.patch("urllib.request.urlopen") as urlopen, \
                contextlib.redirect_stdout(saida):
            gerar_audio.principal(["--estimar"])
        self.assertEqual(urlopen.call_count, 0)
        self.assertEqual(self.chamadas, [])
        self.assertIn("2 pedidos", saida.getvalue())

    def test_oracoes_estimar_no_projeto_real_nao_mexe_em_audio(self):
        real = RAIZ / "audio" / "index.json"
        antes = hashlib.sha256(real.read_bytes()).hexdigest() if real.exists() else None
        n_ficheiros = len(list((RAIZ / "audio").glob("*")))
        with mock.patch.object(gerar_audio, "DESTINO", RAIZ / "audio"), \
                mock.patch.object(gerar_audio, "TEXTOS", RAIZ / "ferramentas" / "textos.json"), \
                contextlib.redirect_stdout(io.StringIO()):
            gerar_audio.principal(["--estimar"])
        self.assertEqual(self.chamadas, [])
        depois = hashlib.sha256(real.read_bytes()).hexdigest() if real.exists() else None
        self.assertEqual(antes, depois)
        self.assertEqual(n_ficheiros, len(list((RAIZ / "audio").glob("*"))))

    # --- orações: impressão do texto e dos parâmetros do motor ---

    def test_oracoes_texto_mudado_so_regrava_esse(self):
        self.correr_audio()
        self.escrever_textos({"a": "Primeira oração.\nCom quebra.", "b": "Segunda oração, revista."})
        self.correr_audio()
        self.assertEqual(self.gravados(), ["a.mp3", "b.mp3", "b.mp3"])
        self.assertEqual(self.chamadas[-1][0], "Segunda oração, revista.")
        indice = self.indice_audio()
        self.assertEqual(indice["ficheiros"], ["a", "b"])
        self.assertEqual(sorted(indice["impressoes"]), ["a", "b"])
        self.correr_audio()
        self.assertEqual(len(self.chamadas), 3)                          # já não há nada a regravar

    def test_oracoes_estimar_conta_o_texto_mudado(self):
        self.correr_audio()
        self.escrever_textos({"a": "Primeira oração.\nCom quebra.", "b": "Segunda oração, revista."})
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            gerar_audio.principal(["--estimar"])
        self.assertEqual(len(self.chamadas), 2)
        self.assertRegex(saida.getvalue(), r"existia\s+a\s")
        self.assertRegex(saida.getvalue(), r"a gravar b\s")
        self.assertIn("(só o que falta, mudou de texto ou de voz): 1 orações", saida.getvalue())

    def test_oracoes_indice_antigo_sem_impressoes_regrava_porque_o_texto_e_desconhecido(self):
        # Sem impressão não se sabe com que texto foi gravada: aceitá-la carimbava
        # como atual uma gravação de um texto que entretanto mudou em data.js.
        for ident in ("a", "b"):
            (self.audio / f"{ident}.mp3").write_bytes(b"x" * 700)
        (self.audio / "index.json").write_text(json.dumps(
            {"versao": "9.9.9", "voz": "edge:pt-PT-RaquelNeural", "ficheiros": ["a", "b"]}), encoding="utf-8")
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            gerar_audio.principal(["--estimar"])
        self.assertIn("(só o que falta, mudou de texto ou de voz): 2 orações", saida.getvalue())
        self.correr_audio()
        self.assertEqual(self.gravados(), ["a.mp3", "b.mp3"])
        indice = self.indice_audio()
        self.assertEqual(indice["ficheiros"], ["a", "b"])
        self.assertEqual(sorted(indice["impressoes"]), ["a", "b"])
        self.escrever_textos({"a": "Primeira oração, revista.", "b": "Segunda oração."})
        self.correr_audio()
        self.assertEqual(self.gravados(), ["a.mp3", "b.mp3", "a.mp3"])   # daqui em diante, só o que muda

    def test_oracoes_versoes_vem_do_mp3_e_mudam_com_outra_gravacao_do_mesmo_texto(self):
        n = [0]
        def falso(texto, destino):
            n[0] += 1
            self.chamadas.append((texto, Path(destino).name))
            Path(destino).write_bytes(b"take %d" % n[0])
        self.sintetizar.side_effect = falso
        self.correr_audio()
        v1 = self.indice_audio()["versoes"]
        self.assertEqual(v1["a"], hashlib.sha1(b"take 1").hexdigest()[:12])
        self.correr_audio("--forcar")                                    # mesmo texto, outro take
        v2 = self.indice_audio()["versoes"]
        self.assertNotEqual(v1["a"], v2["a"])                            # endereço novo na app
        self.assertNotEqual(v1["b"], v2["b"])
        self.assertEqual(self.indice_audio()["impressoes"]["a"],
                         self.impressoes_atuais({"a": "Primeira oração.\nCom quebra."})["a"])

    def test_oracoes_ctrl_c_antes_de_gravar_nao_mexe_no_indice(self):
        self.correr_audio()
        antes = self.indice_audio()
        self.escrever_config("elevenlabs")                               # voz nova: tudo a regravar
        self.interromper_em("a.mp3")                                     # Ctrl+C na primeira
        with self.assertRaises(KeyboardInterrupt), contextlib.redirect_stdout(io.StringIO()):
            gerar_audio.principal([])
        self.assertEqual(self.indice_audio(), antes)                     # o edge continua a valer
        self.escrever_config("edge")
        self.interromper_em(None)
        self.correr_audio()
        self.assertEqual(len(self.chamadas), 2)                          # nada pago outra vez

    def test_oracoes_forcar_interrompido_mantem_os_que_ainda_nao_regravou(self):
        textos = {"a": "Primeira oração.", "b": "Segunda oração.", "c": "Terceira oração."}
        self.escrever_textos(textos)
        self.correr_audio()
        self.interromper_em("b.mp3")
        with self.assertRaises(KeyboardInterrupt), contextlib.redirect_stdout(io.StringIO()):
            gerar_audio.principal(["--forcar"])
        self.assertEqual(self.indice_audio()["ficheiros"], ["a", "b", "c"])
        self.interromper_em(None)
        self.correr_audio()
        self.assertEqual(self.gravados(), ["a.mp3", "b.mp3", "c.mp3", "a.mp3"])   # sem --forcar: nada

    def test_oracoes_parametro_do_motor_mudado_regrava(self):
        self.correr_audio()
        self.correr_audio("--ritmo=-5%")                                 # edge: mesma voz, outro ritmo
        self.assertEqual(len(self.chamadas), 4)
        self.assertEqual(self.indice_audio()["voz"], "edge:pt-PT-RaquelNeural")
        self.correr_audio("--ritmo=-5%")
        self.assertEqual(len(self.chamadas), 4)

        self.escrever_config("elevenlabs")
        self.correr_audio()
        self.assertEqual(len(self.chamadas), 6)
        cfg = json.loads(self.config.read_text(encoding="utf-8"))
        cfg["elevenlabs"]["stability"] = 0.4                             # elevenlabs: mesma voz, outra estabilidade
        self.config.write_text(json.dumps(cfg), encoding="utf-8")
        self.correr_audio()
        self.assertEqual(len(self.chamadas), 8)
        self.correr_audio()
        self.assertEqual(len(self.chamadas), 8)

    # --- orações: interrupção a meio ---

    def test_oracoes_interrompido_com_voz_nova_indice_na_voz_nova_com_o_ja_gravado(self):
        self.correr_audio()                                              # a e b com o edge
        self.escrever_config("elevenlabs")
        indices_vistos = []
        original = self.interromper_em
        original("b.mp3")
        interromper = self.sintetizar.side_effect

        def espreitar(texto, destino):
            if Path(destino).name == "b.mp3":                            # o índice já foi escrito depois de "a",
                indices_vistos.append(self.indice_audio())               # antes do finally (cobre um kill a seco)
            return interromper(texto, destino)
        self.sintetizar.side_effect = espreitar

        with self.assertRaises(KeyboardInterrupt), contextlib.redirect_stdout(io.StringIO()):
            gerar_audio.principal([])
        self.assertEqual(indices_vistos[0]["ficheiros"], ["a"])
        self.assertEqual(indices_vistos[0]["voz"], "elevenlabs:VOZ123:eleven_multilingual_v2")
        indice = self.indice_audio()
        self.assertEqual(indice["voz"], "elevenlabs:VOZ123:eleven_multilingual_v2")
        self.assertEqual(indice["ficheiros"], ["a"])
        self.assertEqual(sorted(indice["impressoes"]), ["a"])
        self.assertFalse((self.audio / "index.json.parcial").exists())

        self.interromper_em(None)
        self.correr_audio()
        self.assertEqual(self.gravados(), ["a.mp3", "b.mp3", "a.mp3", "b.mp3"])   # só "b" foi paga outra vez
        self.assertEqual(self.indice_audio()["ficheiros"], ["a", "b"])

    def test_oracoes_interrompido_com_a_mesma_voz_os_nao_visitados_continuam_listados(self):
        textos = {"a": "Primeira oração.", "b": "Segunda oração.", "c": "Terceira oração."}
        self.escrever_textos(textos)
        self.correr_audio()
        impressao_c = self.indice_audio()["impressoes"]["c"]
        self.escrever_textos({**textos, "a": "Primeira oração, revista.", "b": "Segunda oração, revista."})
        self.interromper_em("b.mp3")
        with self.assertRaises(KeyboardInterrupt), contextlib.redirect_stdout(io.StringIO()):
            gerar_audio.principal([])
        indice = self.indice_audio()
        self.assertEqual(indice["voz"], "edge:pt-PT-RaquelNeural")
        # "b" continua listada (o MP3 é válido, com o texto velho) mas com a
        # impressão velha, para a corrida seguinte a regravar.
        self.assertEqual(indice["ficheiros"], ["a", "b", "c"])
        self.assertNotEqual(indice["impressoes"]["b"],
                            self.impressoes_atuais({"b": "Segunda oração, revista."})["b"])
        self.assertEqual(indice["impressoes"]["c"], impressao_c)

        self.interromper_em(None)
        self.correr_audio()
        self.assertEqual(self.gravados(), ["a.mp3", "b.mp3", "c.mp3", "a.mp3", "b.mp3"])
        self.assertEqual(self.indice_audio()["ficheiros"], ["a", "b", "c"])

    # --- leituras ---

    def preparar_leituras(self):
        self.leituras = self.tmp / "leituras"
        p = mock.patch.object(gerar_leituras, "DESTINO", self.leituras)
        p.start()
        self.addCleanup(p.stop)
        texto = "Leitura do dia. " * 6
        p = mock.patch.object(gerar_leituras, "buscar",
                              side_effect=lambda dia: {"primeira": texto, "evangelho": texto + " «Amen»."})
        p.start()
        self.addCleanup(p.stop)

    def correr_leituras(self, *args):
        with contextlib.redirect_stdout(io.StringIO()):
            gerar_leituras.principal(list(args))

    def test_leituras_indice_com_voz_formato_da_app_e_salta_o_que_ja_existe(self):
        self.preparar_leituras()
        self.correr_leituras("--dias", "2")
        self.assertEqual(len(self.chamadas), 4)
        indice = json.loads((self.leituras / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(indice["voz"], "edge:pt-PT-RaquelNeural")
        self.assertEqual(len(indice["dias"]), 2)                         # a app lê só "dias"
        for dia, chaves in indice["dias"].items():
            self.assertEqual(chaves, ["primeira", "evangelho"])
            for chave in chaves:
                self.assertTrue((self.leituras / f"{dia}-{chave}.mp3").exists())
        self.assertNotIn("«", self.chamadas[1][0])                       # preparar() mantém-se
        self.correr_leituras("--dias", "2")
        self.assertEqual(len(self.chamadas), 4)

    def test_leituras_mudar_de_voz_regrava(self):
        self.preparar_leituras()
        self.correr_leituras("--dias", "1")
        self.escrever_config("elevenlabs")
        self.correr_leituras("--dias", "1")
        self.assertEqual(len(self.chamadas), 4)
        indice = json.loads((self.leituras / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(indice["voz"], "elevenlabs:VOZ123:eleven_multilingual_v2")

    def test_leituras_estimar_nao_chama_o_motor_nem_cria_nada(self):
        self.preparar_leituras()
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            gerar_leituras.principal(["--dias", "2", "--estimar"])
        self.assertEqual(self.chamadas, [])
        self.assertFalse(self.leituras.exists())
        n = len(gerar_leituras.preparar("Leitura do dia. " * 6))
        m = len(gerar_leituras.preparar("Leitura do dia. " * 6 + " «Amen»."))
        self.assertIn(f"{2 * (n + m)} caracteres", saida.getvalue())

    def test_leituras_feed_falha_num_dia_mantem_o_que_estava_gravado(self):
        self.preparar_leituras()
        self.correr_leituras("--dias", "2")
        self.assertEqual(len(self.chamadas), 4)
        dias = sorted(json.loads((self.leituras / "index.json").read_text(encoding="utf-8"))["dias"])

        def feed(dia):
            if dia.strftime("%Y%m%d") == dias[1]:
                raise OSError("feed em baixo")
            return {"primeira": "Leitura do dia. " * 6, "evangelho": "Leitura do dia. " * 6 + " «Amen»."}
        gerar_leituras.buscar.side_effect = feed
        self.correr_leituras("--dias", "2")
        self.assertEqual(len(self.chamadas), 4)                          # nada pago outra vez
        indice = json.loads((self.leituras / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(sorted(indice["dias"]), dias)                   # o dia sem feed continua no índice
        self.assertEqual(indice["dias"][dias[1]], ["primeira", "evangelho"])

        gerar_leituras.buscar.side_effect = lambda dia: {}               # feed vazio: o mesmo
        self.correr_leituras("--dias", "2")
        self.assertEqual(len(self.chamadas), 4)
        indice = json.loads((self.leituras / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(sorted(indice["dias"]), dias)

    def test_leituras_buscar_tenta_de_novo_antes_de_desistir(self):
        respostas = [OSError("timeout"), {}, {"evangelho": "texto"}]
        def ler(dia):
            r = respostas.pop(0)
            if isinstance(r, Exception):
                raise r
            return r
        with mock.patch.object(gerar_leituras, "_ler_feed", side_effect=ler), \
                mock.patch.object(gerar_leituras.time, "sleep") as dormir:
            self.assertEqual(gerar_leituras.buscar(None), {"evangelho": "texto"})
        self.assertEqual([c.args[0] for c in dormir.call_args_list], [3, 6])
        with mock.patch.object(gerar_leituras, "_ler_feed", side_effect=OSError("em baixo")), \
                mock.patch.object(gerar_leituras.time, "sleep"):
            with self.assertRaises(OSError):
                gerar_leituras.buscar(None)

    def test_leituras_publica_o_texto_do_feed_e_limpa_o_antigo(self):
        self.leituras = self.tmp / "leituras"
        p = mock.patch.object(gerar_leituras, "DESTINO", self.leituras)
        p.start()
        self.addCleanup(p.stop)
        texto = "Leitura do dia, com texto suficiente para contar. " * 2
        xml = ("<?xml version='1.0' encoding='UTF-8'?><data-set><evangelizo>"
               f"<reading_text1>{texto}</reading_text1><reading_gospel>{texto}</reading_gospel>"
               "</evangelizo></data-set>")

        class Resposta(RespostaFalsa):
            pass

        self.leituras.mkdir(parents=True)
        (self.leituras / "20000101.xml").write_text("<antigo/>", encoding="utf-8")
        with mock.patch("urllib.request.urlopen", return_value=Resposta(xml.encode("utf-8"))):
            self.correr_leituras("--dias", "2")
        xmls = sorted(p.name for p in self.leituras.glob("*.xml"))
        self.assertEqual(len(xmls), 2)                                   # um por dia; o antigo saiu
        self.assertNotIn("20000101.xml", xmls)
        self.assertEqual((self.leituras / xmls[0]).read_text(encoding="utf-8"), xml)

    def test_leituras_erro_fatal_sai_com_erro(self):
        self.preparar_leituras()
        self.sintetizar.side_effect = voz.ErroVozFatal("sem chave")
        with self.assertRaises(SystemExit), contextlib.redirect_stdout(io.StringIO()):
            gerar_leituras.principal(["--dias", "2"])
        self.assertEqual(self.sintetizar.call_count, 1)


@unittest.skipUnless("--edge" in sys.argv, "teste real do edge-tts: correr com --edge")
class EdgeReal(unittest.TestCase):
    def test_uma_frase_curta(self):
        # Usa o voz.json do projeto (motor edge) e grava só na pasta temporária do sistema.
        self.assertEqual(voz.configuracao()["motor"], "edge")
        with tempfile.TemporaryDirectory() as pasta:
            destino = Path(pasta) / "frase.mp3"
            voz.sintetizar("Ave Maria, cheia de graça, o Senhor é convosco.", destino)
            dados = destino.read_bytes()
            self.assertGreater(len(dados), 2000)
            self.assertTrue(dados[:3] == b"ID3" or dados[0] == 0xFF, "não parece MP3")
            self.assertEqual(list(Path(pasta).glob("*.parcial")), [])
            print(f"\n  edge real: {len(dados)} bytes em {destino}")


if __name__ == "__main__":
    unittest.main(argv=[a for a in sys.argv if a != "--edge"], verbosity=2)
