namespace RunCoach.Desktop;
internal static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        try { Application.Run(new CoachWindow()); }
        catch (Exception ex) { MessageBox.Show($"Run Coach could not start: {ex.Message}", "Run Coach", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
}
