using System.Diagnostics;
using System.IO;
using System.Text;
using Agendamea.Setup.Localization;

namespace Agendamea.Setup.Engine;

public readonly record struct ProgressUpdate(string StepLabel, double Percent);

public sealed class InstallEngine
{
    public const string AppVersion = "1.1.0";

    public async Task InstallAsync(
        CliOptions options,
        InstallerLocale locale,
        string currentExePath,
        IProgress<ProgressUpdate>? progress,
        CancellationToken ct = default)
    {
        progress?.Report(new ProgressUpdate(locale.StepPreparing, 5));
        await Task.Run(() =>
        {
            ct.ThrowIfCancellationRequested();

            progress?.Report(new ProgressUpdate(locale.StepClosingApp, 10));
            CloseRunningAgendameaProcesses();

            var installDir = Path.GetFullPath(options.InstallDir);
            Directory.CreateDirectory(installDir);

            // Persist chosen installer language for first-launch GUI locale parity
            try
            {
                var userDataDir = CliOptions.GetUserDataDir();
                Directory.CreateDirectory(userDataDir);
                File.WriteAllText(
                    Path.Combine(userDataDir, "installer-language.txt"),
                    locale.Code,
                    Encoding.UTF8);
            }
            catch
            {
                // Non-fatal
            }

            // Extract embedded SFX ZIP (or external payload in tests)
            progress?.Report(new ProgressUpdate(locale.StepExtracting, 15));
            SfxPayloadReader.ExtractPayload(
                currentExePath,
                installDir,
                options.ExternalPayloadPath,
                ratio => progress?.Report(new ProgressUpdate(locale.StepExtracting, 15 + ratio * 68)),
                ct);

            ct.ThrowIfCancellationRequested();
            progress?.Report(new ProgressUpdate(locale.StepIntegrating, 86));

            // Write compact uninstaller stub (strip SFX payload so uninstall.exe is clean)
            var uninstallExePath = Path.Combine(installDir, "uninstall.exe");
            if (!string.IsNullOrWhiteSpace(currentExePath) &&
                File.Exists(currentExePath) &&
                !Path.GetFullPath(currentExePath).Equals(Path.GetFullPath(uninstallExePath), StringComparison.OrdinalIgnoreCase))
            {
                SfxPayloadReader.CopyCleanUninstallerStub(currentExePath, uninstallExePath);
            }

            var appExePath = Path.Combine(installDir, "Agendamea.exe");
            var installedBytes = CalculateDirectorySize(installDir);

            if (!options.SkipWindowsIntegration)
            {
                ShellIntegration.WriteUninstallRegistry(
                    installDir,
                    appExePath,
                    uninstallExePath,
                    AppVersion,
                    installedBytes);

                if (options.CreateDesktopShortcut)
                {
                    ShellIntegration.CreateShortcut(
                        ShellIntegration.GetDesktopShortcutPath(),
                        appExePath,
                        installDir,
                        "Agendamea - Local-First Task Manager");
                }

                if (options.CreateStartMenuShortcut)
                {
                    ShellIntegration.CreateShortcut(
                        ShellIntegration.GetStartMenuShortcutPath(),
                        appExePath,
                        installDir,
                        "Agendamea - Local-First Task Manager");
                }

                ShellIntegration.SetLaunchAtStartup(options.LaunchAtStartup, appExePath);

                if (options.InstallCliPath)
                {
                    ShellIntegration.InstallCliShims(installDir);
                }

                ShellIntegration.NotifyShellChanged();
            }

            progress?.Report(new ProgressUpdate(locale.StepFinalizing, 100));
        }, ct);
    }

    public async Task UninstallAsync(
        CliOptions options,
        InstallerLocale locale,
        string currentExePath,
        IProgress<ProgressUpdate>? progress,
        CancellationToken ct = default)
    {
        progress?.Report(new ProgressUpdate(locale.StepClosingApp, 10));
        await Task.Run(() =>
        {
            ct.ThrowIfCancellationRequested();
            CloseRunningAgendameaProcesses();

            progress?.Report(new ProgressUpdate(locale.UninstallingStep, 30));

            if (!options.SkipWindowsIntegration)
            {
                TryDeleteFile(ShellIntegration.GetDesktopShortcutPath());
                TryDeleteFile(ShellIntegration.GetStartMenuShortcutPath());
                ShellIntegration.SetLaunchAtStartup(false);
                ShellIntegration.RemoveCliShims();
                ShellIntegration.RemoveUninstallRegistry();
            }

            progress?.Report(new ProgressUpdate(locale.UninstallingStep, 60));

            var installDir = Path.GetFullPath(options.InstallDir);
            var fullCurrentExe = string.IsNullOrWhiteSpace(currentExePath)
                ? string.Empty
                : Path.GetFullPath(currentExePath);

            var runningInsideInstallDir =
                !string.IsNullOrEmpty(fullCurrentExe) &&
                fullCurrentExe.StartsWith(installDir, StringComparison.OrdinalIgnoreCase);

            if (Directory.Exists(installDir))
            {
                RemoveDirectoryContents(installDir, runningInsideInstallDir ? fullCurrentExe : null);
                if (!runningInsideInstallDir)
                {
                    try { Directory.Delete(installDir, recursive: true); } catch { }
                }
            }

            if (options.DeleteUserData)
            {
                progress?.Report(new ProgressUpdate(locale.UninstallingStep, 85));
                var dataDir = CliOptions.GetUserDataDir();
                if (Directory.Exists(dataDir))
                {
                    try { Directory.Delete(dataDir, recursive: true); } catch { }
                }
            }

            if (!options.SkipWindowsIntegration)
            {
                ShellIntegration.NotifyShellChanged();
            }

            progress?.Report(new ProgressUpdate(locale.UninstallingStep, 100));
        }, ct);
    }

    public static void ScheduleSelfCleanupIfNeeded(string installDir, string currentExePath)
    {
        if (string.IsNullOrWhiteSpace(currentExePath)) return;
        var fullDir = Path.GetFullPath(installDir);
        var fullExe = Path.GetFullPath(currentExePath);
        if (!fullExe.StartsWith(fullDir, StringComparison.OrdinalIgnoreCase)) return;

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c ping 127.0.0.1 -n 3 > nul & rmdir /s /q \"{fullDir}\"",
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            Process.Start(psi);
        }
        catch
        {
            // Non-fatal
        }
    }

    public static void LaunchInstalledApp(string installDir)
    {
        var appExe = Path.Combine(installDir, "Agendamea.exe");
        if (!File.Exists(appExe)) return;
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = appExe,
                WorkingDirectory = installDir,
                UseShellExecute = true,
            });
        }
        catch
        {
            // Ignore launch failures
        }
    }

    private static void CloseRunningAgendameaProcesses()
    {
        var currentPid = Environment.ProcessId;
        foreach (var proc in Process.GetProcessesByName("Agendamea"))
        {
            try
            {
                if (proc.Id == currentPid) continue;
                proc.CloseMainWindow();
                if (!proc.WaitForExit(2500))
                {
                    proc.Kill(entireProcessTree: true);
                    proc.WaitForExit(1500);
                }
            }
            catch
            {
                // Ignore already exited processes
            }
            finally
            {
                proc.Dispose();
            }
        }
    }

    private static void RemoveDirectoryContents(string dir, string? skipFile)
    {
        foreach (var file in Directory.GetFiles(dir, "*", SearchOption.AllDirectories))
        {
            if (skipFile is not null &&
                Path.GetFullPath(file).Equals(skipFile, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }
            TryDeleteFile(file);
        }

        foreach (var sub in Directory.GetDirectories(dir, "*", SearchOption.AllDirectories)
                     .OrderByDescending(d => d.Length))
        {
            try
            {
                if (!Directory.EnumerateFileSystemEntries(sub).Any())
                {
                    Directory.Delete(sub, false);
                }
            }
            catch
            {
                // Ignore busy dirs
            }
        }
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.SetAttributes(path, FileAttributes.Normal);
                File.Delete(path);
            }
        }
        catch
        {
            // Ignore locked files
        }
    }

    private static long CalculateDirectorySize(string dir)
    {
        try
        {
            return Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories)
                .Sum(f => new FileInfo(f).Length);
        }
        catch
        {
            return 0;
        }
    }
}
