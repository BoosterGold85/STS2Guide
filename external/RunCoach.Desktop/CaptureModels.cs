namespace RunCoach.Desktop;
public sealed record ScreenWord(string Text, double X, double Y, double Width, double Height);
public sealed record CaptureResult(string Id, string Timestamp, int Width, int Height, string Image, string Text, ScreenWord[] Words, string? OcrError);
