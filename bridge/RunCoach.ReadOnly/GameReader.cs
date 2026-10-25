using Godot;
using MegaCrit.Sts2.Core.Saves;
using MegaCrit.Sts2.Core.Modding;
using MegaCrit.Sts2.Core.Runs;
using MegaCrit.Sts2.Core.Multiplayer.Game;

namespace RunCoach.ReadOnly;

[ModInitializer("Initialize")]
public static class GameReader
{
    private static BridgeServer? server;
    private static long lastRead;
    // Exact assembly uploaded by the user, screenshot v0.107.1. Fail closed after a patch.
    private const string ExpectedGameMvid = "97f10687-c306-4798-ab75-8b9f23f34dfb";

    public static void Initialize()
    {
        if (server != null) return;
        try
        {
            server = new BridgeServer();
            var tree = (SceneTree)Engine.GetMainLoop();
            tree.Connect(SceneTree.SignalName.ProcessFrame, Callable.From(Poll));
            GD.Print("[RunCoach.ReadOnly] route-coach preview on http://127.0.0.1:15527/coach; modded saves are separate");
        }
        catch (Exception ex)
        {
            server?.Dispose();
            server = null;
            GD.PrintErr($"[RunCoach.ReadOnly] startup failed ({ex.GetType().Name})");
        }
    }

    private static void Poll()
    {
        if (System.Environment.TickCount64 - lastRead < 500) return;
        lastRead = System.Environment.TickCount64;
        try
        {
            var manager = RunManager.Instance;
            bool active = manager.IsInProgress;
            var run = active ? manager.DebugOnlyGetState() : null;
            if (active && run == null) throw new InvalidOperationException("Run is transitioning");
            // Resource property reads only. MapReader separately observes map UI travelability.
            // No hooks, actions, Harmony patches, game saves, platform names, or player IDs.
            var players = run?.Players.Select((p, slot) => new
            {
                slot,
                character = p.Character.Id.Entry,
                current_hp = p.Creature.CurrentHp,
                max_hp = p.Creature.MaxHp,
                gold = p.Gold,
                deck_count = p.Deck.Cards.Count(),
                relic_count = p.Relics.Count(),
                potion_count = p.PotionSlots.Count(potion => potion != null)
            }).ToArray();
            object? mapState = null;
            string? mapError = null;
            if (run != null)
            {
                try { mapState = MapReader.Read(run); }
                catch (Exception) { mapError = "Map is unavailable or still being generated."; }
            }
            bool gameMatches = typeof(RunManager).Assembly.ManifestModule.ModuleVersionId.ToString() == ExpectedGameMvid;
            server?.Publish(new
            {
                schema = BridgeServer.Schema,
                bridge_id = "RunCoach.ReadOnly",
                bridge_version = BridgeServer.Version,
                game_version = (string?)null, // Never infer version from uploaded screenshots.
                compatibility = gameMatches ? "assembly_matched" : "unsupported_game_build",
                save_profile_mode = UserDataPathProvider.IsRunningModded ? "modded" : "normal",
                map = mapState, map_error = mapError,
                status = "ok",
                timestamp = DateTimeOffset.UtcNow.ToString("O"),
                active,
                is_multiplayer = active ? (bool?)manager.NetService.Type.IsMultiplayer() : null,
                act = run == null ? (int?)null : run.CurrentActIndex + 1,
                floor = run == null ? (int?)null : run.TotalFloor,
                ascension = run == null ? (int?)null : run.AscensionLevel,
                current_room_type = run?.CurrentRoom?.GetType().Name,
                players = (object?)players ?? Array.Empty<object>()
            });
        }
        catch (Exception)
        {
            // Never continue serving a previous run after failed sampling.
            server?.Publish(new { schema = BridgeServer.Schema, status = "unavailable",
                                  error = "Game state cannot be read by this build" });
        }
    }
}
