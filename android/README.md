# Lumen — App Android (companion nativo + PWA)

App fino que faz a descoberta e a conexão com o Mac nativamente e carrega a UI do
**Lumen** (já construída em `../public/index.html`) em tela cheia, sem a chrome do
navegador. Reaproveita 100% do front-end — nenhum código da UI é reescrito.

## O que faz
- WebView em tela cheia/imersiva, fundo preto (#0a0a12) combinando com o app.
- Carrega o servidor do Mac em `http://<ip-do-mac>:3000`.
- Aceita cert local (Tailscale) para não travar em HTTP/self-signed.
- Botão voltar do Android navega para trás dentro do app.
- Tela de "loading" enquanto carrega.
- Aviso de nova versão quando existe uma release mais recente no GitHub.
- Download iniciado somente após o toque do usuário; a instalação passa pelo instalador oficial do Android.
- **Login por código**: o dock pede o pin de 4 dígitos (aba "Sobre" do app Lumen no Mac)
  na primeira conexão; o cookie dura 180 dias.

## Configurar a URL do servidor
Edite `app/src/main/res/values/server_url.xml` com o IP do Mac na sua rede, ou
sobrescreva em runtime pela chave `server_url` em `SharedPreferences("prefs")`.

> **Auto-descoberta**: o app pergunta na rede via UDP broadcast (porta 3001, protocolo
> `lumen:discover`) e o servidor responde com o IP atual. A resposta UDP só é aceita
> depois que o APK confirma `GET /health` como Lumen. Se o IP do Mac mudar (queda de
> luz, DHCP), o device acha o servidor sozinho e grava a URL nova — o IP do XML é só fallback.

O APK persiste somente o endpoint HTTP(S) validado. O PIN e o cookie continuam no
WebView; a camada nativa não bypassa o pareamento.

## Build (precisa de Java + Android SDK)
```sh
cd android
./gradlew assembleDebug            # gera app/build/outputs/apk/debug/app-debug.apk
```

### Assinatura de release

`assembleRelease` exige uma keystore externa. O Gradle lê os quatro valores abaixo
por variáveis de ambiente ou por propriedades do Gradle (por exemplo,
`~/.gradle/gradle.properties`, que não deve ser commitado):

```properties
LUMEN_RELEASE_STORE_FILE=/caminho/seguro/lumen-release.keystore
LUMEN_RELEASE_STORE_PASSWORD=...
LUMEN_RELEASE_KEY_ALIAS=lumen
LUMEN_RELEASE_KEY_PASSWORD=...
```

Também é possível exportar os mesmos nomes no ambiente antes do build:

```sh
export LUMEN_RELEASE_STORE_FILE=/caminho/seguro/lumen-release.keystore
export LUMEN_RELEASE_STORE_PASSWORD='...'
export LUMEN_RELEASE_KEY_ALIAS='lumen'
export LUMEN_RELEASE_KEY_PASSWORD='...'
cd android && ./gradlew assembleRelease
```

Sem os quatro valores, o build de release falha claramente. Ele não gera debug
no lugar do release e não há keystore ou segredo no repositório. O arquivo
`../public/lumen.apk` é o artefato de produção versionado; a keystore permanece
fora do repositório. Instalações antigas assinadas com o certificado Debug
precisam ser desinstaladas uma vez antes de instalar esta linha de produção.
(Se `./gradlew` não existir, gere com: `gradle wrapper --gradle-version 8.5`.)

### A keystore real deste projeto

> **A chave que assina o `lumen.apk` de produção já existe.** Ela não está no
> repositório e nunca deve estar. Esta seção registra onde ela mora e como
> conferi-la — sem nenhum segredo.

| | |
|---|---|
| Keystore | `~/.lumen/lumen-release.jks` |
| As 4 variáveis `LUMEN_RELEASE_*` | `~/.lumen/credentials.env` |
| Certificado | `CN=Hugo Jeferson, OU=Lumen, O=Lumen, C=BR` |
| Algoritmo | RSA 4096, `SHA384withRSA` |
| Validade | 08/10/2026 até 23/02/2054 |

Fingerprint SHA-256 do certificado, para conferência:

```
A9:62:AB:EB:D3:75:85:C7:88:00:D9:3D:80:2E:42:D3:BB:16:C7:82:8D:C2:E8:EF:96:F9:41:79:F7:A9:AB:69
```

Para conferir que um APK saiu desta chave — não precisa de senha:

```sh
keytool -printcert -jarfile public/lumen.apk
```

O build de release carrega as credenciais com:

```sh
source ~/.lumen/credentials.env
cd android && ./gradlew assembleRelease
```

#### PERDER ESTE ARQUIVO É DEFINITIVO

**O `.jks` é insubstituível.** O Android recusa atualizar um APK assinado com
chave diferente da instalada. Perdida a chave, todo aparelho que já tem o Lumen
fica preso na versão que tem — para sempre. A única saída seria publicar sob
outro `applicationId`, que é exatamente o preço que esta transição
`com.dokke.app` → `com.lumen.app` já está pagando uma vez: quem tinha o app
antigo precisa desinstalar, reinstalar e refazer o pareamento de 4 dígitos.
Pagar isso de novo, por descuido, seria perder a base instalada inteira.

#### Não existe backup — isto não é opcional

Hoje o `.jks` existe **em um disco só**, o deste Mac. Não há cópia em nenhum
outro lugar. Um disco que morre, um `rm` errado ou uma formatação levam a chave
junto, com a consequência do parágrafo acima.

Coloque em um gerenciador de senhas ou cofre offline, as duas coisas:

1. o arquivo `~/.lumen/lumen-release.jks`;
2. as 4 linhas de `~/.lumen/credentials.env` — a keystore sem a senha é tão
   inútil quanto não tê-la.

#### Risco conhecido: a senha mora ao lado da chave

`credentials.env` e `lumen-release.jks` estão **no mesmo diretório**. Qualquer
processo que consiga ler `~/.lumen/` leva as duas coisas de uma vez, o que anula
o propósito de a keystore ter senha: a senha deixa de ser um segundo fator e
vira parte do mesmo pacote.

As permissões (`700` no diretório, `600` nos arquivos) estão corretas, mas elas
só barram *outros usuários* — não barram nada que rode **como o próprio
usuário**. E hoje todos os agentes do time rodam como o usuário.

Registrado aqui como risco conhecido e aceito, não como tarefa: separar os dois
(cofre para a senha, disco só para o `.jks`) é decisão do Hugo, não deve ser
feita por ninguém sem ele mandar.

## Instalar no J5 (via adb)
```sh
# USB: ative "Depuração USB" em Opções do desenvolvedor e plugue
adb install -r app/build/outputs/apk/debug/app-debug.apk
# Wi-Fi (alternativa):
adb tcpip 5555
adb connect <ip-do-j5>:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

> Requisitos para compilar e instalar: JDK 17+, Android SDK configurado e `adb`
> para instalação direta em um dispositivo.
