using System.Diagnostics;
using System.Runtime.InteropServices;
using RunCoach.ReadOnly;

namespace RunCoach.Desktop;
internal sealed class CoachWindow : Form
{
    private const int Port = 15528;
    private readonly BridgeServer server;
    private readonly Label status = new() { AutoSize = false, Dock = DockStyle.Fill, ForeColor = Color.FromArgb(220, 234, 225), Font = new Font("Segoe UI", 11), Padding = new Padding(14), Text = "Open the game map.\nFocus the game, then press F8.\n\nNo mod or save access." };
    private readonly Label heading = new() { Text = "RUN COACH · SCREEN PREVIEW", ForeColor = Color.FromArgb(234, 193, 120), Dock = DockStyle.Top, Height = 42, Padding = new Padding(14, 12, 0, 0), Font = new Font("Segoe UI", 10, FontStyle.Bold) };
    private readonly Button dashboard = new() { Text = "Open coach / review capture", Dock = DockStyle.Bottom, Height = 42 };
    private readonly Button capture = new() { Text = "Capture in 3 seconds", Dock = DockStyle.Bottom, Height = 36 };
    private readonly System.Windows.Forms.Timer expiry = new() { Interval = 1000 };
    private readonly ScreenService service;
    private bool capturing;
    private DateTime lastPlan;
    private bool hasPlan;
    [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] private static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint affinity);

    public CoachWindow()
    {
        Text = "Run Coach — external screen companion"; Width = 380; Height = 410; MinimumSize = new Size(320, 350);
        StartPosition = FormStartPosition.Manual; Location = new Point(20, 90); TopMost = true;
        BackColor = Color.FromArgb(13, 26, 28); FormBorderStyle = FormBorderStyle.SizableToolWindow;
        Controls.Add(status); Controls.Add(heading); Controls.Add(capture); Controls.Add(dashboard);
        dashboard.Click += (_, _) => OpenDashboard();
        capture.Click += async (_, _) => { capture.Enabled = false; status.Text = "Switch to the game now. Capture in 3 seconds…"; await Task.Delay(3000); await TakeCapture(); capture.Enabled = true; };
        service = new ScreenService(text => BeginInvoke(() => { status.Text = text; lastPlan = DateTime.UtcNow; hasPlan = true; }),
            () => BeginInvoke(() => { hasPlan = false; status.Text = "Review the current capture in the coach.\nNo confirmed plan is active."; }));
        server = new BridgeServer(Port, service.Route);
        Shown += (_, _) =>
        {
            SetWindowDisplayAffinity(Handle, 0x11); // Exclude our own overlay where Windows supports it.
            if (!RegisterHotKey(Handle, 1, 0x4000, (uint)Keys.F8)) status.Text += "\nF8 is in use. Use the 3-second capture button.";
            OpenDashboard();
        };
        expiry.Tick += (_, _) =>
        {
            if (hasPlan && DateTime.UtcNow - lastPlan > TimeSpan.FromSeconds(90)) { hasPlan = false; status.Text = "Plan expired.\nOpen the current map and press F8.\nNo stale advice is retained."; }
        };
        expiry.Start();
    }
    protected override void WndProc(ref Message message)
    {
        if (message.Msg == 0x0312 && message.WParam == (IntPtr)1) _ = TakeCapture();
        base.WndProc(ref message);
    }
    private void OpenDashboard() => Process.Start(new ProcessStartInfo($"http://127.0.0.1:{Port}/screen") { UseShellExecute = true });
    private async Task TakeCapture()
    {
        if (capturing) return;
        capturing = true; hasPlan = false; service.ClearCapture("Capturing the foreground game…");
        try
        {
            // Hide only our own overlay. Never activate, click, or send keys to the game.
            Hide(); await Task.Delay(100);
            var next = await ScreenCapture.ReadVisibleGame();
            service.SetCapture(next);
            status.Text = "Capture ready.\nReview the map and stats in the coach window, then confirm the plan.\n\nF8 captures again.";
        }
        catch (Exception ex) { service.ClearCapture(ex.Message); status.Text = ex.Message; }
        finally { Show(); capturing = false; }
    }
    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        UnregisterHotKey(Handle, 1); expiry.Stop(); expiry.Dispose(); server.Dispose(); base.OnFormClosed(e);
    }
}
