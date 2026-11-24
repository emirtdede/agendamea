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
    public const string AppUserModelId = "dev.vellium.agendamea";

    private static readonly PropertyKey PkeyAppUserModelId = new()
    {
        fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),
        pid = 5,
    };

    private const ushort VtLpwstr = 31;
    private const uint StgmRead = 0x00000000;

    [DllImport("ole32.dll")]
    private static extern int PropVariantClear(ref PropVariant pvar);

    private const uint SHCNE_ASSOCCHANGED = 0x08000000;
    private const uint SHCNF_IDLIST = 0x0000;

    [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = false)]
    private static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

    private static readonly System.Text.Json.JsonSerializerOptions IndentedJsonOptions =
        new() { WriteIndented = true };

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
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
        string? iconPath = null,
        string? appUserModelId = AppUserModelId)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(shortcutPath))!);
        var link = (IShellLinkW)new ShellLinkCoClass();
        try
        {
            link.SetPath(targetExePath);
            link.SetWorkingDirectory(workingDir);
            link.SetDescription(description);
            link.SetIconLocation(iconPath ?? targetExePath, 0);

            if (!string.IsNullOrWhiteSpace(appUserModelId) && link is IPropertyStore propStore)
            {
                var pv = new PropVariant
                {
                    vt = VtLpwstr,
                    pointerValue = Marshal.StringToCoTaskMemUni(appUserModelId),
                };
                try
                {
                    var key = PkeyAppUserModelId;
                    propStore.SetValue(ref key, ref pv);
                    propStore.Commit();
                }
                finally
                {
                    _ = PropVariantClear(ref pv);
                }
            }

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

    public static string? ReadShortcutAppUserModelId(string shortcutPath)
    {
        if (!File.Exists(shortcutPath)) return null;
        var link = (IShellLinkW)new ShellLinkCoClass();
        try
        {
            var persistFile = (IPersistFile)link;
            persistFile.Load(shortcutPath, (int)StgmRead);
            if (link is IPropertyStore propStore)
            {
                var key = PkeyAppUserModelId;
                propStore.GetValue(ref key, out var pv);
                try
                {
                    if (pv.vt == VtLpwstr && pv.pointerValue != IntPtr.Zero)
                    {
                        return Marshal.PtrToStringUni(pv.pointerValue);
                    }
                }
                finally
                {
                    _ = PropVariantClear(ref pv);
                }
            }
            return null;
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
                key.SetValue(RunValueName, $"\"{appExePath}\" --minimized", RegistryValueKind.String);
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

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateHardLink(string lpFileName, string lpExistingFileName, IntPtr lpSecurityAttributes);

    private static void SafeDeployBinary(string sourceExe, string targetExe, string? hardlinkSource)
    {
        if (File.Exists(targetExe))
        {
            try
            {
                File.Delete(targetExe);
            }
            catch
            {
                try
                {
                    File.Move(targetExe, $"{targetExe}.old.{Environment.ProcessId}.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}");
                }
                catch
                {
                    // Ignore
                }
            }
        }

        if (!string.IsNullOrEmpty(hardlinkSource) && File.Exists(hardlinkSource))
        {
            try
            {
                if (CreateHardLink(targetExe, hardlinkSource, IntPtr.Zero))
                {
                    return;
                }
            }
            catch
            {
                // Fall back to direct file copy
            }
        }

        File.Copy(sourceExe, targetExe, overwrite: true);
    }

    public static void InstallCliShims(string installDir, string? customBinDir = null, bool skipPathUpdate = false)
    {
        var binDir = string.IsNullOrWhiteSpace(customBinDir)
            ? Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Agendamea",
                "bin")
            : Path.GetFullPath(customBinDir);
        Directory.CreateDirectory(binDir);

        var appExe = Path.Combine(installDir, "Agendamea.exe");
        var unpackedRoot = Path.Combine(installDir, "resources", "app.asar.unpacked");
        var cliScript = Path.Combine(unpackedRoot, "cli", "agendamea.cjs");
        var mcpScript = Path.Combine(unpackedRoot, "mcp", "server.cjs");
        var bundledShimExe = Path.Combine(unpackedRoot, "cli", "bin", "ag.exe");
        if (!File.Exists(bundledShimExe))
        {
            var alt = Path.Combine(installDir, "resources", "bin", "ag.exe");
            if (File.Exists(alt)) bundledShimExe = alt;
        }

        var utf8NoBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);

        if (File.Exists(bundledShimExe))
        {
            var targetManifest = System.Text.Json.JsonSerializer.Serialize(
                new
                {
                    schemaVersion = 1,
                    execPath = appExe,
                    cliScript,
                    mcpScript,
                    runtimeRoot = unpackedRoot,
                    updatedAt = DateTime.UtcNow.ToString("O"),
                },
                IndentedJsonOptions);
            var manifestPath = Path.Combine(binDir, "ag.target.json");
            var manifestTmp = $"{manifestPath}.tmp.{Environment.ProcessId}";
            File.WriteAllText(manifestTmp, targetManifest + "\n", utf8NoBom);
            File.Move(manifestTmp, manifestPath, overwrite: true);

            var primaryExe = Path.Combine(binDir, "ag.exe");
            SafeDeployBinary(bundledShimExe, primaryExe, hardlinkSource: null);
            SafeDeployBinary(bundledShimExe, Path.Combine(binDir, "agenda.exe"), hardlinkSource: primaryExe);
            SafeDeployBinary(bundledShimExe, Path.Combine(binDir, "agendamea.exe"), hardlinkSource: primaryExe);

            foreach (var legacy in new[] { "ag.cmd", "agenda.cmd", "agendamea.cmd", "run-cli.ps1" })
            {
                try
                {
                    var lp = Path.Combine(binDir, legacy);
                    if (File.Exists(lp)) File.Delete(lp);
                }
                catch
                {
                    // Ignore locked legacy shim
                }
            }
        }
        else
        {
            // Unified fallback with PowerShell stdout bridge when ag.exe is absent
            var psHelper = string.Join(
                "\r\n",
                "$env:ELECTRON_RUN_AS_NODE = '1'",
                "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
                "$exe = $args[0]",
                "$script = $args[1]",
                "$rest = @()",
                "if ($args.Length -gt 2) { $rest = $args[2..($args.Length - 1)] }",
                "& $exe $script @rest | Write-Output",
                "exit $LASTEXITCODE",
                "");
            File.WriteAllText(Path.Combine(binDir, "run-cli.ps1"), psHelper, utf8NoBom);

            var cmdBody = string.Join(
                "\r\n",
                "@echo off",
                "setlocal",
                "chcp 65001 >nul 2>&1",
                "if /I \"%~1\"==\"mcp\" if \"%~2\"==\"\" (",
                "  set \"ELECTRON_RUN_AS_NODE=1\"",
                $"  \"{appExe}\" \"{mcpScript}\"",
                "  exit /b %ERRORLEVEL%",
                ")",
                "where node >nul 2>&1",
                "if %ERRORLEVEL%==0 (",
                $"  node \"{cliScript}\" %*",
                "  if not %ERRORLEVEL%==86 exit /b %ERRORLEVEL%",
                ")",
                $"powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0run-cli.ps1\" \"{appExe}\" \"{cliScript}\" %*",
                "exit /b %ERRORLEVEL%",
                "");

            foreach (var name in new[] { "ag.cmd", "agenda.cmd", "agendamea.cmd" })
            {
                File.WriteAllText(Path.Combine(binDir, name), cmdBody, utf8NoBom);
            }
        }

        if (skipPathUpdate)
        {
            return;
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

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    private struct PropertyKey
    {
        public Guid fmtid;
        public uint pid;
    }

    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PropVariant
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr pointerValue;
    }

    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    private interface IPropertyStore
    {
        int GetCount(out uint cProps);
        int GetAt(uint iProp, out PropertyKey pkey);
        int GetValue(ref PropertyKey key, out PropVariant pv);
        int SetValue(ref PropertyKey key, ref PropVariant pv);
        int Commit();
    }
}
