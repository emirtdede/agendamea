using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using Microsoft.Win32;

namespace Agendamea.Setup.Engine;

/// <summary>
/// Native Windows Shell integration (COM IShellLinkW shortcuts, HKCU Uninstall/Run registry keys,
/// user PATH CLI shims, and SHChangeNotify refresh) with zero PowerShell or UAC dependency.
/// </summary>
public static class ShellIntegration
{
    public const string UninstallRegPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Agendamea";
    public const string RunRegPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    public const string RunValueName = "Agendamea";

    private const uint SHCNE_ASSOCCHANGED = 0x08000000;
    private const uint SHCNF_IDLIST = 0x0000;

    [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = false)]
    private static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern IntPtr SendMessageTimeout(
        IntPtr hWnd,
        uint msg,
        UIntPtr wParam,
        string lParam,
        uint fuFlags,
        uint uTimeout,
        out UIntPtr lpdwResult);

    public static void NotifyShellChanged()
    {
        try
        {
            SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, IntPtr.Zero, IntPtr.Zero);
        }
        catch
        {
            // Non-fatal
        }
    }

    public static void BroadcastEnvironmentChange()
    {
        try
        {
            SendMessageTimeout(
                new IntPtr(0xFFFF),
                0x001A, // WM_SETTINGCHANGE
                UIntPtr.Zero,
                "Environment",
                0x0002, // SMTO_ABORTIFHUNG
                1000,
                out _);
        }
        catch
        {
            // Non-fatal
        }
    }

    public static void CreateShortcut(
        string shortcutPath,
        string targetExePath,
        string workingDir,
        string description,
        string? iconPath = null)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(shortcutPath))!);
        var link = (IShellLinkW)new ShellLinkCoClass();
        try
        {
            link.SetPath(targetExePath);
            link.SetWorkingDirectory(workingDir);
            link.SetDescription(description);
            link.SetIconLocation(iconPath ?? targetExePath, 0);

            var persistFile = (IPersistFile)link;
            persistFile.Save(shortcutPath, false);
        }
        finally
        {
            if (Marshal.IsComObject(link))
            {
                Marshal.ReleaseComObject(link);
            }
        }
    }

    public static string GetDesktopShortcutPath() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Agendamea.lnk");

    public static string GetStartMenuShortcutPath() =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Programs),
            "Agendamea.lnk");

    public static void WriteUninstallRegistry(
        string installDir,
        string appExePath,
        string uninstallExePath,
        string version,
        long installedBytes)
    {
        using var key = Registry.CurrentUser.CreateSubKey(UninstallRegPath);
        if (key is null) return;

        key.SetValue("DisplayName", "Agendamea", RegistryValueKind.String);
        key.SetValue("DisplayVersion", version, RegistryValueKind.String);
        key.SetValue("Publisher", "Vellium Teknoloji A.S.", RegistryValueKind.String);
        key.SetValue("URLInfoAbout", "https://vellium.dev", RegistryValueKind.String);
        key.SetValue("DisplayIcon", $"{appExePath},0", RegistryValueKind.String);
        key.SetValue("InstallLocation", installDir, RegistryValueKind.String);
        key.SetValue("UninstallString", $"\"{uninstallExePath}\" --uninstall", RegistryValueKind.String);
        key.SetValue("QuietUninstallString", $"\"{uninstallExePath}\" --uninstall /S", RegistryValueKind.String);
        key.SetValue("EstimatedSize", (int)Math.Max(1024, installedBytes / 1024), RegistryValueKind.DWord);
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
    }

    public static void RemoveUninstallRegistry()
    {
        try
        {
            Registry.CurrentUser.DeleteSubKeyTree(UninstallRegPath, throwOnMissingSubKey: false);
        }
        catch
        {
            // Ignore
        }
    }

    public static void SetLaunchAtStartup(bool enabled, string? appExePath = null)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunRegPath, writable: true);
            if (key is null) return;
            if (enabled && !string.IsNullOrWhiteSpace(appExePath))
            {
                key.SetValue(RunValueName, $"\"{appExePath}\" --tray", RegistryValueKind.String);
            }
            else
            {
                key.DeleteValue(RunValueName, throwOnMissingValue: false);
            }
        }
        catch
        {
            // Non-fatal
        }
    }

    public static void InstallCliShims(string installDir)
    {
        var binDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Agendamea",
            "bin");
        Directory.CreateDirectory(binDir);

        var appExe = Path.Combine(installDir, "Agendamea.exe");
        var cliScript = Path.Combine(installDir, "resources", "app.asar.unpacked", "cli", "agendamea.cjs");

        var cmdBody = string.Join(
            "\r\n",
            "@echo off",
            "setlocal",
            "chcp 65001 >nul 2>&1",
            "set ELECTRON_RUN_AS_NODE=1",
            $"\"{appExe}\" \"{cliScript}\" %*",
            "endlocal");

        var utf8NoBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
        foreach (var name in new[] { "ag.cmd", "agenda.cmd", "agendamea.cmd" })
        {
            File.WriteAllText(Path.Combine(binDir, name), cmdBody, utf8NoBom);
        }

        // Add binDir to HKCU\Environment\Path if not already present
        try
        {
            using var envKey = Registry.CurrentUser.OpenSubKey("Environment", writable: true);
            if (envKey is null) return;
            var currentPath = envKey.GetValue("Path", string.Empty, RegistryValueOptions.DoNotExpandEnvironmentNames) as string ?? string.Empty;
            var parts = currentPath.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (!parts.Any(p => p.Equals(binDir, StringComparison.OrdinalIgnoreCase)))
            {
                var updated = string.IsNullOrEmpty(currentPath) ? binDir : $"{currentPath.TrimEnd(';')};{binDir}";
                envKey.SetValue("Path", updated, RegistryValueKind.ExpandString);
                BroadcastEnvironmentChange();
            }
        }
        catch
        {
            // Non-fatal
        }
    }

    public static void RemoveCliShims()
    {
        var binDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Agendamea",
            "bin");
        try
        {
            if (Directory.Exists(binDir))
            {
                Directory.Delete(binDir, recursive: true);
            }
        }
        catch
        {
            // Ignore locked files
        }

        try
        {
            using var envKey = Registry.CurrentUser.OpenSubKey("Environment", writable: true);
            if (envKey is null) return;
            var currentPath = envKey.GetValue("Path", string.Empty, RegistryValueOptions.DoNotExpandEnvironmentNames) as string ?? string.Empty;
            var parts = currentPath
                .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(p => !p.Equals(binDir, StringComparison.OrdinalIgnoreCase))
                .ToArray();
            envKey.SetValue("Path", string.Join(';', parts), RegistryValueKind.ExpandString);
            BroadcastEnvironmentChange();
        }
        catch
        {
            // Non-fatal
        }
    }

    [ComImport]
    [Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLinkCoClass { }

    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("000214F9-0000-0000-C000-000000000046")]
    private interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, out IntPtr pfd, int fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, int dwReserved);
        void Resolve(IntPtr hwnd, int fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }
}
