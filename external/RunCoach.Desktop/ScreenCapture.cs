using System.Diagnostics;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

namespace RunCoach.Desktop;
internal static class ScreenCapture
{
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct Point { public int X, Y; }
    [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] private static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);

    public static async Task<CaptureResult> ReadVisibleGame()
    {
        // Process metadata identifies the window only. No process handle or memory is read.
        var foreground = GetForegroundWindow();
        var game = Process.GetProcesses().FirstOrDefault(p =>
        {
            try { return p.MainWindowHandle == foreground &&
                (p.ProcessName.Equals("SlayTheSpire2", StringComparison.OrdinalIgnoreCase) ||
                 p.ProcessName.Equals("sts2", StringComparison.OrdinalIgnoreCase)); }
            catch { return false; }
        });
        if (game == null || IsIconic(foreground)) throw new InvalidOperationException("Focus Slay the Spire 2 and press F8. Only the foreground game can be captured.");
        if (!GetClientRect(foreground, out var rect)) throw new InvalidOperationException("The game window could not be measured.");
        var origin = new Point();
        if (!ClientToScreen(foreground, ref origin)) throw new InvalidOperationException("The game window location is unavailable.");
        int width = rect.Right - rect.Left, height = rect.Bottom - rect.Top;
        if (width < 320 || height < 200 || width > 8000 || height > 5000) throw new InvalidOperationException("The game window has an unsupported size.");
        var bounds = new System.Drawing.Rectangle(origin.X, origin.Y, width, height);
        if (!Screen.AllScreens.Any(s => s.Bounds.Contains(bounds))) throw new InvalidOperationException("Place the entire game window on one screen before capturing.");
        using var full = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(full)) graphics.CopyFromScreen(origin.X, origin.Y, 0, 0, full.Size, CopyPixelOperation.SourceCopy);
        // Bound image/memory/WinRT OCR work. Coordinates in output match the resized screenshot.
        double scale = Math.Min(1d, Math.Min(1920d / width, 1920d / height));
        using var image = new Bitmap(full, new Size((int)(width * scale), (int)(height * scale)));
        using var png = new MemoryStream(); image.Save(png, ImageFormat.Png);
        byte[] bytes = png.ToArray();
        string text = ""; ScreenWord[] words = []; string? ocrError = null;
        try
        {
            using var stream = new InMemoryRandomAccessStream();
            using (var writer = new DataWriter(stream.GetOutputStreamAt(0)))
            {
                writer.WriteBytes(bytes); await writer.StoreAsync(); await writer.FlushAsync(); writer.DetachStream();
            }
            stream.Seek(0);
            var decoder = await BitmapDecoder.CreateAsync(stream);
            using var software = await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);
            var engine = OcrEngine.TryCreateFromUserProfileLanguages() ?? OcrEngine.TryCreateFromLanguage(new Language("en-US"));
            if (engine == null) throw new InvalidOperationException("No supported Windows OCR language is installed.");
            var result = await engine.RecognizeAsync(software);
            text = result.Text;
            words = result.Lines.SelectMany(l => l.Words).Select(w => new ScreenWord(w.Text, w.BoundingRect.X, w.BoundingRect.Y, w.BoundingRect.Width, w.BoundingRect.Height)).ToArray();
        }
        catch (Exception) { ocrError = "Windows OCR was unavailable. The screenshot is still usable; enter the visible stats manually."; }
        return new CaptureResult(Guid.NewGuid().ToString("N"), DateTimeOffset.UtcNow.ToString("O"), image.Width, image.Height,
            "data:image/png;base64," + Convert.ToBase64String(bytes), text, words, ocrError);
    }
}
