using System.IO;

namespace Agendamea.Setup.Engine;

public sealed class CliOptions
{
    public bool Silent { get; set; }
    public bool Uninstall { get; set; }
    public bool DeleteUserData { get; set; }
    public bool LaunchAfterInstall { get; set; }
    public bool CreateDesktopShortcut { get; set; } = true;
    public bool CreateStartMenuShortcut { get; set; } = true;
    public bool LaunchAtStartup { get; set; }
    public bool InstallCliPath { get; set; } = true;
    public string InstallDir { get; set; } = GetDefaultInstallDir();
    public string? LanguageCode { get; set; }
    public string? ExternalPayloadPath { get; set; }
    public bool SkipWindowsIntegration { get; set; }

    public static string GetDefaultInstallDir()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(localAppData, "Programs", "Agendamea");
    }

    public static string GetUserDataDir()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return Path.Combine(appData, "Agendamea");
    }

    public static CliOptions Parse(string[] args, string? executablePath = null)
    {
        var opts = new CliOptions();
        var exeName = Path.GetFileName(executablePath ?? Environment.ProcessPath ?? string.Empty);
        if (exeName.Equals("uninstall.exe", StringComparison.OrdinalIgnoreCase) ||
            exeName.StartsWith("uninst", StringComparison.OrdinalIgnoreCase))
        {
            opts.Uninstall = true;
            var exeDir = Path.GetDirectoryName(executablePath ?? Environment.ProcessPath);
            if (!string.IsNullOrWhiteSpace(exeDir))
            {
                opts.InstallDir = exeDir;
            }
        }

        for (var i = 0; i < args.Length; i++)
        {
            var raw = args[i]?.Trim() ?? string.Empty;
            if (string.IsNullOrEmpty(raw)) continue;
            var upper = raw.ToUpperInvariant();

            if (upper is "/S" or "/SILENT" or "/VERYSILENT" or "/P" or "--SILENT" or "-S")
            {
                opts.Silent = true;
            }
            else if (upper is "--UNINSTALL" or "/UNINSTALL" or "-U")
            {
                opts.Uninstall = true;
            }
            else if (upper is "--DELETE-DATA" or "/DELETE-DATA")
            {
                opts.DeleteUserData = true;
            }
            else if (upper is "--LAUNCH" or "/LAUNCH" or "--FORCE-RUN")
            {
                opts.LaunchAfterInstall = true;
            }
            else if (upper is "--NO-DESKTOP" or "/NO-DESKTOP")
            {
                opts.CreateDesktopShortcut = false;
            }
            else if (upper is "--NO-STARTMENU" or "/NO-STARTMENU")
            {
                opts.CreateStartMenuShortcut = false;
            }
            else if (upper is "--STARTUP" or "/STARTUP")
            {
                opts.LaunchAtStartup = true;
            }
            else if (upper is "--NO-CLI" or "/NO-CLI")
            {
                opts.InstallCliPath = false;
            }
            else if (upper is "--SKIP-INTEGRATION")
            {
                opts.SkipWindowsIntegration = true;
            }
            else if (upper.StartsWith("/DIR=") || upper.StartsWith("--DIR=") || upper.StartsWith("/D="))
            {
                var eq = raw.IndexOf('=');
                var val = raw[(eq + 1)..].Trim().Trim('"');
                if (!string.IsNullOrWhiteSpace(val))
                {
                    opts.InstallDir = Path.GetFullPath(val);
                }
            }
            else if ((upper is "/DIR" or "--DIR") && i + 1 < args.Length)
            {
                var val = args[++i].Trim().Trim('"');
                if (!string.IsNullOrWhiteSpace(val))
                {
                    opts.InstallDir = Path.GetFullPath(val);
                }
            }
            else if (upper.StartsWith("--LANG=") || upper.StartsWith("/LANG="))
            {
                var eq = raw.IndexOf('=');
                opts.LanguageCode = raw[(eq + 1)..].Trim().Trim('"');
            }
            else if (upper.StartsWith("--PAYLOAD="))
            {
                var eq = raw.IndexOf('=');
                opts.ExternalPayloadPath = raw[(eq + 1)..].Trim().Trim('"');
            }
            else if (upper == "--PAYLOAD" && i + 1 < args.Length)
            {
                opts.ExternalPayloadPath = args[++i].Trim().Trim('"');
            }
        }

        return opts;
    }
}
