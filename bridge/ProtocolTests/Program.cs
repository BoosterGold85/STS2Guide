using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Text.Json.Nodes;
using RunCoach.ReadOnly;
using RunCoach.Desktop;

var reservation = new TcpListener(IPAddress.Loopback, 0);
reservation.Start();
int port = ((IPEndPoint)reservation.LocalEndpoint).Port;
reservation.Stop();
string lastOverlay = "";
var screenService = new ScreenService(text => lastOverlay = text, () => lastOverlay = "", standalone: args.Length == 1 && args[0] == "--serve-screen");
using var bridge = new BridgeServer(port, screenService.Route);
using var client = new HttpClient(new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false })
{ BaseAddress = new Uri($"http://127.0.0.1:{port}"), Timeout = TimeSpan.FromSeconds(3) };
if (args.Length == 1 && args[0] == "--serve-screen")
{
    Console.WriteLine($"PORT={port}"); Console.ReadLine(); return;
}
if (args.Length == 2 && args[0] == "--serve-fixture")
{
    var fixture = JsonNode.Parse(File.ReadAllText(args[1]))!;
    void PublishFixture()
    {
        fixture["timestamp"] = DateTimeOffset.UtcNow.ToString("O");
        bridge.Publish(fixture);
    }
    PublishFixture();
    using var timer = new Timer(_ => PublishFixture(), null, 500, 500);
    Console.WriteLine($"PORT={port}");
    Console.ReadLine();
    return;
}
int passed = 0;
async Task Expect(string path, HttpStatusCode expected, HttpMethod? method = null, bool origin = false)
{
    using var request = new HttpRequestMessage(method ?? HttpMethod.Get, path);
    if (origin) request.Headers.Add("Origin", "https://example.org");
    using var result = await client.SendAsync(request);
    if (result.StatusCode != expected) throw new Exception($"{path}: {result.StatusCode}, expected {expected}");
    passed++;
}
await Expect("/", HttpStatusCode.OK);
await Expect("/coach", HttpStatusCode.OK);
await Expect("/assets/app.js", HttpStatusCode.OK);
await Expect("/assets/styles.css", HttpStatusCode.OK);
await Expect("/assets/coach.js", HttpStatusCode.OK);
await Expect("/assets/adapter.js", HttpStatusCode.OK);
await Expect("/assets/demo.json", HttpStatusCode.OK);
using (var page = await client.GetAsync("/coach"))
{
    if (page.Content.Headers.ContentType?.MediaType != "text/html") throw new Exception("Wrong HTML MIME");
    if (!page.Headers.Contains("Content-Security-Policy")) throw new Exception("Missing CSP");
    if (!(await page.Content.ReadAsStringAsync()).Contains("Route coach")) throw new Exception("Dashboard missing");
    passed++;
}
using (var request = new HttpRequestMessage(HttpMethod.Get, "/assets/coach.js"))
{
    request.Headers.Add("Origin", $"http://127.0.0.1:{port}");
    using var response = await client.SendAsync(request);
    if (response.StatusCode != HttpStatusCode.OK || response.Content.Headers.ContentType?.MediaType != "text/javascript")
        throw new Exception("Same-origin module requests must work");
    passed++;
}
await Expect("/assets/../../GameReader.cs", HttpStatusCode.NotFound);
await Expect("/coach/v1/state", HttpStatusCode.ServiceUnavailable);
bridge.Publish(new { active = false, schema = BridgeServer.Schema });
await Expect("/coach/v1/state", HttpStatusCode.OK);
using (var document = JsonDocument.Parse(await client.GetStringAsync("/coach/v1/state")))
{
    if (document.RootElement.GetProperty("active").GetBoolean()) throw new Exception("Snapshot mismatch");
    passed++;
}
await Expect("/api/v1/singleplayer", HttpStatusCode.NotFound);
await Expect("/api/v1/multiplayer", HttpStatusCode.NotFound);
await Expect("/coach/v1/state", HttpStatusCode.MethodNotAllowed, HttpMethod.Post);
await Expect("/", HttpStatusCode.MethodNotAllowed, HttpMethod.Options);
await Expect("/coach/v1/state?action=play", HttpStatusCode.BadRequest);
await Expect("/coach/v1/state", HttpStatusCode.Forbidden, origin: true);
bridge.Publish(new { status = "unavailable" });
using (var document = JsonDocument.Parse(await client.GetStringAsync("/coach/v1/state")))
{
    if (document.RootElement.TryGetProperty("active", out _)) throw new Exception("Old active state leaked");
    passed++;
}
async Task RawExpect(string raw, string expected)
{
    using var socket = new TcpClient();
    await socket.ConnectAsync(IPAddress.Loopback, port);
    using var stream = socket.GetStream();
    stream.ReadTimeout = 3000;
    await stream.WriteAsync(System.Text.Encoding.ASCII.GetBytes(raw));
    using var reader = new StreamReader(stream);
    string? line = await reader.ReadLineAsync();
    if (line != expected) throw new Exception($"Raw protocol response: {line}");
    passed++;
}
await RawExpect($"GET / HTTP/1.1\r\nHost: attacker.example:{port}\r\n\r\n", "HTTP/1.1 403 Forbidden");
await RawExpect($"GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nHost: localhost:{port}\r\n\r\n", "HTTP/1.1 400 Bad Request");
await RawExpect($"GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 1\r\n\r\nx", "HTTP/1.1 400 Bad Request");
await RawExpect($"GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-Large: {new string('x', 8200)}\r\n\r\n", "HTTP/1.1 400 Bad Request");
await Expect("/screen", HttpStatusCode.OK);
await Expect("/screen-assets/app.js", HttpStatusCode.OK);
await Expect("/screen-assets/screen_model.js", HttpStatusCode.OK);
await Expect("/screen-assets/styles.css", HttpStatusCode.OK);
await Expect("/screen/v1/status", HttpStatusCode.OK);
await Expect("/screen/v1/image?id=missing", HttpStatusCode.NotFound);
screenService.SetCapture(new CaptureResult("test", DateTimeOffset.UtcNow.ToString("O"), 100, 100, "data:image/png;base64,AA==", "68/80", [], null));
await Expect("/screen/v1/image?id=test", HttpStatusCode.OK);
string plan = Uri.EscapeDataString(JsonSerializer.Serialize(new { capture_id = "test", mode = "safe", score = 60, route = "Fight -> Rest" }));
await Expect("/screen/v1/plan?data=" + plan, HttpStatusCode.OK);
if (!lastOverlay.Contains("SAFE")) throw new Exception("Overlay callback missing");
passed++;
await Expect("/screen/v1/clear", HttpStatusCode.OK);
if (lastOverlay != "") throw new Exception("Overlay was not cleared");
passed++;
await Expect("/screen/v1/plan?data=not-json", HttpStatusCode.BadRequest);
screenService.ClearCapture("Game unavailable");
await Expect("/screen/v1/plan?data=" + plan, HttpStatusCode.Conflict);
await Expect("/screen/v1/plan?data=" + plan, HttpStatusCode.MethodNotAllowed, HttpMethod.Post);
await Task.Delay(5100);
await Expect("/coach/v1/state", HttpStatusCode.ServiceUnavailable);
bridge.Publish(new { active = false, schema = BridgeServer.Schema });
await Expect("/coach/v1/state", HttpStatusCode.OK);
Console.WriteLine($"PASS: {passed} HTTP protocol checks. Game integration NOT compiled or tested by this harness.");
