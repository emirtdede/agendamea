using System.IO;
using System.IO.Compression;
using System.Text;
using Agendamea.Setup.Engine;
using Agendamea.Setup.Localization;

var failures = new List<string>();
void Check(bool condition, string name)
{
    if (condition)
    {
        Console.WriteLine($"[PASS] {name}");
    }
    else
    {
        Console.WriteLine($"[FAIL] {name}");
        failures.Add(name);
    }
}

// 1. All 73 languages embedded + RTL detection + zero em/en-dash leakage
var allLocales = LocaleManager.All;
Check(allLocales.Count == 73, $"73 languages embedded (actual: {allLocales.Count})");
var tr = LocaleManager.Resolve("tr");
var en = LocaleManager.Resolve("en");
var ar = LocaleManager.Resolve("ar");
Check(tr.Code == "tr" && !tr.IsRtl && tr.InstallButton == "Kur", "Turkish locale resolves cleanly");
Check(en.Code == "en" && !en.IsRtl && en.InstallButton == "Install", "English locale resolves cleanly");
Check(ar.Code == "ar" && ar.IsRtl, "Arabic locale marks IsRtl = true");

var dashLeak = allLocales.Any(l =>
    new[]
    {
        l.WindowTitle, l.UninstallWindowTitle, l.Tagline, l.InstallButton, l.OptionsButton,
        l.OptionsTitle, l.DoneTitle, l.DoneSubtitle, l.UninstallTitle, l.UninstallSubtitle,
        l.UninstalledTitle, l.UninstalledSubtitle, l.FooterText,
    }.Any(s => s.Contains('\u2013') || s.Contains('\u2014')));
Check(!dashLeak, "Zero em/en-dash leakage across all 73 installer locales");

// 2. CLI Options Parsing (NSIS / Inno / Silent / Custom Dir / Uninstall flags)
string[] cli1Args = ["/S", "/DIR=C:\\Temp\\AgendameaTest", "--lang=en", "--no-desktop", "--startup"];
var cli1 = CliOptions.Parse(cli1Args);
Check(cli1.Silent && !cli1.Uninstall && cli1.InstallDir.EndsWith("AgendameaTest") && cli1.LanguageCode == "en" && !cli1.CreateDesktopShortcut && cli1.LaunchAtStartup,
    "CLI parser handles /S, /DIR=..., --lang, --no-desktop, --startup");

string[] cli2Args = ["/VERYSILENT", "--delete-data"];
var cli2 = CliOptions.Parse(cli2Args, @"C:\Temp\MyInstall\uninstall.exe");
Check(cli2.Silent && cli2.Uninstall && cli2.DeleteUserData && cli2.InstallDir.EndsWith("MyInstall"),
    "CLI parser auto-detects uninstall.exe mode and --delete-data");

// 3. Appended-ZIP SFX Build -> Trailer Read -> Safe Extract -> Clean Stub Copy -> Headless Install & Uninstall E2E
var tmpRoot = Path.Combine(Path.GetTempPath(), $"agendamea-setup-test-{Guid.NewGuid():N}");
Directory.CreateDirectory(tmpRoot);
try
{
    var fakeStub = Path.Combine(tmpRoot, "stub.exe");
    var fakeStubBytes = Encoding.UTF8.GetBytes("MZ_FAKE_STUB_BINARY_HEADER_" + new string('X', 4096));
    File.WriteAllBytes(fakeStub, fakeStubBytes);

    var payloadSrcDir = Path.Combine(tmpRoot, "payload-src");
    Directory.CreateDirectory(Path.Combine(payloadSrcDir, "resources", "app.asar.unpacked", "cli"));
    File.WriteAllText(Path.Combine(payloadSrcDir, "Agendamea.exe"), "FAKE_ELECTRON_APP");
    File.WriteAllText(Path.Combine(payloadSrcDir, "resources", "app.asar.unpacked", "cli", "agendamea.cjs"), "console.log('ok');");

    var payloadZip = Path.Combine(tmpRoot, "payload.zip");
    ZipFile.CreateFromDirectory(payloadSrcDir, payloadZip);

    var sfxExe = Path.Combine(tmpRoot, "Agendamea-Setup-Test.exe");
    SfxPayloadReader.BuildBundle(fakeStub, payloadZip, sfxExe);

    var trailer = SfxPayloadReader.TryReadTrailer(sfxExe);
    Check(trailer is not null && trailer.Value.PayloadOffset == fakeStubBytes.Length,
        "SFX trailer offset matches exact stub length");

    // Headless install into isolated temp dir (SkipWindowsIntegration=true so test does not touch real user shortcuts/registry)
    var installDir = Path.Combine(tmpRoot, "installed");
    var engine = new InstallEngine();
    var installOpts = new CliOptions
    {
        Silent = true,
        InstallDir = installDir,
        SkipWindowsIntegration = true,
    };
    await engine.InstallAsync(installOpts, tr, sfxExe, progress: null);

    var installedAppExe = Path.Combine(installDir, "Agendamea.exe");
    var installedUninstallExe = Path.Combine(installDir, "uninstall.exe");
    Check(File.Exists(installedAppExe), "InstallEngine extracted Agendamea.exe from SFX payload");
    Check(File.Exists(installedUninstallExe), "InstallEngine wrote clean uninstall.exe stub");
    Check(new FileInfo(installedUninstallExe).Length == fakeStubBytes.Length,
        "uninstall.exe strips embedded ZIP payload (exact stub size)");

    // Zip-Slip path traversal defense test
    var badZip = Path.Combine(tmpRoot, "zipslip.zip");
    using (var z = ZipFile.Open(badZip, ZipArchiveMode.Create))
    {
        var entry = z.CreateEntry("../evil.txt");
        using var sw = new StreamWriter(entry.Open());
        sw.Write("malicious");
    }
    var zipSlipRejected = false;
    try
    {
        SfxPayloadReader.ExtractPayload(sfxExe, Path.Combine(tmpRoot, "zipslip-out"), badZip, null, CancellationToken.None);
    }
    catch (InvalidOperationException)
    {
        zipSlipRejected = true;
    }
    Check(zipSlipRejected, "SfxPayloadReader rejects Zip-Slip path traversal entries");

    // Verify Windows shortcut writes System.AppUserModel.ID for native Toast Notifications
    var testLnkPath = Path.Combine(tmpRoot, "Agendamea-AumidTest.lnk");
    ShellIntegration.CreateShortcut(testLnkPath, installedAppExe, installDir, "Agendamea");
    var readAumid = ShellIntegration.ReadShortcutAppUserModelId(testLnkPath);
    Check(readAumid == ShellIntegration.AppUserModelId,
        $"Shortcut embeds System.AppUserModel.ID ({ShellIntegration.AppUserModelId})");

    // Verify ShellIntegration.InstallCliShims deploys native ag.exe + hardlinks + ag.target.json when bundled
    var fakeShimSrcDir = Path.Combine(installDir, "resources", "app.asar.unpacked", "cli", "bin");
    Directory.CreateDirectory(fakeShimSrcDir);
    File.WriteAllBytes(Path.Combine(fakeShimSrcDir, "ag.exe"), Encoding.UTF8.GetBytes("MZ_FAKE_AG_EXE"));
    var testBinDir = Path.Combine(tmpRoot, "test-cli-bin");
    ShellIntegration.InstallCliShims(installDir, customBinDir: testBinDir, skipPathUpdate: true);
    Check(
        File.Exists(Path.Combine(testBinDir, "ag.exe")) &&
        File.Exists(Path.Combine(testBinDir, "agenda.exe")) &&
        File.Exists(Path.Combine(testBinDir, "agendamea.exe")) &&
        File.Exists(Path.Combine(testBinDir, "ag.target.json")) &&
        !File.Exists(Path.Combine(testBinDir, "ag.cmd")),
        "ShellIntegration.InstallCliShims deploys native ag.exe/agenda.exe/agendamea.exe + ag.target.json");

    // Headless uninstall cleans up installed directory cleanly
    var uninstallOpts = new CliOptions
    {
        Silent = true,
        Uninstall = true,
        DeleteUserData = false,
        InstallDir = installDir,
        SkipWindowsIntegration = true,
    };
    await engine.UninstallAsync(uninstallOpts, tr, sfxExe, progress: null);
    Check(!File.Exists(installedAppExe) && !Directory.Exists(installDir),
        "UninstallEngine cleanly removes installed app files and directory");
}
finally
{
    try { Directory.Delete(tmpRoot, recursive: true); } catch { }
}

if (failures.Count > 0)
{
    Console.Error.WriteLine($"FAILED {failures.Count} check(s).");
    Environment.Exit(1);
}
Console.WriteLine("ALL SETUP TESTS PASSED!");
