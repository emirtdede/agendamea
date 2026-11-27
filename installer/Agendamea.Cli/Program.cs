using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace Agendamea.Cli
{
    internal static class Program
    {
        private const uint CP_UTF8 = 65001;
        private const int ABI_FALLBACK_EXIT_CODE = 86;

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetConsoleOutputCP(uint wCodePageID);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetConsoleCP(uint wCodePageID);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GetStdHandle(int nStdHandle);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);

        private const int STD_OUTPUT_HANDLE = -11;
        private const uint ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004;

        private sealed class TargetConfig
        {
            public string ExecPath = string.Empty;
            public string CliScript = string.Empty;
            public string McpScript = string.Empty;
            public string RuntimeRoot = string.Empty;
        }

        private static int Main(string[] args)
        {
            TryEnableUtf8AndVtConsole();

            string selfDir = AppDomain.CurrentDomain.BaseDirectory;
            TargetConfig cfg = LoadTargetConfig(selfDir);

            if (string.IsNullOrEmpty(cfg.CliScript) || !File.Exists(cfg.CliScript))
            {
                Console.Error.WriteLine("[ag] Agendamea CLI script could not be located. Re-run 'ag install' or reinstall Agendamea.");
                return 1;
            }

            bool isDirectMcpStdio =
                args.Length > 0 &&
                string.Equals(args[0], "mcp", StringComparison.OrdinalIgnoreCase) &&
                (args.Length == 1 ||
                 (args.Length == 2 &&
                  (string.Equals(args[1], "serve", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(args[1], "stdio", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(args[1], "--stdio", StringComparison.OrdinalIgnoreCase))));

            // Direct zero-chain MCP launch ONLY for stdio server mode (`ag mcp` / `ag mcp serve|stdio`).
            // Subcommands like `ag mcp list`, `ag mcp install ...`, `ag mcp doctor` MUST run via cli/agendamea.cjs!
            if (isDirectMcpStdio && !string.IsNullOrEmpty(cfg.McpScript) && File.Exists(cfg.McpScript))
            {
                string[] mcpRest = Array.Empty<string>();

                // Prefer Agendamea.exe (bundled matching better-sqlite3 ABI) for zero-chain MCP
                string mcpExec = !string.IsNullOrEmpty(cfg.ExecPath) && File.Exists(cfg.ExecPath)
                    ? cfg.ExecPath
                    : FindSystemNode();

                if (string.IsNullOrEmpty(mcpExec))
                {
                    Console.Error.WriteLine("[ag] Agendamea runtime executable not found.");
                    return 1;
                }

                bool mcpUseElectronAsNode = !IsNodeExecutable(mcpExec);
                return RunPipedProcess(mcpExec, cfg.McpScript, mcpRest, mcpUseElectronAsNode, isMcpMode: true);
            }

            // Fast CLI path: if system node.exe exists AND either the desktop daemon is live (HTTP mode)
            // or the command doesn't touch offline SQLite, run node.exe directly (~45ms start + real TTY).
            // When offline SQLite is needed, skip the wasted node.exe ABI-mismatch boot + 450ms port sweep
            // and launch Agendamea.exe (ELECTRON_RUN_AS_NODE=1) directly on the first try!
            string systemNode = FindSystemNode();
            bool preferElectron = string.Equals(
                Environment.GetEnvironmentVariable("AGENDAMEA_FORCE_ELECTRON_CLI"),
                "1",
                StringComparison.Ordinal);

            bool hasExeTarget = !string.IsNullOrEmpty(cfg.ExecPath) && File.Exists(cfg.ExecPath);
            bool needsOnlyNodeNoDb = IsFastNodeOnlyCommand(args);
            bool liveDaemonPresent = HasLiveDesktopDaemon();

            if (!preferElectron && !string.IsNullOrEmpty(systemNode) && (needsOnlyNodeNoDb || liveDaemonPresent || !hasExeTarget))
            {
                int nodeCode = RunDirectConsoleProcess(systemNode, cfg.CliScript, args);
                if (nodeCode != ABI_FALLBACK_EXIT_CODE)
                {
                    return nodeCode;
                }
            }

            if (!hasExeTarget)
            {
                if (!string.IsNullOrEmpty(systemNode))
                {
                    return RunDirectConsoleProcess(systemNode, cfg.CliScript, args);
                }
                Console.Error.WriteLine("[ag] Agendamea runtime executable not found.");
                return 1;
            }

            // Electron GUI-subsystem executable requires raw byte pipe forwarding so cmd.exe/PowerShell/pipes receive stdout/stderr.
            bool useElectronAsNode = !IsNodeExecutable(cfg.ExecPath);
            return RunPipedProcess(cfg.ExecPath, cfg.CliScript, args, useElectronAsNode, isMcpMode: false);
        }

        private static bool IsFastNodeOnlyCommand(string[] args)
        {
            if (args == null || args.Length == 0) return false;
            string first = (args[0] ?? string.Empty).ToLowerInvariant();
            return first == "-v" || first == "--version" || first == "version" ||
                   first == "-h" || first == "--help" || first == "help" ||
                   first == "completion" || first == "__complete";
        }

        private static bool HasLiveDesktopDaemon()
        {
            if (string.Equals(Environment.GetEnvironmentVariable("AGENDAMEA_FORCE_OFFLINE"), "1", StringComparison.Ordinal))
            {
                return false;
            }
            if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("AGENDAMEA_URL")) ||
                !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("AGENDAMEA_PORT")))
            {
                return true;
            }
            try
            {
                string customDataDir = Environment.GetEnvironmentVariable("AGENDAMEA_DATA_DIR");
                string dataDir = !string.IsNullOrEmpty(customDataDir)
                    ? customDataDir
                    : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Agendamea");
                string portFile = Path.Combine(dataDir, "runtime-port.json");
                if (!File.Exists(portFile)) return false;
                string raw = File.ReadAllText(portFile, Encoding.UTF8);
                int pid = ExtractJsonInt(raw, "pid");
                if (pid <= 0) return true;
                try
                {
                    using (Process p = Process.GetProcessById(pid))
                    {
                        return !p.HasExited;
                    }
                }
                catch
                {
                    return false;
                }
            }
            catch
            {
                return false;
            }
        }

        private static int ExtractJsonInt(string json, string key)
        {
            string pattern = "\"" + key + "\"";
            int keyIdx = json.IndexOf(pattern, StringComparison.Ordinal);
            if (keyIdx < 0) return -1;
            int colonIdx = json.IndexOf(':', keyIdx + pattern.Length);
            if (colonIdx < 0) return -1;
            int i = colonIdx + 1;
            while (i < json.Length && char.IsWhiteSpace(json[i])) i++;
            int start = i;
            while (i < json.Length && char.IsDigit(json[i])) i++;
            if (i <= start) return -1;
            int value = 0;
            for (int k = start; k < i; k++)
            {
                int digit = json[k] - '0';
                if (value > (int.MaxValue - digit) / 10) return -1;
                value = value * 10 + digit;
            }
            return value;
        }

        private static void TryEnableUtf8AndVtConsole()
        {
            try
            {
                SetConsoleOutputCP(CP_UTF8);
                SetConsoleCP(CP_UTF8);
                Console.OutputEncoding = new UTF8Encoding(false);
                Console.InputEncoding = new UTF8Encoding(false);
            }
            catch
            {
                // Non-fatal in redirected/non-console sessions
            }

            try
            {
                IntPtr handle = GetStdHandle(STD_OUTPUT_HANDLE);
                uint mode;
                if (handle != IntPtr.Zero && GetConsoleMode(handle, out mode))
                {
                    SetConsoleMode(handle, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
                }
            }
            catch
            {
                // Ignore if console handle does not support VT
            }
        }

        private static bool IsNodeExecutable(string path)
        {
            string name = Path.GetFileName(path ?? string.Empty).ToLowerInvariant();
            return name == "node.exe" || name == "node";
        }

        private static readonly char[] PathSplitSeparators = new[] { ';' };

        private static string FindSystemNode()
        {
            try
            {
                string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
                string[] parts = pathEnv.Split(PathSplitSeparators, StringSplitOptions.RemoveEmptyEntries);
                for (int i = 0; i < parts.Length; i++)
                {
                    string dir = parts[i].Trim().Trim('"');
                    if (string.IsNullOrEmpty(dir)) continue;
                    string candidate = Path.Combine(dir, "node.exe");
                    if (File.Exists(candidate))
                    {
                        return candidate;
                    }
                }
            }
            catch
            {
                // Ignore PATH parse issues
            }
            return string.Empty;
        }

        private static TargetConfig LoadTargetConfig(string selfDir)
        {
            TargetConfig cfg = new TargetConfig();
            string manifestPath = Path.Combine(selfDir, "ag.target.json");
            if (File.Exists(manifestPath))
            {
                try
                {
                    string raw = File.ReadAllText(manifestPath, Encoding.UTF8);
                    cfg.ExecPath = ExtractJsonString(raw, "execPath");
                    cfg.CliScript = ExtractJsonString(raw, "cliScript");
                    cfg.McpScript = ExtractJsonString(raw, "mcpScript");
                    cfg.RuntimeRoot = ExtractJsonString(raw, "runtimeRoot");
                }
                catch
                {
                    // Fall through to discovery
                }
            }

            // Fallback discovery relative to installed Agendamea directory or standard install paths
            if (string.IsNullOrEmpty(cfg.CliScript) || !File.Exists(cfg.CliScript))
            {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                List<string> roots = new List<string>();
                try { roots.Add(Path.GetFullPath(Path.Combine(selfDir, "..", ".."))); } catch { }
                try { roots.Add(Path.GetFullPath(Path.Combine(selfDir, ".."))); } catch { }
                if (!string.IsNullOrEmpty(localAppData))
                {
                    roots.Add(Path.Combine(localAppData, "Programs", "Agendamea"));
                }
                if (!string.IsNullOrEmpty(programFiles))
                {
                    roots.Add(Path.Combine(programFiles, "Agendamea"));
                }

                for (int i = 0; i < roots.Count; i++)
                {
                    string root = roots[i];
                    string unpackedCli = Path.Combine(root, "resources", "app.asar.unpacked", "cli", "agendamea.cjs");
                    string devCli = Path.Combine(root, "cli", "agendamea.cjs");
                    if (File.Exists(unpackedCli))
                    {
                        cfg.CliScript = unpackedCli;
                        cfg.McpScript = Path.Combine(root, "resources", "app.asar.unpacked", "mcp", "server.cjs");
                        string exe = Path.Combine(root, "Agendamea.exe");
                        if (File.Exists(exe)) cfg.ExecPath = exe;
                        break;
                    }
                    if (File.Exists(devCli))
                    {
                        cfg.CliScript = devCli;
                        cfg.McpScript = Path.Combine(root, "mcp", "server.cjs");
                        string electronExe = Path.Combine(root, "node_modules", "electron", "dist", "electron.exe");
                        if (File.Exists(electronExe)) cfg.ExecPath = electronExe;
                        break;
                    }
                }
            }

            if (string.IsNullOrEmpty(cfg.McpScript) && !string.IsNullOrEmpty(cfg.CliScript))
            {
                try
                {
                    string cliDir = Path.GetDirectoryName(cfg.CliScript);
                    if (!string.IsNullOrEmpty(cliDir))
                    {
                        string parent = Path.GetDirectoryName(cliDir);
                        if (!string.IsNullOrEmpty(parent))
                        {
                            cfg.McpScript = Path.Combine(parent, "mcp", "server.cjs");
                        }
                    }
                }
                catch { }
            }

            return cfg;
        }

        private static string ExtractJsonString(string json, string key)
        {
            string pattern = "\"" + key + "\"";
            int keyIdx = json.IndexOf(pattern, StringComparison.Ordinal);
            if (keyIdx < 0) return string.Empty;
            int colonIdx = json.IndexOf(':', keyIdx + pattern.Length);
            if (colonIdx < 0) return string.Empty;
            int startQuote = json.IndexOf('"', colonIdx + 1);
            if (startQuote < 0) return string.Empty;

            StringBuilder sb = new StringBuilder();
            for (int i = startQuote + 1; i < json.Length; i++)
            {
                char c = json[i];
                if (c == '\\' && i + 1 < json.Length)
                {
                    char next = json[++i];
                    if (next == '\\') sb.Append('\\');
                    else if (next == '"') sb.Append('"');
                    else if (next == '/') sb.Append('/');
                    else if (next == 'n') sb.Append('\n');
                    else if (next == 'r') sb.Append('\r');
                    else if (next == 't') sb.Append('\t');
                    else if (next == 'u' && i + 4 < json.Length)
                    {
                        string hex = json.Substring(i + 1, 4);
                        int code;
                        if (int.TryParse(hex, System.Globalization.NumberStyles.HexNumber, null, out code))
                        {
                            sb.Append((char)code);
                            i += 4;
                        }
                    }
                    else sb.Append(next);
                }
                else if (c == '"')
                {
                    break;
                }
                else
                {
                    sb.Append(c);
                }
            }
            return sb.ToString();
        }

        private static string BuildCommandLineArguments(string scriptPath, string[] userArgs)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append(QuoteWindowsArg(scriptPath));
            for (int i = 0; i < userArgs.Length; i++)
            {
                sb.Append(' ');
                sb.Append(QuoteWindowsArg(userArgs[i]));
            }
            return sb.ToString();
        }

        // Standard Windows CommandLineToArgvW escaping rules
        private static string QuoteWindowsArg(string arg)
        {
            if (arg == null) return "\"\"";
            if (arg.Length == 0) return "\"\"";
            bool needsQuotes = false;
            for (int i = 0; i < arg.Length; i++)
            {
                char c = arg[i];
                if (char.IsWhiteSpace(c) || c == '"')
                {
                    needsQuotes = true;
                    break;
                }
            }
            if (!needsQuotes) return arg;

            StringBuilder sb = new StringBuilder();
            sb.Append('"');
            int backslashes = 0;
            for (int i = 0; i < arg.Length; i++)
            {
                char c = arg[i];
                if (c == '\\')
                {
                    backslashes++;
                }
                else if (c == '"')
                {
                    sb.Append('\\', backslashes * 2 + 1);
                    sb.Append('"');
                    backslashes = 0;
                }
                else
                {
                    if (backslashes > 0)
                    {
                        sb.Append('\\', backslashes);
                        backslashes = 0;
                    }
                    sb.Append(c);
                }
            }
            if (backslashes > 0)
            {
                sb.Append('\\', backslashes * 2);
            }
            sb.Append('"');
            return sb.ToString();
        }

        private static int RunDirectConsoleProcess(string exePath, string scriptPath, string[] userArgs)
        {
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = exePath,
                Arguments = BuildCommandLineArguments(scriptPath, userArgs),
                UseShellExecute = false,
                RedirectStandardInput = false,
                RedirectStandardOutput = false,
                RedirectStandardError = false,
                CreateNoWindow = false,
            };

            using (Process proc = Process.Start(psi))
            {
                if (proc == null) return 1;
                ConsoleCancelEventHandler cancelHandler = delegate(object sender, ConsoleCancelEventArgs e)
                {
                    // Let child receive SIGINT / Ctrl+C cleanly without killing shim before exit code returns
                    e.Cancel = true;
                };
                Console.CancelKeyPress += cancelHandler;
                try
                {
                    proc.WaitForExit();
                    return proc.ExitCode;
                }
                finally
                {
                    Console.CancelKeyPress -= cancelHandler;
                }
            }
        }

        private static int RunPipedProcess(
            string exePath,
            string scriptPath,
            string[] userArgs,
            bool setElectronRunAsNode,
            bool isMcpMode)
        {
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = exePath,
                Arguments = BuildCommandLineArguments(scriptPath, userArgs),
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };

            if (setElectronRunAsNode)
            {
                psi.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";
            }

            if (!isMcpMode)
            {
                bool outTty = !Console.IsOutputRedirected;
                bool inTty = !Console.IsInputRedirected;
                psi.EnvironmentVariables["AGENDAMEA_FORCE_TTY"] = outTty ? "1" : "0";
                psi.EnvironmentVariables["AGENDAMEA_STDIN_TTY"] = inTty ? "1" : "0";
                if (outTty)
                {
                    try
                    {
                        int cols = Console.WindowWidth;
                        if (cols > 0) psi.EnvironmentVariables["AGENDAMEA_COLUMNS"] = cols.ToString();
                    }
                    catch { }
                }
            }

            using (Process proc = Process.Start(psi))
            {
                if (proc == null) return 1;

                ConsoleCancelEventHandler cancelHandler = delegate(object sender, ConsoleCancelEventArgs e)
                {
                    e.Cancel = true;
                    try
                    {
                        if (!proc.HasExited) proc.Kill();
                    }
                    catch { }
                };
                Console.CancelKeyPress += cancelHandler;

                // Raw byte-exact forwarding preserves both UTF-8 CLI streams and binary Content-Length MCP framing!
                Thread outThread = StartPump(proc.StandardOutput.BaseStream, Console.OpenStandardOutput(), closeDest: false);
                Thread errThread = StartPump(proc.StandardError.BaseStream, Console.OpenStandardError(), closeDest: false);

                bool shouldPumpStdin = isMcpMode || Console.IsInputRedirected || HasInteractiveCommand(userArgs);
                Thread inThread = null;
                if (shouldPumpStdin)
                {
                    inThread = StartPump(Console.OpenStandardInput(), proc.StandardInput.BaseStream, closeDest: true);
                }
                else
                {
                    try { proc.StandardInput.Close(); } catch { }
                }

                try
                {
                    proc.WaitForExit();
                    outThread.Join(3000);
                    errThread.Join(3000);
                    if (inThread != null && isMcpMode)
                    {
                        inThread.Join(500);
                    }
                    return proc.ExitCode;
                }
                finally
                {
                    Console.CancelKeyPress -= cancelHandler;
                }
            }
        }

        private static bool HasInteractiveCommand(string[] args)
        {
            if (args.Length == 0) return false;
            string cmd = args[0].ToLowerInvariant();
            if (cmd == "ask" || cmd == "sor" || cmd == "reset" || cmd == "sifirla" || cmd == "ai")
            {
                return true;
            }
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "-") return true;
            }
            return false;
        }

        private static Thread StartPump(Stream src, Stream dst, bool closeDest)
        {
            Thread t = new Thread(() =>
            {
                byte[] buffer = new byte[16384];
                try
                {
                    int read;
                    while ((read = src.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        dst.Write(buffer, 0, read);
                        dst.Flush();
                    }
                }
                catch
                {
                    // Stream closed on process exit
                }
                finally
                {
                    if (closeDest)
                    {
                        try { dst.Close(); } catch { }
                    }
                }
            });
            t.IsBackground = true;
            t.Start();
            return t;
        }
    }
}
