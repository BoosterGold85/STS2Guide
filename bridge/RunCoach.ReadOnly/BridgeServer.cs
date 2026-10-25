using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace RunCoach.ReadOnly;

// Own tiny, bounded HTTP protocol. TCP loopback avoids HTTP.sys URL ACL/admin requirements.
// No game references, request bodies, persistent connections, or commands in this server.
public sealed class BridgeServer : IDisposable
{
    public const string Schema = "run-coach-readonly-v1";
    public const string Version = "0.1.0-preview";
    public const int DefaultPort = 15527;
    private readonly TcpListener listener;
    private readonly Thread thread;
    private readonly int port;
    public sealed record LocalResponse(int Status, string Body, string ContentType = "application/json; charset=utf-8");
    private readonly Func<string, LocalResponse?>? extraRoutes;
    private volatile bool stopping;
    private string snapshot = "{\"status\":\"starting\"}";
    private long publishedAt;
    public static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };

    public BridgeServer(int port = DefaultPort, Func<string, LocalResponse?>? extraRoutes = null)
    {
        if (port < 1 || port > 65535) throw new ArgumentOutOfRangeException(nameof(port));
        this.port = port;
        this.extraRoutes = extraRoutes;
        listener = new TcpListener(IPAddress.Loopback, port);
        listener.Start(8);
        thread = new Thread(Serve) { IsBackground = true, Name = "RunCoach.ReadOnly" };
        thread.Start();
    }

    // Called on the game's main thread. HTTP handlers only read this serialized copy.
    public void Publish(object state)
    {
        string serialized = JsonSerializer.Serialize(state, Json);
        Interlocked.Exchange(ref snapshot, serialized);
        Interlocked.Exchange(ref publishedAt, Environment.TickCount64);
    }

    private void Serve()
    {
        while (!stopping)
        {
            TcpClient connection;
            try { connection = listener.AcceptTcpClient(); }
            catch (SocketException) when (stopping) { break; }
            catch (ObjectDisposedException) { break; }
            using (connection)
            {
                try
                {
                    using var stream = connection.GetStream();
                    stream.ReadTimeout = 2000;
                    stream.WriteTimeout = 2000;
                    Respond(stream);
                }
                catch (Exception ex) when (ex is IOException or SocketException or ObjectDisposedException)
                { /* Malformed or abandoned request: close without touching game state. */ }
            }
        }
    }

    private void Respond(NetworkStream stream)
    {
        // One request per connection; cap bytes and total reading time, even for slow senders.
        var bytes = new List<byte>();
        long started = Environment.TickCount64;
        while (bytes.Count < 8192 && Environment.TickCount64 - started < 2000)
        {
            int b = stream.ReadByte();
            if (b < 0) return;
            if (b > 127 || (b < 32 && b != 13 && b != 10 && b != 9))
            { Send(stream, 400, "{\"error\":\"invalid_headers\"}"); return; }
            bytes.Add((byte)b);
            int n = bytes.Count;
            if (n >= 4 && bytes[n-4] == 13 && bytes[n-3] == 10 && bytes[n-2] == 13 && bytes[n-1] == 10)
                break;
        }
        string raw = Encoding.ASCII.GetString(bytes.ToArray());
        if (!raw.EndsWith("\r\n\r\n"))
        { Send(stream, 400, "{\"error\":\"headers_incomplete_or_too_large\"}"); return; }
        string[] lines = raw.Split("\r\n", StringSplitOptions.None);
        string[] request = lines[0].Split(' ');
        if (request.Length != 3 || (request[2] != "HTTP/1.1" && request[2] != "HTTP/1.0"))
        { Send(stream, 400, "{\"error\":\"invalid_request\"}"); return; }
        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (string line in lines.Skip(1).Take(lines.Length - 3))
        {
            int colon = line.IndexOf(':');
            if (colon <= 0 || !headers.TryAdd(line[..colon], line[(colon + 1)..].Trim()))
            { Send(stream, 400, "{\"error\":\"invalid_or_duplicate_header\"}"); return; }
        }
        if (!headers.TryGetValue("Host", out string? host) ||
            (host != $"127.0.0.1:{port}" && !string.Equals(host, $"localhost:{port}", StringComparison.OrdinalIgnoreCase)))
        { Send(stream, 403, "{\"error\":\"invalid_host\"}"); return; }
        if ((headers.TryGetValue("Origin", out var origin) && origin != $"http://{host}") ||
            (headers.TryGetValue("Sec-Fetch-Site", out var site) && site is "cross-site" or "same-site"))
        { Send(stream, 403, "{\"error\":\"cross_origin_forbidden\"}"); return; }
        if (request[0] != "GET")
        { Send(stream, 405, "{\"error\":\"read_only\"}"); return; }
        if (headers.ContainsKey("Transfer-Encoding") ||
            (headers.TryGetValue("Content-Length", out var length) && length != "0"))
        { Send(stream, 400, "{\"error\":\"request_body_not_supported\"}"); return; }
        string path = request[1];
        // Optional standalone-app routes never exist in the game mod (callback is null).
        if (extraRoutes != null)
        {
            LocalResponse? extra;
            try { extra = extraRoutes(path); }
            catch (Exception) { extra = new LocalResponse(500, "{\"error\":\"helper_request_failed\"}"); }
            if (extra != null) { Send(stream, extra.Status, extra.Body, extra.ContentType); return; }
        }
        if (path.Contains('?'))
        { Send(stream, 400, "{\"error\":\"query_not_supported\"}"); return; }
        if (path == "/coach" || path == "/coach/")
        { SendAsset(stream, "index.html", "text/html; charset=utf-8"); return; }
        if (path.StartsWith("/assets/", StringComparison.Ordinal))
        {
            string name = path[8..];
            if (name is "app.js" or "coach.js" or "adapter.js" or "styles.css" or "demo.json")
            {
                string mime = name.EndsWith(".js") ? "text/javascript; charset=utf-8" : name.EndsWith(".css") ? "text/css; charset=utf-8" : "application/json";
                SendAsset(stream, name, mime); return;
            }
        }
        switch (path)
        {
            case "/":
                Send(stream, 200, JsonSerializer.Serialize(new
                { status = "ok", bridge_id = "RunCoach.ReadOnly", bridge_version = Version, schema = Schema }, Json));
                break;
            case "/coach/v1/state":
                long stamp = Interlocked.Read(ref publishedAt);
                if (stamp == 0 || Environment.TickCount64 - stamp > 5000)
                { Send(stream, 503, "{\"error\":\"snapshot_unavailable_or_stale\"}"); return; }
                Send(stream, 200, Volatile.Read(ref snapshot));
                break;
            default: Send(stream, 404, "{\"error\":\"not_found\"}"); break;
        }
    }

    private static void SendAsset(NetworkStream stream, string name, string contentType)
    {
        using var resource = typeof(BridgeServer).Assembly.GetManifestResourceStream("CoachAssets." + name);
        if (resource == null) { Send(stream, 404, "{\"error\":\"asset_missing\"}"); return; }
        using var reader = new StreamReader(resource);
        Send(stream, 200, reader.ReadToEnd(), contentType);
    }

    private static void Send(NetworkStream stream, int status, string body, string contentType = "application/json; charset=utf-8")
    {
        string reason = status switch
        {
            200 => "OK", 400 => "Bad Request", 403 => "Forbidden", 404 => "Not Found",
            405 => "Method Not Allowed", 503 => "Service Unavailable", _ => "Error"
        };
        byte[] bytes = Encoding.UTF8.GetBytes(body);
        string allow = status == 405 ? "Allow: GET\r\n" : "";
        byte[] header = Encoding.ASCII.GetBytes($"HTTP/1.1 {status} {reason}\r\nContent-Type: {contentType}\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'\r\nContent-Length: {bytes.Length}\r\nCache-Control: no-store\r\nConnection: close\r\n{allow}\r\n");
        stream.Write(header);
        stream.Write(bytes);
    }

    public void Dispose()
    {
        stopping = true;
        listener.Stop();
        thread.Join(TimeSpan.FromSeconds(5));
    }
}
