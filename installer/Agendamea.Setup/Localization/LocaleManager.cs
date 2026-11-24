using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Agendamea.Setup.Localization;

public sealed class InstallerLocale
{
    [JsonPropertyName("code")] public string Code { get; set; } = "en";
    [JsonPropertyName("nativeName")] public string NativeName { get; set; } = "English";
    [JsonPropertyName("englishName")] public string EnglishName { get; set; } = "English";
    [JsonPropertyName("dir")] public string Dir { get; set; } = "ltr";
    [JsonPropertyName("windowTitle")] public string WindowTitle { get; set; } = "Agendamea Setup";
    [JsonPropertyName("uninstallWindowTitle")] public string UninstallWindowTitle { get; set; } = "Uninstall Agendamea";
    [JsonPropertyName("tagline")] public string Tagline { get; set; } = "Fast, offline-first daily task manager with on-device AI.";
    [JsonPropertyName("installButton")] public string InstallButton { get; set; } = "Install";
    [JsonPropertyName("optionsButton")] public string OptionsButton { get; set; } = "Options";
    [JsonPropertyName("optionsTitle")] public string OptionsTitle { get; set; } = "Install Options";
    [JsonPropertyName("languageLabel")] public string LanguageLabel { get; set; } = "Language";
    [JsonPropertyName("installDirLabel")] public string InstallDirLabel { get; set; } = "Install Folder";
    [JsonPropertyName("browseButton")] public string BrowseButton { get; set; } = "Browse";
    [JsonPropertyName("desktopShortcutLabel")] public string DesktopShortcutLabel { get; set; } = "Create Desktop shortcut";
    [JsonPropertyName("startMenuShortcutLabel")] public string StartMenuShortcutLabel { get; set; } = "Create Start Menu shortcut";
    [JsonPropertyName("launchAtStartupLabel")] public string LaunchAtStartupLabel { get; set; } = "Launch at Windows startup";
    [JsonPropertyName("installCliLabel")] public string InstallCliLabel { get; set; } = "Add terminal CLI commands (ag) to user PATH";
    [JsonPropertyName("diskRequiredLabel")] public string DiskRequiredLabel { get; set; } = "Required space";
    [JsonPropertyName("stepPreparing")] public string StepPreparing { get; set; } = "Preparing installation...";
    [JsonPropertyName("stepClosingApp")] public string StepClosingApp { get; set; } = "Closing running Agendamea...";
    [JsonPropertyName("stepExtracting")] public string StepExtracting { get; set; } = "Extracting application files...";
    [JsonPropertyName("stepIntegrating")] public string StepIntegrating { get; set; } = "Creating shortcuts and registration...";
    [JsonPropertyName("stepFinalizing")] public string StepFinalizing { get; set; } = "Finalizing installation...";
    [JsonPropertyName("doneTitle")] public string DoneTitle { get; set; } = "Agendamea is ready";
    [JsonPropertyName("doneSubtitle")] public string DoneSubtitle { get; set; } = "Installation finished cleanly.";
    [JsonPropertyName("closeButton")] public string CloseButton { get; set; } = "Close";
    [JsonPropertyName("launchButton")] public string LaunchButton { get; set; } = "Launch Agendamea";
    [JsonPropertyName("uninstallTitle")] public string UninstallTitle { get; set; } = "Uninstall Agendamea";
    [JsonPropertyName("uninstallSubtitle")] public string UninstallSubtitle { get; set; } = "Application files and shortcuts will be removed.";
    [JsonPropertyName("deleteUserDataLabel")] public string DeleteUserDataLabel { get; set; } = "Also delete local user data and tasks";
    [JsonPropertyName("cancelButton")] public string CancelButton { get; set; } = "Cancel";
    [JsonPropertyName("uninstallButton")] public string UninstallButton { get; set; } = "Uninstall";
    [JsonPropertyName("uninstallingStep")] public string UninstallingStep { get; set; } = "Removing Agendamea...";
    [JsonPropertyName("uninstalledTitle")] public string UninstalledTitle { get; set; } = "Agendamea was uninstalled";
    [JsonPropertyName("uninstalledSubtitle")] public string UninstalledSubtitle { get; set; } = "All application files have been removed cleanly.";
    [JsonPropertyName("errorTitle")] public string ErrorTitle { get; set; } = "Setup could not finish";
    [JsonPropertyName("retryButton")] public string RetryButton { get; set; } = "Retry";
    [JsonPropertyName("footerText")] public string FooterText { get; set; } = "Vellium Teknoloji A.S. · MIT";
    [JsonPropertyName("closeOptionsTooltip")] public string CloseOptionsTooltip { get; set; } = "Close Options";

    public bool IsRtl => string.Equals(Dir, "rtl", StringComparison.OrdinalIgnoreCase);

    public string DisplayLabel => $"{NativeName} ({Code.ToUpperInvariant()})";

    public override string ToString() => DisplayLabel;
}

public static class LocaleManager
{
    private static readonly Lazy<IReadOnlyList<InstallerLocale>> LazyLocales = new(LoadEmbeddedLocales);

    public static IReadOnlyList<InstallerLocale> All => LazyLocales.Value;

    public static InstallerLocale Resolve(string? preferredCode = null)
    {
        var list = All;
        if (!string.IsNullOrWhiteSpace(preferredCode))
        {
            var hit = MatchCode(list, preferredCode);
            if (hit is not null) return hit;
        }

        // Check previously saved installer language
        try
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var langFile = Path.Combine(appData, "Agendamea", "installer-language.txt");
            if (File.Exists(langFile))
            {
                var saved = File.ReadAllText(langFile).Trim();
                var hit = MatchCode(list, saved);
                if (hit is not null) return hit;
            }
        }
        catch
        {
            // Ignore unreadable language file
        }

        // OS UI culture auto-detection
        var uiCulture = CultureInfo.CurrentUICulture;
        var osHit = MatchCode(list, uiCulture.Name)
                    ?? MatchCode(list, uiCulture.TwoLetterISOLanguageName);
        if (osHit is not null) return osHit;

        return MatchCode(list, "en") ?? list[0];
    }

    private static InstallerLocale? MatchCode(IReadOnlyList<InstallerLocale> list, string raw)
    {
        var clean = raw.Trim().Replace('_', '-').ToLowerInvariant();
        if (string.IsNullOrEmpty(clean)) return null;

        var exact = list.FirstOrDefault(l => l.Code.Equals(clean, StringComparison.OrdinalIgnoreCase));
        if (exact is not null) return exact;

        // Special mapping for Traditional vs Simplified Chinese and Portuguese
        if (clean.StartsWith("zh-hant") || clean.StartsWith("zh-tw") || clean.StartsWith("zh-hk"))
        {
            return list.FirstOrDefault(l => l.Code.Equals("zh-TW", StringComparison.OrdinalIgnoreCase));
        }
        if (clean.StartsWith("zh"))
        {
            return list.FirstOrDefault(l => l.Code.Equals("zh-CN", StringComparison.OrdinalIgnoreCase));
        }

        var prefix = clean.Split('-')[0];
        return list.FirstOrDefault(l =>
            l.Code.Equals(prefix, StringComparison.OrdinalIgnoreCase) ||
            l.Code.StartsWith(prefix + "-", StringComparison.OrdinalIgnoreCase));
    }

    private static List<InstallerLocale> LoadEmbeddedLocales()
    {
        var asm = Assembly.GetExecutingAssembly();
        const string resourceName = "Agendamea.Setup.Localization.locales.json";
        using var stream = asm.GetManifestResourceStream(resourceName);
        if (stream is not null)
        {
            var parsed = JsonSerializer.Deserialize<List<InstallerLocale>>(stream);
            if (parsed is { Count: > 0 })
            {
                return parsed;
            }
        }

        return new List<InstallerLocale> { new() };
    }
}
