# Lobby mods

[Русская версия](README.ru.md) · [Back to main page](../README.md)

Frida scripts for the Dread Hunger **pre-match lobby** (the `MenuLobby` map).

| Script | What it does |
|---|---|
| [`[Dock Patch] Lobby Respawn.js`](Patches/) | A player who dies in the lobby respawns after 5 s. |
| [`[Dock Patch] Lobby Corpse Cleanup.js`](Patches/) | A dead player's items drop on the ground and the body disappears a few seconds later. |
| [`[Dock Patch] Lobby Duel.js`](Patches/) | Player-vs-player damage in the lobby without death: a beaten player is knocked down, gets up at full health 1.5 s later, and everyone sees `<attacker> (<hp>) kill <victim>`. Three skeletons hang in the lobby: interact with one or punch it to heal to full. |

The scripts are independent; use any combination. Respawn + Corpse Cleanup +
Duel together give a "fight, respawn, repeat" lobby.

## Who installs them

**Only the player who creates the lobby.** In Dread Hunger the lobby runs as a
listen server on its creator's PC: damage, health and spawned actors are decided
there and replicated to everyone. Other players need nothing and stay on the
vanilla client. If someone else created the lobby, the mods do nothing. They are
also inactive outside `MenuLobby`, so they never touch a real match.

## What you need

- The client build `DreadHunger-Win64-Shipping.exe` with SHA-256
  `897a596e5c7d309b8aad6c5796d3b3651a5147bcc0e912522c30a3ee6ab02bf6`. Other
  builds will not work.
- **Frida Gadget** loaded into the game and set to run every script in the
  `Patches` folder. If your game already has
  `DreadHunger/Binaries/Win64/Patches` with other `[Dock Patch] ...` scripts,
  you have it. Our setup uses Frida Gadget 16.1.10 as `frida.dll` with this
  `frida.config` next to it:

  ```json
  {"interaction":{"type":"script-directory","path":"./Patches"}}
  ```

  The DLL that loads `frida.dll` into the game comes with community client
  packs and is not distributed here.

## Install

1. Copy the three `.js` files from [`Patches/`](Patches/) into
   `DreadHunger/Binaries/Win64/Patches` of your game.
2. Start the game and create a lobby.

To remove a mod, delete its file. To switch one off temporarily, set
`var Switch = 0;` at the top of the file.

## Settings

At the top of each file, commented in English and Russian:

- **Respawn**: `RespawnDelaySec` (5).
- **Corpse Cleanup**: `DropItemsAfterSec` (1), `DespawnAfterDropSec` (5),
  `DropItems` (1 = drop items, 0 = body vanishes with its inventory),
  `DropSpread` (40).
- **Duel**: `ReviveDelayMs` (1500), `Announce`, `SpawnSkeletons`,
  `HealOnInteract`, `HealOnHit`, `HealDamageTypes`, `HealRadius`,
  `HealCooldownMs`, and `Skeletons` (skeleton positions, tuned by hand for the
  current lobby map).

## Logs

`output.log` in `DreadHunger/Binaries/Win64`, lines tagged `[LobbyRespawn]`,
`[CorpseCleanup]`, `[LobbyMod]`.

## Known limits

- Corpse Cleanup has not been tested with deaths by poison or drowning.
- Duel tracks at most 16 characters at a time.
- If a player's name cannot be read, the kill message says `кто-то` (Russian for "someone").
