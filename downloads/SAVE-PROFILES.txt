# Save-profile investigation: user game v0.107.1

## Confirmed evidence

The user observed missing progress after enabling the bridge, then confirmed their
original save returned after closing the game and removing our two mod files.
The bridge's health response was successfully read in the actual game session.
This establishes that the mod loads, not that SP/co-op state is live-certified.

Inspection of the user-provided `sts2.dll` (metadata and decompiled code, without
executing it) shows that `UserDataPathProvider.GetProfileDir(profileId)` returns:

- `profile{profileId}` in ordinary mode;
- `modded/profile{profileId}` when `UserDataPathProvider.IsRunningModded` is true.

`SaveManager` uses this provider to resolve profile-scoped save paths.
`ModManager.IsRunningModded()` checks detected/loaded mod states and does not filter
by the manifest's `affects_gameplay` field. That field is used to classify mod lists;
it is not an opt-out from the modded save namespace.

This explains the observed profile switch. It does not prove that all global settings,
Steam Cloud behavior, achievements, and host/client behavior are isolated identically.
No local save directories or Steam Cloud state on the user's PC have been inspected.
No save file was uploaded, copied, merged, reset, or edited by the assistant.

## Supported next test

Keep the normal save untouched. If the user chooses to continue testing:

1. Close the game before adding or removing mod files.
2. Enable our two bridge files as before. Expect the separate modded profile.
3. Start only a disposable new run in that modded profile; do not import the normal run.
4. Open `http://127.0.0.1:15527/coach/v1/state` and compare fields with the in-game UI.
5. Close the game and remove only our two files to return to normal play.

A backup of the normal save while the game is closed is advisable before further local
experiments; locate and verify its actual folder on the PC rather than guessing paths.
Do not replace, synchronize, or merge `profile*` and `modded/profile*` directories.
Do not patch the game into using normal saves with mods loaded. The bridge does not
provide such a bypass, nor should its read-only promise imply that loading mods has
no effect on game-level profile selection.

If the user requires the coach on the existing normal run, that requirement remains
unresolved with this mod-based architecture. A separate approved migration or a
non-mod observation approach would be a distinct task; neither has been performed.
