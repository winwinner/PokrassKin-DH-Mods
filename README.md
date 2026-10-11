# PokrassKin DH Mods

[Русская версия](README.ru.md)

Frida mods for **Dread Hunger**, used on the PokrassKin community servers.

There are two independent sets, for two different machines:

| Set | Runs on | Loader | Mods |
|---|---|---|---|
| [`server/`](server/README.md) | the dedicated game server | `runner.exe` (see [Releases](../../releases)) | thrall weights + thrall role decline, force match end, instant quests, training mode |
| [`lobby/`](lobby/README.md) | the PC of the player who **creates the lobby** | Frida Gadget, `Patches` folder | lobby respawn, lobby corpse cleanup, lobby duels |

## Game build

All mods patch the game by hard-coded addresses, so they work **only** with
these exact executables. On any other build they will most likely crash the
process. Check the hash before installing.

| File | Size | Hash |
|---|---|---|
| `DreadHungerServer-Win64-Shipping.exe` | 76 583 424 | MD5 `a784ea380ef981c93619052bc12bae18` |
| `DreadHunger-Win64-Shipping.exe` (client) | 82 631 680 | SHA-256 `897a596e5c7d309b8aad6c5796d3b3651a5147bcc0e912522c30a3ee6ab02bf6` |

For reference: our installation has TotemMod v1.1.4.

```bash
md5sum DreadHungerServer-Win64-Shipping.exe          # Linux
```
```powershell
Get-FileHash DreadHunger-Win64-Shipping.exe          # Windows, SHA-256
```

## Settings

Every mod has a settings block at the top of the file, commented in English and
Russian. Flags use `1` = on, `0` = off. Edit, save, restart the server (or
re-create the lobby). In-game messages to players are in Russian.

## Logs

Mods append to text files in `Binaries/Win64` next to the game executable:
`output.log` (most mods) and `train_mode.log` (training mode).

## License and authorship

Our code is under the [MIT license](LICENSE). Some mods are built on top of
older community code whose authorship has been lost; the same goes for
`runner.exe`. See [NOTICE.md](NOTICE.md) for exactly what is ours and what is
not.

Dread Hunger is a trademark of its owners. This project is not affiliated with
them. No game files are distributed here.
