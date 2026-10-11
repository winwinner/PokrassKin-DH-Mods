# Server mods

[Русская версия](README.ru.md) · [Back to main page](../README.md)

Frida scripts for the Dread Hunger **dedicated server**
(`DreadHungerServer-Win64-Shipping.exe`, MD5 `a784ea380ef981c93619052bc12bae18`).

| Script | What it does |
|---|---|
| [`thrall_weight.js`](scripts/thrall_weight.js) | Two features, each with its own on/off flag: **weights** (thralls are drawn by per-SteamID weights) and **role decline** (roles are dealt at the poker table, a thrall can refuse within 10 s and the role goes to someone else). |
| [`force_match_end.js`](scripts/force_match_end.js) | Ends the running round with a win for the crew or the thralls when you drop a flag file. |
| [`questsinstant.js`](scripts/questsinstant.js) | Every player gets a quest 40 s into the round, without the scroll; quests reward random items. **Experimental.** |
| [`train_mode.js`](scripts/train_mode.js) | Practice mode: starting weapons, no cooldowns, instant crafting, infinite ammo, knockdown instead of death, fist swing heals. |

## What you need

- The server build above. Other builds will not work.
- `runner.exe` from [Releases](../../../releases) (69 MB, SHA-256
  `0fcb79b6eb7c2c38475e545b6ad9dd21885e2c445e0d19c17e1d5fadc89feaa4`). It is a
  Frida-based launcher: it starts the server and injects the scripts you list.
  Its author is unknown, see [NOTICE.md](../NOTICE.md).
- We run it on **Linux under Wine** (Ubuntu 24.04, Wine 9.0). `runner.exe` is a
  regular Win64 program, so native Windows should work too, but we have not
  tested it.

## Install

1. Put `runner.exe` in the server root, next to the `WindowsServer` folder.
2. Create a `scripts` folder next to `runner.exe` and copy the mods there.
   `runner.exe` looks for scripts in `./scripts`.

```
<server root>/
├── runner.exe
├── scripts/
│   ├── thrall_weight.js
│   ├── force_match_end.js
│   ├── questsinstant.js
│   └── train_mode.js
└── WindowsServer/DreadHunger/Binaries/Win64/DreadHungerServer-Win64-Shipping.exe
```

3. Edit the settings block at the top of each script you use (see below).

## Launch

Start the server through `runner.exe`, from the server root. Arguments: the
server exe, the map URL, then the script file names (just names, no folder):

```bash
cd /path/to/server-root
wine runner.exe WindowsServer/DreadHunger/Binaries/Win64/DreadHungerServer-Win64-Shipping.exe \
  "Expanse_Persistent?maxplayers=8?thralls=2?port=7777" \
  thrall_weight.js force_match_end.js
```

On Windows run the same line without `wine`. The log shows `injected: <name>.js`
for every script that loaded. Pick any set of scripts: each one is independent.

A server process serves **one match** and exits when it ends. The scripts rely
on this and keep no state between matches, so start a new process for every
match (that is how the game server works anyway).

## Settings

### thrall_weight.js

| Setting | Default | Meaning |
|---|---|---|
| `WEIGHTS_ENABLED` | `1` | Weighted thrall draw on/off. |
| `WEIGHT_TABLE` | `[]` | `[["<steamid64>", bonus], ...]`. A player's weight is `BASE_WEIGHT + bonus`, at least `MIN_WEIGHT`. |
| `BASE_WEIGHT` | `100` | Weight of any player not in the table. |
| `MIN_WEIGHT` | `1` | Lowest possible weight. |
| `DECLINE_ENABLED` | `1` | Role decline on/off. |
| `DECLINE_ROLL_AT_MS` | `30000` | When to deal roles after players sit at the table (the game itself does it at ~45 s). |
| `DECLINE_WINDOW_MS` | `10000` | How long a thrall has to decline. |
| `DECLINE_DESTROY_SPELLBOOK` | `1` | Remove the spell book from a player who declined. |
| `MSG_*` | Russian text | Messages shown to players in the thrall ring chat. |

Example: a bonus of `+100` doubles a player's chance compared to everyone
else, `-50` halves it. The table is read once when the server starts.

**Role decline, from the player's side.** About 30 s after sitting down at the
poker table a thrall receives a message in the thrall ring chat. To refuse,
press **T** and send any ring command within 10 s; silence means "keep". The
role then goes to a random non-thrall player, who has no choice. If nobody is
left to take it, the decliner keeps the role.

### force_match_end.js

| Setting | Default | Meaning |
|---|---|---|
| `FLAG_DIR` | `C:/DreadHunger` | Folder watched for flag files. Absolute Windows path with forward slashes. Under Wine, Linux paths are on drive `Z:`, e.g. `Z:/home/dh/dreadhunger`. |

During a round, create an empty file in `FLAG_DIR`:

```bash
touch /home/dh/dreadhunger/force_win_civilians.flag   # crew wins
touch /home/dh/dreadhunger/force_win_thralls.flag     # thralls win
```

Within a few seconds the flag disappears and `force_win_result.flag` holds the
outcome: `ended ...` (done), `rejected <state>` (no round is running, e.g. in
the lobby), `no-effect ...` or `error ...`.

### questsinstant.js

`QUEST_START_DELAY_MS` (40 s after the round starts), `TaskRewardsnumber` /
`ThrallTaskRewardsnumber` (items per completed quest for crew / thralls) and the
`InventoryTable` / `ThrallInventoryTable` reward tables (higher `weight` = more
often). Not yet confirmed in a full live round.

### train_mode.js

`STARTING_ITEMS` (items every player spawns with), `ReviveDelayMs` (how long a
knocked-down player stays down). Logs to `train_mode.log`.

## Troubleshooting

- **Server crashes right after start**: wrong server build. Compare the MD5.
- **A script does nothing**: check that `injected: <name>.js` is in the
  runner's output and look at `output.log` in `Binaries/Win64`.
- **force_match_end answers nothing**: `FLAG_DIR` does not point where you
  create the flag. Under Wine remember the `Z:` prefix.
