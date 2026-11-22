# ✝ Oração Diária

PWA em português de Portugal com as leituras do dia, o terço guiado e voz própria, que funciona
sem internet. **As instruções completas estão no [`LEIA-ME.md`](LEIA-ME.md)** (testar, publicar,
voz, regravar orações, manutenção anual). Este README é o ponto de partida para continuar o
projeto noutro computador: deve ler-se todo antes de mexer em qualquer coisa.

---

## Começar noutro PC

1. Instalar as ferramentas (num terminal PowerShell):

   ```powershell
   winget install --id Git.Git
   winget install --id GitHub.cli
   ```

   **Fechar e abrir um terminal novo** depois de instalar, senão os comandos não são reconhecidos.
   Para as ferramentas de voz é preciso também Python 3 e Node.js
   (`winget install --id Python.Python.3.12` e `winget install --id OpenJS.NodeJS.LTS`).

2. Entrar no GitHub com a conta **tonisilva5** (é preciso para enviar alterações):

   ```powershell
   gh auth login
   ```

   Escolher *GitHub.com* → *HTTPS* → responder **Yes** a *Authenticate Git with your GitHub
   credentials* → *Login with a web browser*.

3. Descarregar o projeto e testar:

   ```powershell
   gh repo clone tonisilva5/oracao_diaria
   cd oracao_diaria
   python -m http.server 8123
   ```

   Abrir **http://127.0.0.1:8123**.

4. Antes do primeiro commit, pôr a identidade do projeto, para não ir nenhum nome nem email
   pessoal para o histórico (o endereço é o anónimo que o GitHub dá à conta):

   ```powershell
   git config user.name "Oracao Diaria"
   git config user.email "279363222+tonisilva5@users.noreply.github.com"
   ```

### Em Linux (Ubuntu)

```bash
sudo apt install -y git gh nodejs python3-venv
gh auth login && gh auth setup-git
gh repo clone tonisilva5/oracao_diaria "Oracao Diaria"
cd "Oracao Diaria"
git config user.name "Oracao Diaria"
git config user.email "279363222+tonisilva5@users.noreply.github.com"
python3 -m http.server 8123 --bind 127.0.0.1
```

Para a voz, o Python do sistema não aceita `pip install`: cria-se um ambiente dentro da
pasta (`python3 -m venv .venv && .venv/bin/pip install edge-tts`) e usa-se `.venv/bin/python`
onde o `LEIA-ME.md` diz `python`. A chave do ElevenLabs, se algum dia for precisa, define-se
só na janela do terminal, sem aparecer no ecrã nem ficar no histórico:
`read -rs ELEVENLABS_API_KEY && export ELEVENLABS_API_KEY`.

---

## Estado (22 de novembro de 2026)

| Onde | O que tem |
|---|---|
| Ramo `master` | Versão `3.2.0`. Leituras, terço, voz `edge` (gratuita), offline. Testada em local: terço completo com a voz gravada, leituras gravadas, e abre sem servidor. |
| Histórico | Recomeçado a 22/11/2026 a partir da versão 3.2.0. |
| Publicação | **Publicada** em **https://tonisilva5.github.io/oracao_diaria/**: GitHub Pages a servir o ramo `gh-pages` deste repositório, que é público. Verificada a 22/11/2026: abre, leituras com voz gravada, terço com voz guiada e orações guardadas para offline. |
| Automação | *Áudio das leituras* corre todos os dias às 03:40 UTC e a cada envio para o `master`: grava as leituras dos próximos 4 dias e volta a publicar o site. |

---

## Próximos passos

1. **Instalar no iPhone:** *Instalar no iPhone*, no `LEIA-ME.md`.
2. **Intenção do Papa de dezembro de 2026:** foi traduzida da versão inglesa, porque a 22/11 ainda
   não havia texto português publicado (a de novembro já tem o texto oficial). Trocar pelo texto
   oficial quando sair (redemundialdeoracaodopapa.pt e popesprayer.va/pt-pt), regravar `papa-12`
   e subir a versão em `data.js` (`APP_VERSION`) e em `sw.js` (`VERSAO`).
3. **Janeiro de 2027:** pôr as intenções novas (*Manutenção anual* no `LEIA-ME.md`). Até lá, a
   partir de 1 de janeiro a app reza «Pelas intenções do Santo Padre», e não as de 2026.

---

## Regras do projeto

Valem para quem continuar o trabalho.

- **Português europeu** em tudo.
- **Textos das orações:** a referência é o **santidade.net** (Pe. Duarte Sousa Lara, Diocese de
  Lamego, https://www.santidade.net/oracoes.htm). Onde o site tem a oração, manda o site. Para as
  intenções do Papa, a referência é a Rede Mundial de Oração do Papa (versão portuguesa).
- O **liturgia.pt** bloqueia acessos automáticos (Cloudflare) e não se usa. As leituras vêm do
  Evangelizo, que serve o Lecionário português e deixa a app ler diretamente.
- **Sem referências de autoria** no repositório: nenhum nome nem email pessoal, nem nos ficheiros
  nem nos commits, e nenhuma linha de co-autoria (`Co-Authored-By`) nas mensagens. Os commits
  usam a identidade do projeto configurada no repositório (ver *Começar noutro PC*).
- **Não mudar os `id`** das orações em `data.js`. Cada `id` é o nome do seu áudio (`audio/<id>.mp3`)
  e a entrada em `audio/index.json`.
- **Depois de mudar textos** em `data.js`, correr `node --check data.js` e
  `node ferramentas/extrair_textos.js`. O commit leva `data.js` e `ferramentas/textos.json`, com
  os `id` alterados na mensagem.
- A **chave do ElevenLabs** nunca vai para ficheiros do projeto (*A chave do ElevenLabs* no `LEIA-ME.md`).
