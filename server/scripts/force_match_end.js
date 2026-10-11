/*
 * Force match end / Принудительное завершение матча
 * Frida script for DreadHungerServer-Win64-Shipping.exe (load with runner.exe)
 * Part of PokrassKin DH Mods - https://github.com/winwinner/PokrassKin-DH-Mods
 *
 * EN
 * Ends the running round with a win for the side you choose. To trigger it,
 * create an empty file in FLAG_DIR while a round is in progress:
 *   force_win_civilians.flag - crew wins
 *   force_win_thralls.flag   - thralls win
 * Within a few seconds the script deletes the flag and writes the outcome to
 * force_win_result.flag: "ended ...", "rejected <match state>" (no round is
 * running), "no-effect ..." or "error ...". Stale flags are cleared when the
 * server starts. The server process exits after the match, as after any match.
 *
 * RU
 * Завершает идущий раунд победой выбранной стороны. Чтобы сработало, во время
 * раунда создайте пустой файл в папке FLAG_DIR:
 *   force_win_civilians.flag - победа экипажа
 *   force_win_thralls.flag   - победа предателей
 * Через пару секунд скрипт удалит флаг и запишет итог в force_win_result.flag:
 * "ended ...", "rejected <состояние матча>" (раунд не идёт), "no-effect ..."
 * или "error ...". Старые флаги удаляются при запуске сервера. После матча
 * процесс сервера завершается, как и после обычного матча.
 *
 * How it works: the flag is checked from ADH_GameState::Tick, i.e. on the game
 * thread, and SetWinningTeam is called with the live GameState there. Driving UE
 * state from Frida's own thread breaks the game's synchronisation.
 * SetWinningTeam is a silent no-op outside a running round, so MatchState is
 * checked first.
 */

// ======================= SETTINGS / НАСТРОЙКИ =======================

// Folder for the flag files: absolute Windows path with forward slashes.
// Under Wine the Linux root is drive Z:, e.g. 'Z:/home/dh/dreadhunger'.
// Папка для файлов-флагов: абсолютный путь Windows с прямыми слешами.
// Под Wine корень Linux - диск Z:, например 'Z:/home/dh/dreadhunger'.
var FLAG_DIR = 'C:/DreadHunger';

// ============ NO NEED TO EDIT BELOW / ДАЛЬШЕ ПРАВИТЬ НЕ НУЖНО ============

var base = Module.findBaseAddress('DreadHungerServer-Win64-Shipping.exe');

var FLAG_CIVILIANS = FLAG_DIR + '/force_win_civilians.flag';
var FLAG_THRALLS = FLAG_DIR + '/force_win_thralls.flag';
// The script reports back through this one, in every terminal case.
var FLAG_RESULT = FLAG_DIR + '/force_win_result.flag';

// void ADH_GameState::SetWinningTeam(ADH_GameState *this, int8 team, int8)
var SetWinningTeam = new NativeFunction(
    base.add(0xDA9C30), 'void', ['pointer', 'int8', 'int8'], 'win64'
);
// void ADH_GameState::Tick(ADH_GameState *this, float DeltaSeconds)
var ADH_GameState_Tick = base.add(0xDAD420);
// void FName::ToString(FName *this, FString *out)
var FNameToString = new NativeFunction(
    base.add(0x1166e70), 'void', ['pointer', 'pointer'], 'win64'
);
// AGameState::MatchState, an FName. AGameState::PreviousMatchState follows it
// at 0x278; both were located by walking the live GameState in the lobby.
var MATCH_STATE_OFFSET = 0x270;
// ADH_GameState total elapsed seconds.
var TOTAL_TIME_OFFSET = 0x5b0;
// ADH_GameState's winning-team byte, the one SetWinningTeam writes. The setter
// opens with
//   cmp dl, [rcx+0x51C] / je <return>
// so asking for the value already on record returns without doing anything.
var WINNING_TEAM_OFFSET = 0x51c;
// Team codes as the engine itself uses them. Its only call site computes the
// argument as ((flag ^ 1) + 1):
//     140e67493  xor bl, 1
//     140e67499  inc bl
//     140e674a2  call SetWinningTeam
// so the game only ever passes 1 or 2. 0 is "no winner yet" - the value the
// field holds for the whole round - which is why asking for 0 hit the early
// return and did nothing at all.
var TEAM_NOBODY = 0;
var TEAM_CIVILIANS = 1;
var TEAM_THRALLS = 2;
// The round does not end inside SetWinningTeam - GameMode notices on a later
// tick - so the result is confirmed by watching MatchState for a few seconds.
var VERIFY_SECONDS = 5;

var GetFileAttributesW = new NativeFunction(
    Module.findExportByName('kernel32.dll', 'GetFileAttributesW'),
    'uint32', ['pointer'], 'win64'
);
var DeleteFileW = new NativeFunction(
    Module.findExportByName('kernel32.dll', 'DeleteFileW'),
    'int32', ['pointer'], 'win64'
);
var INVALID_FILE_ATTRIBUTES = 0xffffffff;

// One poll per second is plenty for a button press and keeps the tick cheap.
var POLL_SECONDS = 1;
var nextPollTime = 0;
var fstringBuf = Memory.alloc(16);

function logInfo(info) {
    var line = '[FORCE END] ' + info;
    console.log(line);
    try {
        var f = new File('output.log', 'a');
        f.write(line + '\n');
        f.close();
    } catch (e) {
    }
}

function fileExists(path) {
    return GetFileAttributesW(Memory.allocUtf16String(path)) !== INVALID_FILE_ATTRIBUTES;
}

function removeFile(path) {
    DeleteFileW(Memory.allocUtf16String(path));
}

function writeFile(path, text) {
    try {
        var f = new File(path, 'w');
        f.write(text);
        f.close();
    } catch (e) {
        logInfo('could not write ' + path + ': ' + e.message);
    }
}

function matchState(gameState) {
    try {
        fstringBuf.writePointer(ptr(0));
        fstringBuf.add(8).writeU32(0);
        fstringBuf.add(12).writeU32(0);
        FNameToString(gameState.add(MATCH_STATE_OFFSET), fstringBuf);
        var len = fstringBuf.add(8).readU32();
        if (len <= 0 || len > 64) {
            return '';
        }
        return fstringBuf.readPointer().readUtf16String(len);
    } catch (e) {
        return '';
    }
}

/** The winner the raised flags ask for, without consuming anything yet. */
function peekPendingWinner() {
    if (fileExists(FLAG_CIVILIANS)) {
        return [TEAM_CIVILIANS, 'civilians'];
    }
    if (fileExists(FLAG_THRALLS)) {
        return [TEAM_THRALLS, 'thralls'];
    }
    return null;
}

/** Drop every flag, so one request can never spill into the next round. */
function clearFlags() {
    removeFile(FLAG_CIVILIANS);
    removeFile(FLAG_THRALLS);
}

/** Report the outcome and stop watching. */
function finish(text) {
    pending = null;
    writeFile(FLAG_RESULT, text);
    logInfo(text);
}

// Set while a request is in flight and we are waiting to see whether the round
// actually ends: { team, label, deadline }.
var pending = null;

Interceptor.attach(ADH_GameState_Tick, {
    onEnter: function (args) {
        var gameState = args[0];
        var totalTime = gameState.add(TOTAL_TIME_OFFSET).readDouble();

        if (pending !== null) {
            // SetWinningTeam has already been called; GameMode ends the round
            // on one of the next ticks, so wait for MatchState to move.
            if (matchState(gameState) !== 'InProgress') {
                finish('ended, winner team ' + pending.team + ' (' + pending.label + ')');
            } else if (totalTime > pending.deadline) {
                finish('no-effect: the round is still InProgress ' + VERIFY_SECONDS +
                    's after SetWinningTeam(' + pending.team + ')');
            }
            return;
        }

        if (totalTime < nextPollTime) {
            return;
        }
        nextPollTime = totalTime + POLL_SECONDS;

        var request = peekPendingWinner();
        if (request === null) {
            return;
        }

        // SetWinningTeam only ends anything while a round is actually running;
        // in the lobby it changes nothing and would report a false success.
        var state = matchState(gameState);
        if (state !== 'InProgress') {
            // Marker first: whoever raised the flag may stop waiting the moment
            // it disappears, so the result has to be on disk by then.
            writeFile(FLAG_RESULT, 'rejected ' + (state || 'unknown'));
            clearFlags();
            logInfo('ignored a ' + request[1] + ' request: match state is ' + (state || 'unknown'));
            return;
        }

        clearFlags();
        try {
            var team = request[0];
            if (gameState.add(WINNING_TEAM_OFFSET).readU8() === team) {
                // Only reachable if the same side was already declared and the
                // round somehow kept going. Reset to "no winner" so the setter's
                // early return does not swallow the retry.
                gameState.add(WINNING_TEAM_OFFSET).writeU8(TEAM_NOBODY);
            }
            SetWinningTeam(gameState, team, 0);
            pending = {
                team: team,
                label: request[1],
                deadline: totalTime + VERIFY_SECONDS
            };
            logInfo('SetWinningTeam(' + team + ') called for ' + request[1] + ', waiting for the round to end');
        } catch (e) {
            writeFile(FLAG_RESULT, 'error: ' + e.message);
            logInfo('SetWinningTeam failed: ' + e.message);
        }
    }
});

clearFlags();
removeFile(FLAG_RESULT);
logInfo('armed, watching ' + FLAG_DIR + '/force_win_{civilians,thralls}.flag');
