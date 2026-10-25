using System.Reflection;
using System.Text.Json;
using RunCoach.ReadOnly;

namespace RunCoach.Desktop;
// Cross-platform, testable local service. No capture, input, game, or save APIs here.
public sealed class ScreenService(Action<string> showPlan, Action clearPlan, bool standalone = true)
{
    private CaptureResult? latest;
    private string lastError = "";
    public void SetCapture(CaptureResult capture) { Interlocked.Exchange(ref latest, capture); lastError = ""; }
    public void ClearCapture(string error) { Interlocked.Exchange(ref latest, null); lastError = error; clearPlan(); }
    public BridgeServer.LocalResponse? Route(string target)
    {
        if (standalone && target == "/") return Json(new { app_id = "RunCoach.Desktop", version = "0.2.0-screen-preview", source = "screen_capture", requires_game_mod = false, automatic_map_recognition = false });
        if (standalone && target == "/coach/v1/state") return new(404, "{\"error\":\"no_game_state_bridge_in_external_app\"}");
        if (target == "/screen" || target == "/screen/") return Asset("index.html", "text/html; charset=utf-8");
        if (target.StartsWith("/screen-assets/", StringComparison.Ordinal))
        {
            string name = target[15..];
            if (name is "app.js" or "screen_model.js" or "styles.css") return Asset(name, name.EndsWith(".css") ? "text/css" : "text/javascript");
            return null;
        }
        if (target == "/screen/v1/status")
        {
            var current = Volatile.Read(ref latest);
            return Json(new { capture_id = current?.Id, captured_at = current?.Timestamp, width = current?.Width, height = current?.Height, text = current?.Text, words = current?.Words, ocr_error = current?.OcrError, error = lastError, source = "screen_capture", automatic_map_recognition = false });
        }
        const string imagePrefix = "/screen/v1/image?id=";
        if (target.StartsWith(imagePrefix, StringComparison.Ordinal))
        {
            var current = Volatile.Read(ref latest);
            if (current == null || target[imagePrefix.Length..] != current.Id) return new(404, "{\"error\":\"capture_unavailable\"}");
            return Json(new { image = current.Image, id = current.Id });
        }
        if (target == "/screen/v1/clear") { clearPlan(); return Json(new { status = "overlay_cleared" }); }
        const string planPrefix = "/screen/v1/plan?data=";
        if (target.StartsWith(planPrefix, StringComparison.Ordinal))
        {
            try
            {
                string body = Uri.UnescapeDataString(target[planPrefix.Length..]);
                if (body.Length > 2000) return new(400, "{\"error\":\"plan_too_large\"}");
                using var document = JsonDocument.Parse(body);
                var root = document.RootElement;
                string? captureId = root.GetProperty("capture_id").GetString();
                var current = Volatile.Read(ref latest);
                if (current == null || current.Id != captureId || DateTimeOffset.UtcNow - DateTimeOffset.Parse(current.Timestamp) > TimeSpan.FromMinutes(15)) return new(409, "{\"error\":\"capture_expired\"}");
                string? mode = root.GetProperty("mode").GetString(), route = root.GetProperty("route").GetString();
                int score = root.GetProperty("score").GetInt32();
                if (mode is not ("safe" or "balanced" or "aggressive") || score < 0 || score > 100 || route == null || route.Length > 500) return new(400, "{\"error\":\"invalid_plan\"}");
                showPlan($"{mode.ToUpperInvariant()} · {score}/100 heuristic\n\n{route}\n\nReviewed screenshot plan · F8 to refresh\nNot an automatic live game reading.");
                return Json(new { status = "shown_in_overlay" });
            }
            catch (Exception ex) when (ex is JsonException or InvalidOperationException or KeyNotFoundException or FormatException)
            { return new(400, "{\"error\":\"invalid_plan\"}"); }
        }
        return null;
    }
    private static BridgeServer.LocalResponse Json(object value) => new(200, JsonSerializer.Serialize(value, BridgeServer.Json));
    private static BridgeServer.LocalResponse Asset(string name, string type)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("ScreenAssets." + name);
        if (stream == null) return new(404, "{}");
        using var reader = new StreamReader(stream);
        return new(200, reader.ReadToEnd(), type + "; charset=utf-8");
    }
}
