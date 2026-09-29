# Studio glossary

Translations follow this file. When a term reads wrong, change it here first,
then everywhere it is used — nine languages drift apart otherwise.

## Never translated

SIGNA · Signum · SmartC · Studio · SmartC Studio · XT Wallet · AT · SC-Simulator ·
Nexus · Dawn · Solaris · Terminal · Testnet · Mainnet ·
API function names (`Get_A1`, `Send_To_Address_In_B`, …) · opcodes (`JMP`, `SET`, …) ·
directive and pragma names (`#program`, `#pragma maxAuxVars`, `^declare`, …) ·
file extensions (`.smart.c`, `.scenario.json`, `.test.ts`) · keyboard shortcuts ·
scenario field names (`version`, `creator`, `accounts[…]`, `transactions[…]`, `txId`, `message`, `messageHex`) ·
anything in `backticks`, and every `{placeholder}` and `<tag>`.

## Style per language

| Locale | Address | Notes |
|---|---|---|
| de | du | Buttons in the infinitive ("Speichern", "Kompilieren"). Anglicisms only where German developers use them: "Deployen" is fine, "Deployment" too. |
| pt-BR | você | Buttons in the infinitive ("Salvar", "Compilar"). |
| fr | vous | Narrow no-break space (U+202F) before `: ; ? !`. Buttons in the infinitive ("Enregistrer"). Guillemets « » for quotes. |
| es | tú | Buttons in the infinitive ("Guardar", "Compilar"). |
| it | tu | Buttons in the imperative, 2nd person ("Salva", "Compila"). |
| uk | ви | Translate from English, never from Russian. Buttons in the infinitive ("Зберегти", "Скомпілювати"). |
| ru | вы | Buttons in the infinitive ("Сохранить", "Скомпилировать"). |
| zh-CN | — | Full-width punctuation around Chinese text (，。：？), none inside code. No space between Chinese characters; one space between Chinese and Latin words is optional — omit it. |

## Terms

| English | de | pt-BR | fr | es | it | uk | ru | zh-CN |
|---|---|---|---|---|---|---|---|---|
| smart contract | Smart Contract | contrato inteligente | contrat intelligent | contrato inteligente | contratto intelligente | смарт-контракт | смарт-контракт | 智能合约 |
| contract | Contract | contrato | contrat | contrato | contratto | контракт | контракт | 合约 |
| compile | kompilieren | compilar | compiler | compilar | compilare | скомпілювати | скомпилировать | 编译 |
| assembly (file) | Assembly(-Datei) | (arquivo) assembly | (fichier) assembleur | (archivo) ensamblador | (file) assembly | (файл) асемблера | (файл) ассемблера | 汇编(文件) |
| assemble | assemblieren | montar | assembler | ensamblar | assemblare | асемблювати | ассемблировать | 汇编 |
| deploy | deployen | implantar | déployer | desplegar | distribuire | розгорнути | развернуть | 部署 |
| deployment | Deployment | implantação | déploiement | despliegue | distribuzione | розгортання | развертывание | 部署 |
| test (noun) | Test | teste | test | prueba | test | тест | тест | 测试 |
| testbed | Testbed | testbed | banc d'essai | banco de pruebas | banco di prova | тестовий стенд | тестовый стенд | 测试台 |
| simulator | Simulator | simulador | simulateur | simulador | simulatore | симулятор | симулятор | 模拟器 |
| simulate | simulieren | simular | simuler | simular | simulare | симулювати | симулировать | 模拟 |
| scenario | Szenario | cenário | scénario | escenario | scenario | сценарій | сценарий | 场景 |
| step (debugger action) | Schritt | Passo | Pas | Paso | Passo | Крок | Шаг | 单步 |
| step (unit of execution cost) | Schritt | passo | pas | paso | passo | крок | шаг | 步 |
| breakpoint | Haltepunkt | ponto de interrupção | point d'arrêt | punto de interrupción | punto di interruzione | точка зупинки | точка останова | 断点 |
| block | Block | bloco | bloc | bloque | blocco | блок | блок | 区块 |
| forge (a block) | schmieden | forjar | forger | forjar | forgiare | викувати | выковать | 锻造 |
| ledger | Ledger | ledger | registre | libro mayor | registro | реєстр | реестр | 账本 |
| transaction | Transaktion | transação | transaction | transacción | transazione | транзакція | транзакция | 交易 |
| account | Konto | conta | compte | cuenta | account | обліковий запис | аккаунт | 账户 |
| balance | Guthaben | saldo | solde | saldo | saldo | баланс | баланс | 余额 |
| fee | Gebühr | taxa | frais | comisión | commissione | комісія | комиссия | 手续费 |
| activation amount | Aktivierungsbetrag | valor de ativação | montant d'activation | importe de activación | importo di attivazione | сума активації | сумма активации | 激活金额 |
| passphrase | Passphrase | frase secreta | phrase secrète | frase de contraseña | passphrase | парольна фраза | парольная фраза | 助记词 |
| wallet | Wallet | carteira | portefeuille | billetera | wallet | гаманець | кошелёк | 钱包 |
| register (AT) | Register | registrador | registre | registro | registro | регістр | регистр | 寄存器 |
| slot | Slot | slot | emplacement | ranura | slot | слот | слот | 槽位 |
| variable | Variable | variável | variable | variable | variabile | змінна | переменная | 变量 |
| label / jump target | Label / Sprungziel | rótulo / destino de salto | étiquette / cible de saut | etiqueta / destino de salto | etichetta / destinazione di salto | мітка / ціль переходу | метка / цель перехода | 标签 / 跳转目标 |
| code stack | Code-Stack | pilha de código | pile de code | pila de código | stack del codice | стек коду | стек кода | 代码栈 |
| user stack | User-Stack | pilha de usuário | pile utilisateur | pila de usuario | stack utente | стек користувача | пользовательский стек | 用户栈 |
| memory | Speicher | memória | mémoire | memoria | memoria | пам'ять | память | 内存 |
| page (memory/code) | Seite | página | page | página | pagina | сторінка | страница | 页 |
| code hash | Code-Hash | hash do código | hash du code | hash del código | hash del codice | хеш коду | хеш кода | 代码哈希 |
| machine code | Maschinencode | código de máquina | code machine | código máquina | codice macchina | машинний код | машинный код | 机器码 |
| instruction | Instruktion | instrução | instruction | instrucción | istruzione | інструкція | инструкция | 指令 |
| workflow | Workflow | fluxo de trabalho | flux de travail | flujo de trabajo | flusso di lavoro | робочий процес | рабочий процесс | 工作流 |
| project | Projekt | projeto | projet | proyecto | progetto | проєкт | проект | 项目 |
| file | Datei | arquivo | fichier | archivo | file | файл | файл | 文件 |
| folder | Ordner | pasta | dossier | carpeta | cartella | тека | папка | 文件夹 |
| import | importieren | importar | importer | importar | importare | імпортувати | импортировать | 导入 |
| run (tests) | ausführen | executar | exécuter | ejecutar | eseguire | запустити | запустить | 运行 |
| reset | zurücksetzen | redefinir | réinitialiser | restablecer | reimposta | скинути | сбросить | 重置 |
| watch (a variable) | beobachten | observar | surveiller | vigilar | osservare | стежити | отслеживать | 监视 |
| hover docs | Hover-Doku | documentação ao passar o mouse | documentation au survol | documentación al pasar el cursor | documentazione al passaggio del mouse | підказки при наведенні | подсказки при наведении | 悬停文档 |
