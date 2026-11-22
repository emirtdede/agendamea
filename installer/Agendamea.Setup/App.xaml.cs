using System.Windows;
using Agendamea.Setup.Engine;
using Agendamea.Setup.Localization;

namespace Agendamea.Setup;

public partial class App : Application
{
    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var currentExe = Environment.ProcessPath ?? string.Empty;
        var options = CliOptions.Parse(e.Args, currentExe);
        var locale = LocaleManager.Resolve(options.LanguageCode);

        if (options.Silent)
        {
            var exitCode = await RunSilentAsync(options, locale, currentExe);
            Shutdown(exitCode);
            return;
        }

        var window = new MainWindow(options, locale, currentExe);
        MainWindow = window;
        window.Closed += (_, _) => Shutdown(0);
        window.Show();
    }

    private static async Task<int> RunSilentAsync(
        CliOptions options,
        InstallerLocale locale,
        string currentExe)
    {
        try
        {
            var engine = new InstallEngine();
            if (options.Uninstall)
            {
                await engine.UninstallAsync(options, locale, currentExe, progress: null);
                InstallEngine.ScheduleSelfCleanupIfNeeded(options.InstallDir, currentExe);
            }
            else
            {
                await engine.InstallAsync(options, locale, currentExe, progress: null);
                if (options.LaunchAfterInstall)
                {
                    InstallEngine.LaunchInstalledApp(options.InstallDir);
                }
            }
            return 0;
        }
        catch
        {
            return 1;
        }
    }
}
