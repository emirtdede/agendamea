'use strict';

/**
 * WBS-1.1: Hardware & 64-bit VRAM Profiler (Windows + cross-platform safe).
 * Reads 64-bit HardwareInformation.qwMemorySize from Windows display class registry
 * so 8-24+ GB RTX/RX GPUs never overflow Win32_VideoController.AdapterRAM (32-bit 4 GB cap).
 * Enforces a strict 3-second PowerShell timeout with conservative CPU fallback.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const GIB = 1024 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 3000;

const GPU_PS_SCRIPT = [
  "$regPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\*';",
  "$regGpus = @();",
  "try {",
  "  $items = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue;",
  "  foreach ($it in $items) {",
  "    $desc = $it.DriverDesc;",
  "    $qw = $it.'HardwareInformation.qwMemorySize';",
  "    $ms = $it.'HardwareInformation.MemorySize';",
  "    if ($desc -or $qw -or $ms) {",
  "      $bytes = 0;",
  "      if ($qw -is [array] -and $qw.Length -ge 8) { $bytes = [System.BitConverter]::ToUInt64([byte[]]$qw, 0) }",
  "      elseif ($qw -is [array] -and $qw.Length -ge 4) { $bytes = [System.BitConverter]::ToUInt32([byte[]]$qw, 0) }",
  "      elseif ($qw) { $bytes = [uint64]$qw }",
  "      elseif ($ms -is [array] -and $ms.Length -ge 4) { $bytes = [System.BitConverter]::ToUInt32([byte[]]$ms, 0) }",
  "      elseif ($ms) { $bytes = [uint64]$ms }",
  "      $regGpus += @{ name = [string]$desc; qwMemorySize = $bytes };",
  "    }",
  "  }",
  "} catch {}",
  "$cimGpus = @();",
  "try {",
  "  $vc = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue;",
  "  foreach ($v in $vc) {",
  "    $cimGpus += @{ name = [string]$v.Name; adapterRam = [uint64]($v.AdapterRAM -as [uint64]); vendor = [string]$v.AdapterCompatibility };",
  "  }",
  "} catch {}",
  "@{ regGpus = $regGpus; cimGpus = $cimGpus } | ConvertTo-Json -Compress -Depth 3",
].join(' ');

function normalizeVendor(name) {
  const s = String(name || '').toLowerCase();
  if (s.includes('nvidia') || s.includes('geforce') || s.includes('rtx') || s.includes('gtx') || s.includes('quadro')) {
    return 'nvidia';
  }
  if (s.includes('amd') || s.includes('radeon') || s.includes('ati')) {
    return 'amd';
  }
  if (s.includes('intel') || s.includes('iris') || s.includes('uhd') || s.includes('arc')) {
    return 'intel';
  }
  if (s.includes('apple')) {
    return 'apple';
  }
  return 'unknown';
}

function isVirtualOrBasicDisplay(name) {
  const s = String(name || '').toLowerCase();
  return (
    !s ||
    s.includes('microsoft basic') ||
    s.includes('remote display') ||
    s.includes('parsec') ||
    s.includes('citrix') ||
    s.includes('virtual') ||
    s.includes('hyper-v')
  );
}

function isDiscreteGpuName(name, vramGb) {
  const s = String(name || '').toLowerCase();
  if (isVirtualOrBasicDisplay(s)) return false;
  if (/\b(rtx|gtx|quadro|tesla|titan|rx\s*\d{3,4}|radeon\s+pro|arc\s+a\d{3}|arc\s+b\d{3})\b/i.test(s)) {
    return true;
  }
  const vendor = normalizeVendor(s);
  if (vendor === 'nvidia' && vramGb >= 2) return true;
  return vramGb >= 3.5;
}

function parseGpuProbeOutput(rawStdout) {
  const text = String(rawStdout || '').trim();
  if (!text) return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const candidates = [];
  const regList = Array.isArray(parsed?.regGpus)
    ? parsed.regGpus
    : parsed?.regGpus
      ? [parsed.regGpus]
      : [];
  const cimList = Array.isArray(parsed?.cimGpus)
    ? parsed.cimGpus
    : parsed?.cimGpus
      ? [parsed.cimGpus]
      : [];

  for (const r of regList) {
    const name = String(r?.name || '').trim();
    const bytes = Number(r?.qwMemorySize || 0);
    if (!name && !(bytes > 0)) continue;
    candidates.push({
      name: name || 'GPU',
      vendor: normalizeVendor(name),
      vramBytes: Number.isFinite(bytes) && bytes > 0 ? bytes : 0,
      source: 'registry-64bit',
    });
  }

  for (const c of cimList) {
    const name = String(c?.name || '').trim();
    const bytes = Number(c?.adapterRam || 0);
    if (!name && !(bytes > 0)) continue;
    const normName = name.toLowerCase();
    const existing = candidates.find(
      (x) => x.name.toLowerCase() === normName || (normName && x.name.toLowerCase().includes(normName)),
    );
    if (existing) {
      if (existing.vramBytes <= 0 && Number.isFinite(bytes) && bytes > 0) {
        existing.vramBytes = bytes;
        existing.source = 'wmi-adapter-ram';
      }
      if (existing.vendor === 'unknown') {
        existing.vendor = normalizeVendor(c?.vendor || name);
      }
    } else {
      candidates.push({
        name: name || 'GPU',
        vendor: normalizeVendor(c?.vendor || name),
        vramBytes: Number.isFinite(bytes) && bytes > 0 ? bytes : 0,
        source: 'wmi-adapter-ram',
      });
    }
  }

  return candidates.filter((g) => !isVirtualOrBasicDisplay(g.name));
}

function getDiskFreeBytes(targetDir, statfsFn = null) {
  const dir = targetDir || os.homedir();
  const fn = statfsFn || (typeof fs.statfsSync === 'function' ? fs.statfsSync : null);
  if (!fn) return null;
  try {
    let checkPath = path.resolve(dir);
    while (!fs.existsSync(checkPath)) {
      const parent = path.dirname(checkPath);
      if (parent === checkPath) break;
      checkPath = parent;
    }
    const stat = fn(checkPath);
    if (!stat) return null;
    const avail = Number(stat.bavail ?? stat.bfree ?? 0);
    const bsize = Number(stat.bsize ?? stat.frsize ?? 0);
    const bytes = avail * bsize;
    return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
  } catch {
    return null;
  }
}

function runPowerShellGpuProbe(execFn, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const runner = execFn || execFile;
  return new Promise((resolve) => {
    let settled = false;
    let child = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      try {
        if (child && typeof child.kill === 'function') child.kill();
      } catch {
        // Ignore kill error
      }
      finish({ ok: false, reason: 'powershell_timeout', stdout: '' });
    }, timeoutMs);

    try {
      child = runner(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', GPU_PS_SCRIPT],
        { windowsHide: true, timeout: timeoutMs, maxBuffer: 512 * 1024 },
        (err, stdout) => {
          if (err) {
            finish({
              ok: false,
              reason: err.killed ? 'powershell_timeout' : 'powershell_error',
              stdout: String(stdout || ''),
            });
            return;
          }
          finish({ ok: true, reason: null, stdout: String(stdout || '') });
        },
      );
    } catch {
      finish({ ok: false, reason: 'powershell_error', stdout: '' });
    }
  });
}

function classifyHardwareTier(profile) {
  const ramGb = Number(profile?.ramGb || 0);
  const vramGb = Number(profile?.vramGb || 0);

  if (ramGb >= 16 && vramGb >= 8) {
    return 'tier-strong';
  }
  if (ramGb >= 12 || (ramGb >= 8 && vramGb >= 4)) {
    return 'tier-medium';
  }
  return 'tier-light';
}

async function profileHardware(options = {}) {
  const platform = options.platform || process.platform;
  const totalMemBytes =
    typeof options.totalMemBytes === 'number' && options.totalMemBytes > 0
      ? options.totalMemBytes
      : os.totalmem();
  const cpuList = Array.isArray(options.cpuList) ? options.cpuList : os.cpus() || [];
  const timeoutMs =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  const ramGb = Math.round((totalMemBytes / GIB) * 10) / 10;
  const cpuCores = cpuList.length || 1;
  const cpuModel = String(cpuList[0]?.model || 'CPU').trim();
  const avx2Likely =
    process.arch === 'x64' && !/pentium|celeron|atom|core2/i.test(cpuModel);

  const freeDiskBytes = getDiskFreeBytes(options.targetDir, options.statfsFn);
  const freeDiskGb =
    freeDiskBytes !== null ? Math.round((freeDiskBytes / GIB) * 10) / 10 : null;

  let gpus = [];
  let fallbackReason = null;

  if (platform === 'win32') {
    const probe = await runPowerShellGpuProbe(options.execFn, timeoutMs);
    if (probe.ok) {
      gpus = parseGpuProbeOutput(probe.stdout);
    } else {
      fallbackReason = probe.reason || 'powershell_error';
    }
  } else {
    fallbackReason = 'non_windows';
  }

  // Pick strongest GPU (discrete GPUs prioritized over iGPU, then highest VRAM)
  const rankedGpus = [...gpus]
    .map((g) => {
      const vramGb = Math.round((g.vramBytes / GIB) * 100) / 100;
      return {
        ...g,
        vramGb,
        discrete: isDiscreteGpuName(g.name, vramGb),
      };
    })
    .sort((a, b) => {
      if (a.discrete !== b.discrete) return a.discrete ? -1 : 1;
      return b.vramBytes - a.vramBytes;
    });

  const primaryGpu = rankedGpus[0] || null;
  const vramBytes = primaryGpu ? primaryGpu.vramBytes : 0;
  const vramGb = primaryGpu ? Math.round((vramBytes / GIB) * 10) / 10 : 0;
  const gpuName = primaryGpu ? primaryGpu.name : 'CPU Only';
  const gpuVendor = primaryGpu ? primaryGpu.vendor : 'unknown';
  const hasDiscreteGpu = Boolean(primaryGpu?.discrete);
  const vulkanLikely =
    Boolean(primaryGpu) &&
    (hasDiscreteGpu || gpuVendor === 'nvidia' || gpuVendor === 'amd' || gpuVendor === 'intel');

  const baseProfile = {
    platform,
    arch: process.arch,
    ramGb,
    totalMemBytes,
    cpuCores,
    cpuModel,
    avx2Likely,
    gpuName,
    gpuVendor,
    vramBytes,
    vramGb,
    vramSource: primaryGpu ? primaryGpu.source : 'none',
    hasDiscreteGpu,
    vulkanLikely,
    gpus: rankedGpus,
    freeDiskBytes,
    freeDiskGb,
    fallbackReason,
    measuredAt: new Date().toISOString(),
  };

  // On PowerShell timeout/error fallback, stay conservative ('tier-light') when GPU is unknown and RAM <= 12 GB,
  // or per R-02: always return conservative tier-light when probe fails so user never OOMs on unknown GPU.
  const recommendedTier =
    fallbackReason === 'powershell_timeout' || fallbackReason === 'powershell_error'
      ? 'tier-light'
      : classifyHardwareTier(baseProfile);

  return {
    ...baseProfile,
    recommendedTier,
  };
}

module.exports = {
  GIB,
  DEFAULT_TIMEOUT_MS,
  GPU_PS_SCRIPT,
  normalizeVendor,
  isDiscreteGpuName,
  parseGpuProbeOutput,
  getDiskFreeBytes,
  classifyHardwareTier,
  profileHardware,
};
