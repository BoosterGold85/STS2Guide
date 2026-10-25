using Godot;
using MegaCrit.Sts2.Core.Map;
using MegaCrit.Sts2.Core.Runs;
using MegaCrit.Sts2.Core.Nodes.Screens.Map;

namespace RunCoach.ReadOnly;

// Adapted from STS2MCP's BuildMapState/BuildMapNode (MIT; THIRD_PARTY.md).
// Only observe graph and UI travelability. Never open the map or invoke UI actions.
public static class MapReader
{
    private static string Id(MapPoint point) => $"{point.coord.col}:{point.coord.row}";

    public static object Read(RunState run)
    {
        var map = run.Map;
        if (map == null) throw new InvalidOperationException("Map not generated");
        var points = map.GetAllMapPoints().Append(map.StartingMapPoint).Append(map.BossMapPoint).ToList();
        if (map.SecondBossMapPoint != null) points.Add(map.SecondBossMapPoint);
        var nodes = points.DistinctBy(Id).Select(p => new
        {
            node_id = Id(p), col = p.coord.col, row = p.coord.row,
            type = p.PointType.ToString(), children = p.Children.Select(Id).Distinct().ToArray()
        }).ToArray();
        var visited = run.VisitedMapCoords;
        string current = visited.Count > 0
            ? $"{visited[visited.Count - 1].col}:{visited[visited.Count - 1].row}"
            : Id(map.StartingMapPoint);
        var screen = NMapScreen.Instance;
        bool open = screen != null && (screen.IsOpen || screen.IsVisibleInTree());
        bool ready = open && screen!.IsTravelEnabled && !screen.IsTraveling;
        var reachable = new HashSet<string>();
        if (ready)
        {
            var queue = new Queue<Node>();
            queue.Enqueue(screen!);
            int examined = 0;
            while (queue.Count > 0)
            {
                if (++examined > 5000) throw new InvalidOperationException("Map UI exceeds observation limit");
                var node = queue.Dequeue();
                if (node is NMapPoint point && point.State == MapPointState.Travelable && point.Point != null)
                    reachable.Add(Id(point.Point));
                foreach (Node child in node.GetChildren()) queue.Enqueue(child);
            }
        }
        string? boss = null;
        try { boss = run.Act.BossEncounter?.Id.Entry; } catch { /* setup may still be in progress */ }
        return new
        {
            current_node_id = current, nodes, reachable_now_ids = reachable.Order().ToArray(),
            decision_ready = ready && reachable.Count > 0, boss,
            notice = !open ? "Open the map in the game to see route advice." :
                     !ready ? "Waiting for the game to allow map travel." :
                     reachable.Count == 0 ? "No selectable map nodes are visible yet." : null
        };
    }
}
