/*
    Thrall selection / Выбор предателей (thrall)
    Frida script for DreadHungerServer-Win64-Shipping.exe (load with runner.exe)
    Part of PokrassKin DH Mods - https://github.com/winwinner/PokrassKin-DH-Mods

    EN
    Two independent features, each switched by its own flag below (1 = on, 0 = off):
    1. Weights (WEIGHTS_ENABLED). Thralls are picked by the script, not the engine,
       using per-SteamID weights. A player not in WEIGHT_TABLE has BASE_WEIGHT,
       a listed player has BASE_WEIGHT + bonus. Higher weight = more often thrall.
    2. Decline (DECLINE_ENABLED). Roles are dealt early, at the poker table, and a
       thrall may refuse within DECLINE_WINDOW_MS by pressing T and sending any
       thrall-ring command. The role then goes to a random other player.
    With both on, the early deal from (2) also uses the weights.
    Weights are read once, at server start. Log: LOG_FILE in Binaries/Win64.
    Player messages are in Russian (MSG_*), translate them if you need to.

    RU
    Две независимые функции, каждая включается своим флагом ниже (1 - вкл, 0 - выкл):
    1. Веса (WEIGHTS_ENABLED). Предателей выбирает не движок, а скрипт: по таблице
       весов, привязанных к Steam ID. Вес по умолчанию BASE_WEIGHT, у игрока из
       таблицы BASE_WEIGHT + его бонус. Чем больше вес, тем чаще роль.
    2. Отказ от роли (DECLINE_ENABLED). Роли раздаются раньше штатного, ещё за
       покерным столом, и предатель может за DECLINE_WINDOW_MS отказаться: нажать T
       и отправить любую команду кольца. Его роль уходит случайному игроку.
    Если включены обе, ранняя раздача из п.2 тоже идёт по весам.
    Таблица весов читается один раз, при запуске сервера. Лог: LOG_FILE в Binaries/Win64.
*/

// ======================= SETTINGS / НАСТРОЙКИ =======================

// --- Weights / Веса ---
var WEIGHTS_ENABLED = 1;    // 1 - on/вкл, 0 - off/выкл
// [[steamid64, bonus], ...] - bonus is added to BASE_WEIGHT, may be negative
// [[steamid64, бонус], ...] - бонус прибавляется к BASE_WEIGHT, может быть отрицательным
// Example / пример: [["76561198000000000", 60], ["76561198000000001", -50]]
var WEIGHT_TABLE = [];
var BASE_WEIGHT = 100;      // weight of an unlisted player / вес игрока не из таблицы
var MIN_WEIGHT = 1;         // floor of the final weight (0 would exclude the player) / нижняя граница веса

// --- Decline / Отказ от роли ---
var DECLINE_ENABLED = 1;            // 1 - on/вкл, 0 - off/выкл
var DECLINE_ROLL_AT_MS = 30000;     // deal roles this long after players sit at the table (engine: ~45 s) / когда раздать роли после посадки за стол (штатно ~45 с)
var DECLINE_WINDOW_MS = 10000;      // length of the decline window / длина окна отказа
var DECLINE_DESTROY_SPELLBOOK = 1;  // 1 - remove the decliner's spell book / удалять книгу заклинаний у отказавшегося

// Player messages, shown in the thrall ring chat / Сообщения игрокам (в чате кольца предателей)
var MSG_OFFER = 'Ты - маф. Чтоб отказаться: T - любое сообщение';
var MSG_DECLINE_SEEN = 'Отказ принят, роль уйдёт другому игроку.';
var MSG_DECLINED = 'Роль предателя передана другому игроку.';
var MSG_KEPT = 'Передать роль некому - играешь за предателя.';
var MSG_RECEIVED = 'Тебе передали роль предателя.';

// --- Log / Лог ---
var LOG_FILE = 'output.log';

// ============ NO NEED TO EDIT BELOW / ДАЛЬШЕ ПРАВИТЬ НЕ НУЖНО ============
// Addresses and offsets below match one server build only (see README).
// Адреса и смещения ниже сняты с одной сборки сервера (см. README).

var base = Module.findBaseAddress('DreadHungerServer-Win64-Shipping.exe');

var ADH_GameMode_RandomizeThralls_addr = base.add(0xDA4620);
var ADH_GameMode_RandomizeThralls = new NativeFunction(ADH_GameMode_RandomizeThralls_addr, 'void', ['pointer'], 'win64');
var ADH_PlayerState_SetIsThrall_addr = base.add(0xE4E880);
var ADH_PlayerState_SetIsThrall = new NativeFunction(ADH_PlayerState_SetIsThrall_addr, 'void', ['pointer', 'int8']);
var ADH_GameState_Tick = base.add(0xDAD420);
var ADH_GameMode_RelayThrallMessage = base.add(0xDA8FB0);
var ADH_PlayerController_ReceiveThrallMessage = new NativeFunction(base.add(0xEE7810), 'void', ['pointer', 'pointer', 'pointer'], 'win64');
var FName_GetPlainNameString = new NativeFunction(base.add(0x11604F0), 'void', ['pointer', 'pointer'], 'win64');
var FName_FName = new NativeFunction(base.add(0x1158F20), 'void', ['pointer', 'pointer', 'int8'], 'win64');
var FText_FromName = new NativeFunction(base.add(0x1096370), 'pointer', ['pointer', 'pointer'], 'win64');

var OffObjectClass = 0x10;          // UObject::ClassPrivate
var OffObjectName = 0x18;           // UObject::NamePrivate
var OffSuperStruct = 0x40;          // UStruct::SuperStruct
var OffChildren = 0x48;             // UStruct::Children
var OffFieldNext = 0x28;            // UField::Next
var OffGameModeGameState = 0x3E8;   // AGameMode::GameState
var OffPlayerArray = 0x238;         // AGameState::PlayerArray (TArray<APlayerState*>)
var OffMatchState = 0x270;          // AGameState::MatchState (FName)
var OffUniqueId = 0x250;            // APlayerState::UniqueId
var OffPlayerName = 0x300;          // APlayerState: имя игрока (FString)
var OffSpellManager = 0x488;        // ADH_PlayerState: книга заклинаний предателя
var OffIsThrall = 0x572;            // ADH_PlayerState::bIsThrall
var OffThrallAllies = 0x578;        // ADH_PlayerState: TArray напарников-предателей
var OffControllerPlayerState = 0x228; // APlayerController::PlayerState
var VtblProcessEvent = 0x218;       // UObject::ProcessEvent в vtable

// ============================ ОБЩЕЕ ============================

function logInfo(Info) {
    var f = new File(LOG_FILE, 'a');
    f.write('[Patches] ' + Info + '\n');
    f.close();
}

// Пустая FString с буфером на Length символов (для функций, которые пишут в FString)
function newFString(Length) {
    var FString = Memory.alloc(16 + Length * 2);
    FString.writePointer(FString.add(16));
    FString.add(8).writeU32(0);
    FString.add(12).writeU32(Length);
    return FString;
}

// Строка UniqueId игрока через виртуальные IsValid/ToString его FUniqueNetId
function getPlayerUniqueID(PlayerState) {
    var Object = PlayerState.add(OffUniqueId).add(8).readPointer();
    if (Object.isNull()) return '';
    var IsValid = new NativeFunction(Object.readPointer().add(0x28).readPointer(), 'int8', ['pointer'], 'win64');
    if (IsValid(Object) == 0) return '';
    var ToString = new NativeFunction(Object.readPointer().add(0x30).readPointer(), 'void', ['pointer', 'pointer'], 'win64');
    var StringBuffer = newFString(256);
    ToString(Object, StringBuffer);
    return StringBuffer.readPointer().readUtf16String();
}

// Все PlayerState из GameState.PlayerArray
function playersOf(GameState) {
    var Result = [];
    var PlayerArray = GameState.add(OffPlayerArray);
    var Num = PlayerArray.add(8).readU32();
    for (var i = 0; i < Num; i++) {
        Result.push(PlayerArray.readPointer().add(8 * i).readPointer());
    }
    return Result;
}

// ============================ 1. ВЕСА ============================
/*
    Хук на RandomizeThralls: на время штатной раздачи SetIsThrall подменяется
    заглушкой, которая никого не назначает, а только считает, сколько предателей
    хотел движок. После выхода скрипт сам выбирает столько же игроков по весам
    (без повторов). Если выбрать не удалось - назначает тех, кого выбрал движок.
*/

var WeightedPlayers = [];   // [PlayerState, вес]
var EngineThralls = [];     // кого назначил бы движок (запасной вариант)

var SetIsThrallCounter = new NativeCallback(function (PlayerState, IsThrall) {
    if ((IsThrall & 1) == 1) EngineThralls.push(PlayerState);
}, 'void', ['pointer', 'int8']);

// Раздачу уже сделала фаза отказа: штатный SetIsThrall ничего не делает
var SetIsThrallNoop = new NativeCallback(function (PlayerState, IsThrall) {
}, 'void', ['pointer', 'int8']);

function weightOf(UniqueId) {
    var SteamId = UniqueId.split('_+_|')[0];
    for (var i = 0; i < WEIGHT_TABLE.length; i++) {
        if (WEIGHT_TABLE[i][0] == SteamId) {
            return { Weight: Math.max(MIN_WEIGHT, BASE_WEIGHT + WEIGHT_TABLE[i][1]), Found: true };
        }
    }
    return { Weight: BASE_WEIGHT, Found: false };
}

function collectWeights(GameMode) {
    WeightedPlayers = [];
    EngineThralls = [];
    var Players = playersOf(GameMode.add(OffGameModeGameState).readPointer());
    logInfo('Player count: ' + Players.length);
    for (var i = 0; i < Players.length; i++) {
        var UniqueId = getPlayerUniqueID(Players[i]);
        var W = weightOf(UniqueId);
        WeightedPlayers.push([Players[i], W.Weight]);
        logInfo('Player weight (' + (W.Found ? 'found' : 'default') + '): (' + UniqueId + ', ' + W.Weight + ')');
    }
}

// Count игроков из списка с вероятностью, пропорциональной весу, без повторов
function pickWeighted(List, Count) {
    var Pool = List.slice();
    var Picked = [];
    while (Picked.length < Count && Pool.length > 0) {
        var Total = 0;
        for (var i = 0; i < Pool.length; i++) Total += Pool[i][1];
        var Roll = Math.floor(Math.random() * Total);
        for (var i = 0; i < Pool.length; i++) {
            Roll -= Pool[i][1];
            if (Roll < 0) {
                Picked.push(Pool.splice(i, 1)[0][0]);
                break;
            }
        }
    }
    return Picked;
}

function assignWeightedThralls() {
    var Count = EngineThralls.length;
    logInfo('Expected thrall count: ' + Count);
    var Thralls = pickWeighted(WeightedPlayers, Count);
    var Ok = Thralls.length == Count;
    if (!Ok) Thralls = EngineThralls;
    for (var i = 0; i < Thralls.length; i++) ADH_PlayerState_SetIsThrall(Thralls[i], 1);
    logInfo(Ok ? 'Thrall selection successful' : 'Thrall selection failed');
}

// Хук нужен, если включена хотя бы одна функция: фазе отказа он нужен, чтобы
// заглушить штатную раздачу, когда роли уже розданы за столом.
if (WEIGHTS_ENABLED || DECLINE_ENABLED) {
    Interceptor.attach(ADH_GameMode_RandomizeThralls_addr, {
        onEnter: function (args) {
            this.Mode = 'pass';
            if (DECLINE_ENABLED && declineOwnsRound()) {
                this.Mode = 'skip';
                declineBeforeEngineDraw();
                Interceptor.replace(ADH_PlayerState_SetIsThrall_addr, SetIsThrallNoop);
                logInfo('Engine thrall draw skipped: roles were dealt at the table');
            }
            else if (WEIGHTS_ENABLED) {
                this.Mode = 'weighted';
                logInfo('Weighted thrall loaded');
                collectWeights(args[0]);
                Interceptor.replace(ADH_PlayerState_SetIsThrall_addr, SetIsThrallCounter);
            }
            // 'pass': веса выключены, движок раздаёт роли сам
        },
        onLeave: function (ret) {
            if (this.Mode === 'pass') return;
            Interceptor.revert(ADH_PlayerState_SetIsThrall_addr);
            if (this.Mode === 'weighted') assignWeightedThralls();
        }
    });
}

// ======================== 2. ОТКАЗ ОТ РОЛИ ========================
/*
    Штатно предатели раздаются через ~45 с после того, как игроки сели за покерный
    стол, и сразу после этого чёрный экран показывает им друг друга. Здесь раздача
    делается раньше, а предатель получает окно, чтобы отказаться:

    +DECLINE_ROLL_AT_MS от первого SetPlayerRole  вызываем RandomizeThralls сами
            (с весами, если они включены). Списки напарников (PlayerState+0x578)
            у всех очищаем - пока никто не решил, никто никого не знает. В
            GameState.MatchState пишем InProgress: клиент открывает кольцо команд
            (клавиша T) только при InProgress или WaitingPostMatch и bIsThrall,
            за столом там WaitingToStart.
    окно DECLINE_WINDOW_MS  любая команда из кольца (SendThrallMessage) от
            предателя - отказ, молчание - согласие. Пересылку сообщений кольца
            другим предателям в это время глушим (RelayThrallMessage рассылает
            всем, у кого bIsThrall).
    конец окна  MatchState возвращаем. Отказавшемуся снимаем флаг и удаляем книгу
            заклинаний, его роль уходит случайному игроку, у которого выбора нет.
            Списки напарников итогового состава заполняет сама игра: всем итоговым
            предателям SetIsThrall(0), затем по очереди SetIsThrall(1) - при 0->1
            она записывает в +0x578 пары с теми, кто уже предатель.
    ~+45 с  штатная RandomizeThralls проходит вхолостую. Если она пришла раньше,
            чем закрылось окно, решение подводится тут же: кто не ответил,
            тот согласен.

    Почему так: SetIsThrall при 1 добавляет пары в +0x578 и создаёт книгу
    заклинаний (+0x488), а при 0 ни списки, ни книгу не трогает. Без ручной
    чистки отказавшийся остаётся в ESC у напарника предателем.

    0x1158F20, которую скрипты зовут как FName(const TCHAR*), на деле читает
    структуру: байт +4 - флаг широкой строки, текст с +6. Отсюда makeFName.
*/

// idle -> rolling (наш вызов RandomizeThralls) -> deciding -> decided
var Phase = 'idle';
var RoundGameState = null;  // GameState текущего раунда; сменился - новый раунд
var GameMode = null;
var RoleAt = 0;             // когда первый игрок сел за стол
var DecideAt = 0;           // когда закрывается окно отказа
var Candidates = [];        // PlayerState предателей ранней раздачи
var Declined = {};          // указатель PlayerState строкой -> true
var Controllers = {};       // указатель PlayerState строкой -> контроллер
var SavedMatchState = null;
var InsideHook = false;     // защита от повторного входа в свои же хуки
var ProcessEvent = null;
var FuncNames = {};         // кэш имён UFunction
var ClassIsGameMode = {};   // кэш "класс - это GameMode"

function declineLog(Info) {
    logInfo('[Decline] ' + Info);
}

// Роли этого раунда уже раздала фаза отказа
function declineOwnsRound() {
    return Phase === 'deciding' || Phase === 'decided';
}

function plainName(FNameAddress) {
    try {
        var Buffer = newFString(256);
        FName_GetPlainNameString(FNameAddress, Buffer);
        return Buffer.readPointer().readUtf16String();
    }
    catch (e) {
        return '?';
    }
}

function readFString(Address) {
    try {
        var Data = Address.readPointer();
        var Length = Address.add(8).readU32();
        if (Data.isNull() || Length < 1 || Length > 64) return null;
        return Data.readUtf16String(Length).replace(/\0+$/, '').trim() || null;
    }
    catch (e) {
        return null;
    }
}

function playerName(PlayerState) {
    return readFString(PlayerState.add(OffPlayerName)) || PlayerState.toString();
}

function makeFName(Text) {
    var Source = Memory.alloc(8 + (Text.length + 1) * 2);
    Source.writeU32(0);
    Source.add(4).writeU8(1);
    Source.add(5).writeU8(0);
    Source.add(6).writeUtf16String(Text);
    var Name = Memory.alloc(16);
    FName_FName(Name, Source, 1);
    return Name;
}

// Сообщение игроку в чат кольца предателей
function tell(PlayerState, Text) {
    var Controller = Controllers[PlayerState.toString()];
    if (!Controller) {
        declineLog('no controller for ' + playerName(PlayerState));
        return;
    }
    try {
        var Out = Memory.alloc(24);
        FText_FromName(Out, makeFName(Text));
        ADH_PlayerController_ReceiveThrallMessage(Controller, Out, ptr(0));
    }
    catch (e) {
        declineLog('message to ' + playerName(PlayerState) + ' failed: ' + e);
    }
}

function roundPlayers() {
    return playersOf(RoundGameState);
}

function isThrall(PlayerState) {
    return PlayerState.add(OffIsThrall).readU8() !== 0;
}

function clearAllies() {
    var Players = roundPlayers();
    for (var i = 0; i < Players.length; i++) {
        Players[i].add(OffThrallAllies + 8).writeS32(0);
    }
}

// Ищет UFunction по имени в классе объекта и его родителях
function findFunction(Object, WantName) {
    try {
        var Clazz = Object.add(OffObjectClass).readPointer();
        var ClassGuard = 0;
        while (!Clazz.isNull() && ClassGuard++ < 32) {
            var Field = Clazz.add(OffChildren).readPointer();
            var FieldGuard = 0;
            while (!Field.isNull() && FieldGuard++ < 4000) {
                if (plainName(Field.add(OffObjectName)) === WantName) {
                    return Field;
                }
                Field = Field.add(OffFieldNext).readPointer();
            }
            Clazz = Clazz.add(OffSuperStruct).readPointer();
        }
    }
    catch (e) {
    }
    return ptr(0);
}

function destroySpellBook(PlayerState) {
    var SpellManager = PlayerState.add(OffSpellManager).readPointer();
    if (SpellManager.isNull() || ProcessEvent === null) return;
    var Destroy = findFunction(SpellManager, 'K2_DestroyActor');
    if (Destroy.isNull()) {
        declineLog('K2_DestroyActor not found, spell book left for ' + playerName(PlayerState));
        return;
    }
    ProcessEvent(SpellManager, Destroy, Memory.alloc(16));
    PlayerState.add(OffSpellManager).writePointer(ptr(0));
    declineLog('spell book destroyed for ' + playerName(PlayerState));
}

// MatchState = InProgress, чтобы клиент открыл кольцо команд за столом
function fakeMatchInProgress() {
    var InProgress = makeFName('InProgress');
    if (plainName(InProgress) !== 'InProgress') {
        declineLog('FName InProgress built wrong (' + plainName(InProgress) + '), ring stays closed');
        return;
    }
    SavedMatchState = RoundGameState.add(OffMatchState).readByteArray(8);
    declineLog('MatchState ' + plainName(RoundGameState.add(OffMatchState)) + ' -> InProgress');
    RoundGameState.add(OffMatchState).writeByteArray(InProgress.readByteArray(8));
}

function restoreMatchState() {
    if (SavedMatchState === null) return;
    RoundGameState.add(OffMatchState).writeByteArray(SavedMatchState);
    SavedMatchState = null;
    declineLog('MatchState restored to ' + plainName(RoundGameState.add(OffMatchState)));
}

// Ранняя раздача и открытие окна отказа
function startDecision() {
    Phase = 'rolling';
    ADH_GameMode_RandomizeThralls(GameMode);
    Candidates = [];
    Declined = {};
    var Players = roundPlayers();
    for (var i = 0; i < Players.length; i++) {
        if (isThrall(Players[i])) Candidates.push(Players[i]);
    }
    if (Candidates.length === 0) {
        declineLog('early draw gave no thralls, engine draw stays in charge');
        Phase = 'idle';
        return;
    }
    clearAllies();
    fakeMatchInProgress();
    Phase = 'deciding';
    DecideAt = Date.now() + DECLINE_WINDOW_MS;
    for (var i = 0; i < Candidates.length; i++) {
        declineLog('offered: ' + playerName(Candidates[i]));
        tell(Candidates[i], MSG_OFFER);
    }
}

// Закрытие окна: передача ролей отказавшихся и сборка итогового состава
function finishDecision() {
    Phase = 'decided';
    restoreMatchState();
    var Players = roundPlayers();
    var Final = [];
    var Pool = [];  // кому можно передать роль: не предатель и не отказавшийся
    for (var i = 0; i < Players.length; i++) {
        var PS = Players[i];
        var Key = PS.toString();
        if (Declined[Key]) continue;
        if (isThrall(PS)) Final.push(PS);
        else Pool.push(PS);
    }
    for (var Key in Declined) {
        var Decliner = ptr(Key);
        if (Pool.length === 0) {
            Final.push(Decliner);
            declineLog(playerName(Decliner) + ' declined, nobody to pass to - keeps the role');
            tell(Decliner, MSG_KEPT);
            continue;
        }
        var Pick = Pool.splice(Math.floor(Math.random() * Pool.length), 1)[0];
        ADH_PlayerState_SetIsThrall(Decliner, 0);
        if (DECLINE_DESTROY_SPELLBOOK) {
            try {
                destroySpellBook(Decliner);
            }
            catch (e) {
                declineLog('spell book destroy failed: ' + e);
            }
        }
        Final.push(Pick);
        declineLog(playerName(Decliner) + ' declined, role passed to ' + playerName(Pick));
        tell(Decliner, MSG_DECLINED);
        tell(Pick, MSG_RECEIVED);
    }
    // напарников записывает сама игра на переходе 0 -> 1
    clearAllies();
    for (var i = 0; i < Final.length; i++) ADH_PlayerState_SetIsThrall(Final[i], 0);
    for (var i = 0; i < Final.length; i++) ADH_PlayerState_SetIsThrall(Final[i], 1);
    var Names = [];
    for (var i = 0; i < Final.length; i++) Names.push(playerName(Final[i]));
    declineLog('final thralls: ' + Names.join(', '));
}

// Что-то сломалось посреди фазы: оставляем тех предателей, что есть сейчас, и
// возвращаем им напарников, чтобы раунд не начался вслепую
function recoverAfterFailure() {
    try {
        restoreMatchState();
    }
    catch (e) {
    }
    if (Phase === 'idle') return;
    Phase = 'decided';
    try {
        var Players = roundPlayers();
        var Thralls = [];
        for (var i = 0; i < Players.length; i++) {
            if (isThrall(Players[i])) Thralls.push(Players[i]);
        }
        if (Thralls.length === 0) {
            Phase = 'idle';// пусть раздаст штатная RandomizeThralls
            return;
        }
        clearAllies();
        for (var i = 0; i < Thralls.length; i++) ADH_PlayerState_SetIsThrall(Thralls[i], 0);
        for (var i = 0; i < Thralls.length; i++) ADH_PlayerState_SetIsThrall(Thralls[i], 1);
        declineLog('recovered with ' + Thralls.length + ' thrall(s)');
    }
    catch (e) {
        declineLog('recovery failed: ' + e);
    }
}

// Штатная раздача пришла, а окно ещё открыто: кто не ответил - согласен
function declineBeforeEngineDraw() {
    if (Phase !== 'deciding') return;
    declineLog('engine draw came before the window closed, deciding now');
    InsideHook = true;
    try {
        finishDecision();
    }
    catch (e) {
        declineLog('finish failed: ' + e);
    }
    InsideHook = false;
}

// Все вызовы ProcessEvent: ищем GameMode, момент посадки за стол и отказы
function onProcessEvent(Object, Function) {
    var Key = Function.toString();
    var Name = FuncNames[Key];
    if (Name === undefined) {
        Name = plainName(Function.add(OffObjectName));
        FuncNames[Key] = Name;
    }
    // GameMode нужен, чтобы самим вызвать RandomizeThralls
    if (GameMode === null && Name === 'ReceiveTick') {
        var ClassKey = Object.add(OffObjectClass).readPointer().toString();
        var IsMode = ClassIsGameMode[ClassKey];
        if (IsMode === undefined) {
            IsMode = plainName(ptr(ClassKey).add(OffObjectName)).indexOf('GameMode') >= 0;
            ClassIsGameMode[ClassKey] = IsMode;
        }
        if (IsMode) GameMode = ptr(Object.toString());
        return;
    }
    // Игрок сел за стол: запоминаем его контроллер, первый запускает отсчёт
    if (Name === 'SetPlayerRole') {
        var Controller = ptr(Object.toString());
        Controllers[Controller.add(OffControllerPlayerState).readPointer().toString()] = Controller;
        if (Phase === 'idle' && RoleAt === 0) {
            RoleAt = Date.now();
            declineLog('players at the table, roles dealt in ' + DECLINE_ROLL_AT_MS / 1000 + ' s');
        }
        return;
    }
    // Команда кольца от предателя во время окна - отказ
    if (Name === 'SendThrallMessage' && Phase === 'deciding') {
        var PS = Object.add(OffControllerPlayerState).readPointer();
        var PSKey = PS.toString();
        for (var i = 0; i < Candidates.length; i++) {
            if (Candidates[i].toString() === PSKey && !Declined[PSKey]) {
                Declined[PSKey] = true;
                declineLog('decline from ' + playerName(PS));
                tell(PS, MSG_DECLINE_SEEN);
            }
        }
    }
}

function hookProcessEvent(AnyObject) {
    var Address = AnyObject.readPointer().add(VtblProcessEvent).readPointer();
    ProcessEvent = new NativeFunction(Address, 'void', ['pointer', 'pointer', 'pointer'], 'win64');
    Interceptor.attach(Address, {
        onEnter: function (args) {
            if (InsideHook) return;
            InsideHook = true;
            try {
                onProcessEvent(args[0], args[1]);
            }
            catch (e) {
            }
            InsideHook = false;
        }
    });
}

if (DECLINE_ENABLED) {
    // Пока открыто окно, сообщения кольца не пересылаются другим предателям
    var RelayOriginal = new NativeFunction(ADH_GameMode_RelayThrallMessage, 'void', ['pointer', 'pointer', 'pointer', 'pointer'], 'win64');
    Interceptor.replace(ADH_GameMode_RelayThrallMessage, new NativeCallback(function (a, b, c, d) {
        if (Phase === 'deciding') return;
        RelayOriginal(a, b, c, d);
    }, 'void', ['pointer', 'pointer', 'pointer', 'pointer'], 'win64'));

    // Тик GameState - таймер фазы: открыть окно, закрыть окно
    Interceptor.attach(ADH_GameState_Tick, {
        onEnter: function (args) {
            var GameState = ptr(args[0].toString());
            if (ProcessEvent === null) hookProcessEvent(GameState);
            if (RoundGameState === null || !RoundGameState.equals(GameState)) {
                RoundGameState = GameState;
                Phase = 'idle';
                RoleAt = 0;
                GameMode = null;
                Controllers = {};
            }
            var Now = Date.now();
            var Step = null;
            if (Phase === 'idle' && RoleAt !== 0 && GameMode !== null && Now - RoleAt >= DECLINE_ROLL_AT_MS) Step = startDecision;
            else if (Phase === 'deciding' && Now >= DecideAt) Step = finishDecision;
            if (Step === null) return;
            InsideHook = true;
            try {
                Step();
            }
            catch (e) {
                declineLog('step failed: ' + e);
                recoverAfterFailure();
            }
            InsideHook = false;
        }
    });
}

logInfo('Thrall script: weights ' + (WEIGHTS_ENABLED ? 'on' : 'off') + ', decline ' + (DECLINE_ENABLED ? 'on' : 'off'));
