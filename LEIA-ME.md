# ✝ Oração Diária

Aplicação em português de Portugal para iPhone (e qualquer telemóvel ou computador) com:

- **Leituras do dia** da Igreja Católica — 1.ª leitura, salmo, 2.ª leitura, Evangelho e santo
  do dia, com o texto do Lecionário português;
- **Terço guiado passo a passo**, como se reza em Portugal, com os mistérios de cada dia da
  semana e as intenções de oração do Papa;
- **Voz própria** — as orações do terço e as leituras do dia são lidas pela mesma voz
  portuguesa gravada, não pela voz metálica do sistema;
- Funciona **sem internet** depois da primeira utilização; instala-se no ecrã principal como
  uma aplicação.

É uma PWA (*Progressive Web App*). Uma app nativa para a App Store exigiria um Mac com Xcode.
A PWA dá a mesma experiência: ícone próprio, ecrã inteiro, offline e voz, instalada a partir
do Safari.

---

## Testar no computador

```bash
python -m http.server 8123
```

(Em Linux, `python3 -m http.server 8123 --bind 127.0.0.1`.) Depois abra **http://127.0.0.1:8123**. O terço tem de ser aberto por um endereço `http://` ou
`https://` — a partir de `file://` o modo offline e as gravações não funcionam.

---

## Publicar e instalar no iPhone

A app está publicada em **https://tonisilva5.github.io/oracao_diaria/**, pelo GitHub Pages,
a partir do ramo `gh-pages` do repositório público `tonisilva5/oracao_diaria`.

O ramo `gh-pages` é feito pela automatização *Áudio das leituras*
(`.github/workflows/audio-leituras.yml`). Corre todos os dias às 03:40 UTC e a cada envio para
o `master`: grava as leituras dos próximos 4 dias e volta a publicar o site. Num repositório
público, o GitHub desliga as corridas agendadas ao fim de 60 dias sem atividade, e por isso o
último passo da automatização volta a ligá-la todos os dias.

### Instalar no iPhone

1. No **iPhone**, abra https://tonisilva5.github.io/oracao_diaria/ no **Safari** →
   **Partilhar** → **Adicionar ao ecrã principal**.
2. Abra a app pelo ícone, vá a **Definições** e toque em **Guardar orações no telemóvel**.
   A partir daí o terço funciona sem rede.

### Montar a publicação de raiz (noutro repositório)

A app precisa de um endereço **https** para instalar e funcionar offline. **Não use o Netlify
Drop sem conta**: esses sites são temporários e desaparecem ao fim de algumas semanas — foi o
que fez a app deixar de abrir da primeira vez. O GitHub Pages é permanente e gratuito, mas só
para repositórios públicos.

1. Crie um repositório novo em **https://github.com/new**, por exemplo `oracao-diaria`,
   marcado como **Public**.
2. Na página do repositório, **Add file → Upload files**, arraste **todo o conteúdo** desta
   pasta — incluindo as pastas `audio/`, `icons/`, `ferramentas/` e `.github/`, e os ficheiros
   `.nojekyll` e `.gitignore` — e confirme com *Commit changes*.
3. **Só se a voz for do ElevenLabs** (`"motor": "elevenlabs"` em `ferramentas/voz.json`): vá a
   **Settings → Secrets and variables → Actions → New repository secret**, nome
   `ELEVENLABS_API_KEY`, e cole lá a chave da sua conta ElevenLabs. Fica guardada pelo GitHub e
   nunca aparece no código nem nos registos.
4. Vá a **Actions**, aceite ativar os fluxos de trabalho, escolha **Áudio das leituras** e
   carregue em **Run workflow**. Isto grava as leituras dos próximos dias e cria o ramo
   `gh-pages` com o site.
5. Vá a **Settings → Pages**, em *Source* escolha **Deploy from a branch**, ramo **`gh-pages`**,
   pasta `/ (root)`, e guarde.
6. Ao fim de um minuto fica com o endereço `https://<utilizador>.github.io/oracao-diaria/`.
7. No **iPhone**, abra esse endereço no **Safari** → **Partilhar** → **Adicionar ao ecrã
   principal**.
8. Abra a app pelo ícone, vá a **Definições** e toque em **Guardar orações no telemóvel**.
   A partir daí o terço funciona sem rede.

A partir daqui não há nada a fazer: todos os dias de madrugada a automatização grava as
leituras seguintes e volta a publicar o site. Só grava os dias novos — os que já estão
publicados são reaproveitados.

> Se preferir uma instalação sem automatização, salte os passos 3 a 5 e sirva o site
> diretamente do ramo `main`. As orações continuam gravadas; só as leituras do dia é que
> passam a ser lidas pela voz do telemóvel.

*(Cloudflare Pages e Netlify com conta funcionam igualmente bem para o passo 5.)*

### Ao publicar uma versão nova

A app abre **sempre** a partir da cópia guardada no telemóvel — é isso que a mantém de pé
mesmo que o site esteja em baixo. A contrapartida: **uma alteração ao código só chega aos
telemóveis já instalados se mudar o número de versão**, em dois sítios — `APP_VERSION` em
`data.js` e `VERSAO` em `sw.js`. A versão nova instala-se inteira ou não se instala, e entra
na vez seguinte em que a app é aberta.

Se regravar **orações** (voz nova ou texto corrigido), basta isso mesmo: subir a versão. O
`audio/index.json` guarda uma impressão de cada gravação, e a app pede cada oração com essa
impressão no endereço — uma oração regravada vai à rede, as outras continuam a sair do
telemóvel. Sem rede, toca a gravação anterior até a nova chegar.

Cada envio para o ramo principal volta a publicar o site sozinho (alguns minutos depois).

---

## A voz

Orações e leituras usam **a mesma voz**, escolhida num só sítio: `ferramentas/voz.json`.

| `"motor"` | O que é | Custo |
|---|---|---|
| `"elevenlabs"` | Voz humana do ElevenLabs; a voz e as definições ficam na secção `elevenlabs` (`voice_id`, modelo, estabilidade, velocidade) | Plano pago — ver abaixo |
| `"edge"` | Voz neural da Microsoft (edge-tts), de acesso não oficial | Gratuito |

As **orações** gravam-se uma vez no computador e ficam em `audio/*.mp3`. As **leituras**
gravam-se todos os dias na automatização do GitHub e ficam em `audio/leituras/`. Os dois
índices (`audio/index.json` e `audio/leituras/index.json`) registam a voz usada; mudar de voz
em `voz.json` obriga a regravar. Se uma gravação faltar, a app lê esse texto com a voz do
telemóvel — nunca fica calada.

**Créditos do ElevenLabs** (contas em caracteres; confirme os preços no site):

| O quê | Caracteres |
|---|---|
| As 50 orações, uma vez | ~11 400 |
| Leituras diárias | ~2 600/dia · ~80 000/mês |

Só as orações cabem no plano *Starter* (30 000/mês, basta um mês). Orações e leituras com a
mesma voz pedem o *Creator* (121 000/mês).

### A chave do ElevenLabs

A chave **nunca** se escreve em ficheiros do projeto. No GitHub vai como segredo (passo 3 da
publicação). No computador, define-se só na janela do terminal onde vai gravar — pedida
assim, não aparece no ecrã nem fica no histórico do PowerShell:

```powershell
$s = Read-Host 'Chave ElevenLabs' -AsSecureString; $env:ELEVENLABS_API_KEY = [Net.NetworkCredential]::new('', $s).Password
```

Não escreva `$env:ELEVENLABS_API_KEY = "…"` com a chave à vista: o PowerShell guarda cada
linha num ficheiro de histórico.

### Regravar as orações

Sempre que alterar um texto em `data.js` ou mudar de voz:

```bash
node ferramentas/extrair_textos.js
python ferramentas/gerar_audio.py --estimar
python ferramentas/gerar_audio.py
```

O `--estimar` só conta os caracteres que iria gastar, sem gravar nada. Sem opções, grava só o
que falta, o que mudou de texto e, se a voz ou as definições dela mudaram, tudo; para
regravar tudo à força, `--forcar`. Se a gravação for interrompida, o que já ficou gravado não
volta a ser pago. Com o motor `edge` é preciso antes `pip install edge-tts`. Depois de
regravar, suba a versão (ver *Ao publicar uma versão nova*).

Em **Linux** o Python do sistema não aceita `pip install`. Instale o `edge-tts` num ambiente
dentro da pasta (`python3 -m venv .venv && .venv/bin/pip install edge-tts`; o `.gitignore` já
exclui o `.venv/`) e use `.venv/bin/python` onde acima está `python`.

Testes do motor de voz, sem gastar créditos: `python ferramentas/testar_voz.py`.

---

## Manutenção anual — intenções do Papa

As **intenções mensais do Papa** estão em `data.js`, na secção `INTENCOES_PAPA`. Todos os anos
há 12 intenções novas: mude o `ano`, edite as intenções e **regrave os áudios** (`papa-01` a
`papa-12`). Um mês que ainda não tenha intenção (o texto português sai mês a mês) pode ficar
de fora da lista.

Enquanto o ano não é atualizado, e em qualquer mês que falte na lista, a app reza **«Pelas
intenções do Santo Padre»** (a intenção geral, `papa-geral`), e nunca a intenção do mesmo mês
de outro ano. No ecrã inicial aparece então o aviso «A intenção deste mês ainda não está na
aplicação».

Confirme sempre a formulação oficial em:

- https://www.popesprayer.va/pt-pt/
- https://redemundialdeoracaodopapa.pt/

---

## Fontes

- **Leituras litúrgicas:** serviço *Evangelizo.org*, que serve o texto do Lecionário português.
- **Textos das orações:** santidade.net (Pe. Duarte Sousa Lara, Diocese de Lamego). Onde o site
  tem a oração, manda o site.
- **Estrutura do terço:** Santuário de Fátima (fatima.pt) e paróquias portuguesas.
- **Ladainha de Nossa Senhora:** sem as três invocações acrescentadas em 2020 (Mãe da
  misericórdia, Mãe da esperança, Amparo dos migrantes).
- **Intenções de oração do Papa:** Rede Mundial de Oração do Papa, versão portuguesa
  (Apostolado da Oração).

---

## Estrutura dos ficheiros

| Ficheiro | Função |
|---|---|
| `index.html` | Estrutura da app |
| `styles.css` | Aspeto visual (modo claro e escuro) |
| `data.js` | Orações, mistérios e intenções do Papa |
| `app.js` | Lógica: leituras, terço e voz |
| `sw.js` | Funcionamento offline |
| `manifest.webmanifest` | Instalação no ecrã principal |
| `icons/` | Ícones da app |
| `audio/` | Orações gravadas e o seu índice (`audio/leituras/` é gerada pela automatização) |
| `ferramentas/voz.json` | Motor e voz — o único sítio onde se escolhe a voz |
| `ferramentas/voz.py` | A única peça que fala com o motor de voz |
| `ferramentas/gerar_audio.py` | Grava as orações |
| `ferramentas/gerar_leituras.py` | Grava as leituras dos próximos dias |
| `ferramentas/extrair_textos.js` | Extrai de `data.js` os textos a gravar |
| `ferramentas/testar_voz.py` | Testes do motor de voz (sem chamadas reais) |
| `.github/workflows/audio-leituras.yml` | Automatização diária: grava as leituras e publica |
| `.nojekyll` | Impede o GitHub Pages de ignorar ficheiros |
| `make_icons.py` | Gera os ícones (opcional) |
