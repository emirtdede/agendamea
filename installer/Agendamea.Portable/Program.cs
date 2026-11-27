using System.Buffers;
using System.Buffers.Binary;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Agendamea.Portable;

internal static class Program
{
    private const int TrailerV1Size = 24;
    private const int TrailerV2Size = 32;
    private const string ReadyMarkerFile = ".agendamea-portable-ready";
    private static readonly byte[] MagicV1 = Encoding.ASCII.GetBytes("AGM_SFX1");
    private static readonly byte[] MagicV2 = Encoding.ASCII.GetBytes("AGM_SFX2");

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int MessageBoxW(IntPtr hWnd, string lpText, string lpCaption, uint uType);

    private readonly record struct SfxTrailer(int FormatVersion, long PayloadOffset, long PayloadLength, long TocOffset);

    private readonly record struct SfxV2Entry(
        string RelativePath,
        long DataOffset,
        long CompressedLength,
        long UncompressedLength,
        long LastWriteUtcTicks,
        byte Flags);

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            var currentExe = Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(currentExe) || !File.Exists(currentExe))
            {
                ShowError("Could not locate the portable executable path.");
                return 1;
            }

            currentExe = Path.GetFullPath(currentExe);
            using var handle = File.OpenHandle(currentExe, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, FileOptions.RandomAccess);
            var fileLength = RandomAccess.GetLength(handle);
            var trailer = TryReadTrailer(handle, fileLength);
            if (trailer is null)
            {
                ShowError("Portable payload trailer is missing or corrupted. Please re-download Agendamea.");
                return 2;
            }

            var fingerprint = ComputeFastFingerprint(handle, fileLength, trailer.Value);
            var cacheRoot = ResolveCacheRoot();
            var targetDir = Path.Combine(cacheRoot, fingerprint);
            var appExePath = Path.Combine(targetDir, "Agendamea.exe");
            var readyPath = Path.Combine(targetDir, ReadyMarkerFile);

            var extractedFresh = false;
            // Fast warm-launch path (< 5 ms): already extracted and verified for this exact build fingerprint
            if (!File.Exists(readyPath) || !File.Exists(appExePath))
            {
                using var mutex = new Mutex(false, $"Local\\AgendameaPortable_{fingerprint}");
                var acquired = false;
                try
                {
                    try
                    {
                        acquired = mutex.WaitOne(TimeSpan.FromSeconds(90));
                    }
                    catch (AbandonedMutexException)
                    {
                        acquired = true;
                    }

                    if (!File.Exists(readyPath) || !File.Exists(appExePath))
                    {
                        ExtractAtomic(handle, trailer.Value, cacheRoot, targetDir, readyPath);
                        extractedFresh = true;
                    }
                }
                finally
                {
                    if (acquired)
                    {
                        try { mutex.ReleaseMutex(); } catch { }
                    }
                }
            }

            // Launch Agendamea BEFORE cleaning up stale previous cache directories so launch latency is untouched
            LaunchExtractedApp(appExePath, currentExe, targetDir, args);

            if (extractedFresh)
            {
                CleanupOldCacheVersions(cacheRoot, fingerprint);
            }

            return 0;
        }
        catch (Exception ex)
        {
            ShowError($"Agendamea could not start:\n{ex.Message}");
            return 1;
        }
    }

    private static SfxTrailer? TryReadTrailer(SafeFileHandle handle, long fileLength)
    {
        if (fileLength >= TrailerV2Size)
        {
            Span<byte> footer2 = stackalloc byte[TrailerV2Size];
            if (RandomAccess.Read(handle, footer2, fileLength - TrailerV2Size) == TrailerV2Size &&
                footer2[..8].SequenceEqual(MagicV2))
            {
                var offset = BinaryPrimitives.ReadInt64LittleEndian(footer2[8..16]);
                var length = BinaryPrimitives.ReadInt64LittleEndian(footer2[16..24]);
                var tocOffset = BinaryPrimitives.ReadInt64LittleEndian(footer2[24..32]);
                if (offset > 0 && length > 0 &&
                    offset + length + TrailerV2Size == fileLength &&
                    tocOffset >= offset && tocOffset < offset + length)
                {
                    return new SfxTrailer(2, offset, length, tocOffset);
                }
            }
        }

        if (fileLength >= TrailerV1Size)
        {
            Span<byte> footer1 = stackalloc byte[TrailerV1Size];
            if (RandomAccess.Read(handle, footer1, fileLength - TrailerV1Size) == TrailerV1Size &&
                footer1[..8].SequenceEqual(MagicV1))
            {
                var offset = BinaryPrimitives.ReadInt64LittleEndian(footer1[8..16]);
                var length = BinaryPrimitives.ReadInt64LittleEndian(footer1[16..24]);
                if (offset > 0 && length > 0 && offset + length + TrailerV1Size == fileLength)
                {
                    return new SfxTrailer(1, offset, length, 0);
                }
            }
        }

        return null;
    }

    private static string ComputeFastFingerprint(SafeFileHandle handle, long fileLength, SfxTrailer trailer)
    {
        using var sha = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        Span<byte> meta = stackalloc byte[28];
        BinaryPrimitives.WriteInt32LittleEndian(meta[0..4], trailer.FormatVersion);
        BinaryPrimitives.WriteInt64LittleEndian(meta[4..12], fileLength);
        BinaryPrimitives.WriteInt64LittleEndian(meta[12..20], trailer.PayloadOffset);
        BinaryPrimitives.WriteInt64LittleEndian(meta[20..28], trailer.PayloadLength);
        sha.AppendData(meta);

        var sampleLen = (int)Math.Min(65536L, trailer.PayloadLength);
        var buf = ArrayPool<byte>.Shared.Rent(sampleLen);
        try
        {
            var headRead = RandomAccess.Read(handle, buf.AsSpan(0, sampleLen), trailer.PayloadOffset);
            if (headRead > 0) sha.AppendData(buf.AsSpan(0, headRead));

            if (trailer.PayloadLength > sampleLen)
            {
                var tailPos = trailer.PayloadOffset + trailer.PayloadLength - sampleLen;
                var tailRead = RandomAccess.Read(handle, buf.AsSpan(0, sampleLen), tailPos);
                if (tailRead > 0) sha.AppendData(buf.AsSpan(0, tailRead));
            }
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buf);
        }

        var hash = sha.GetHashAndReset();
        return Convert.ToHexString(hash)[..16].ToLowerInvariant();
    }

    private static string ResolveCacheRoot()
    {
        var custom = Environment.GetEnvironmentVariable("AGENDAMEA_PORTABLE_CACHE_ROOT");
        if (!string.IsNullOrWhiteSpace(custom))
        {
            return Path.GetFullPath(custom.Trim());
        }
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(localAppData))
        {
            localAppData = Path.GetTempPath();
        }
        return Path.Combine(localAppData, "Agendamea-Portable-Cache");
    }

    private static void ExtractAtomic(
        SafeFileHandle handle,
        SfxTrailer trailer,
        string cacheRoot,
        string targetDir,
        string readyPath)
    {
        Directory.CreateDirectory(cacheRoot);
        var stagingDir = $"{targetDir}.staging-{Environment.ProcessId}";
        TryDeleteDirectory(stagingDir);
        Directory.CreateDirectory(stagingDir);

        try
        {
            var fullRoot = Path.GetFullPath(stagingDir);
            if (!fullRoot.EndsWith(Path.DirectorySeparatorChar))
                fullRoot += Path.DirectorySeparatorChar;

            if (trailer.FormatVersion == 2)
            {
                ExtractV2Parallel(handle, trailer, fullRoot);
            }
            else
            {
                ExtractV1ZipParallel(handle, trailer, fullRoot);
            }

            File.WriteAllText(Path.Combine(stagingDir, ReadyMarkerFile), "ok", Encoding.UTF8);

            if (Directory.Exists(targetDir))
            {
                TryDeleteDirectory(targetDir);
            }

            if (!Directory.Exists(targetDir))
            {
                Directory.Move(stagingDir, targetDir);
            }
            else
            {
                CopyDirectoryFallback(stagingDir, targetDir);
                File.WriteAllText(readyPath, "ok", Encoding.UTF8);
                TryDeleteDirectory(stagingDir);
            }
        }
        catch
        {
            TryDeleteDirectory(stagingDir);
            throw;
        }
    }

    private static List<SfxV2Entry> ReadV2Toc(SafeFileHandle handle, SfxTrailer trailer)
    {
        var tocLen = (int)(trailer.PayloadOffset + trailer.PayloadLength - trailer.TocOffset);
        if (tocLen < 4 || tocLen > 64 * 1024 * 1024)
            throw new InvalidOperationException("Corrupted SFX v2 table of contents.");

        var tocBuf = new byte[tocLen];
        var totalRead = 0;
        while (totalRead < tocLen)
        {
            var n = RandomAccess.Read(handle, tocBuf.AsSpan(totalRead), trailer.TocOffset + totalRead);
            if (n <= 0) throw new EndOfStreamException("Unexpected EOF while reading SFX v2 TOC.");
            totalRead += n;
        }

        var pos = 0;
        var count = BinaryPrimitives.ReadInt32LittleEndian(tocBuf.AsSpan(pos, 4));
        pos += 4;
        var entries = new List<SfxV2Entry>(count);

        for (var i = 0; i < count; i++)
        {
            var pathLen = BinaryPrimitives.ReadUInt16LittleEndian(tocBuf.AsSpan(pos, 2));
            pos += 2;
            var relPath = Encoding.UTF8.GetString(tocBuf, pos, pathLen);
            pos += pathLen;
            var dataOffset = BinaryPrimitives.ReadInt64LittleEndian(tocBuf.AsSpan(pos, 8));
            pos += 8;
            var compLen = BinaryPrimitives.ReadInt64LittleEndian(tocBuf.AsSpan(pos, 8));
            pos += 8;
            var rawLen = BinaryPrimitives.ReadInt64LittleEndian(tocBuf.AsSpan(pos, 8));
            pos += 8;
            var mtimeTicks = BinaryPrimitives.ReadInt64LittleEndian(tocBuf.AsSpan(pos, 8));
            pos += 8;
            var flags = tocBuf[pos++];
            entries.Add(new SfxV2Entry(relPath, dataOffset, compLen, rawLen, mtimeTicks, flags));
        }

        return entries;
    }

    private static void ExtractV2Parallel(SafeFileHandle handle, SfxTrailer trailer, string fullRoot)
    {
        var entries = ReadV2Toc(handle, trailer);
        var uniqueDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var workItems = new List<(SfxV2Entry Entry, string DestPath)>(entries.Count);

        foreach (var entry in entries)
        {
            var normalized = entry.RelativePath.Replace('/', Path.DirectorySeparatorChar);
            var destPath = Path.GetFullPath(Path.Combine(fullRoot, normalized));
            if (!destPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException($"Unsafe archive entry rejected: {entry.RelativePath}");

            if ((entry.Flags & 2) != 0)
            {
                uniqueDirs.Add(destPath);
                continue;
            }

            var parent = Path.GetDirectoryName(destPath);
            if (!string.IsNullOrEmpty(parent)) uniqueDirs.Add(parent);
            workItems.Add((entry, destPath));
        }

        foreach (var dir in uniqueDirs)
        {
            Directory.CreateDirectory(dir);
        }

        // Start largest entries first so multi-core workers finish near-simultaneously
        workItems.Sort((a, b) => b.Entry.CompressedLength.CompareTo(a.Entry.CompressedLength));

        var maxParallel = Math.Clamp(Environment.ProcessorCount, 2, 8);
        Parallel.ForEach(
            workItems,
            new ParallelOptions { MaxDegreeOfParallelism = maxParallel },
            item =>
            {
                var entry = item.Entry;
                var absOffset = trailer.PayloadOffset + entry.DataOffset;
                var isBrotli = (entry.Flags & 1) != 0;
                var bufSize = entry.UncompressedLength > 0
                    ? (int)Math.Min(256 * 1024L, Math.Max(4096L, entry.UncompressedLength))
                    : 4096;
                var buffer = ArrayPool<byte>.Shared.Rent(bufSize);
                try
                {
                    using var outStream = new FileStream(
                        item.DestPath,
                        FileMode.Create,
                        FileAccess.Write,
                        FileShare.None,
                        Math.Min(bufSize, 65536),
                        FileOptions.SequentialScan);

                    if (entry.UncompressedLength > 0)
                    {
                        using var rawSub = new RandomAccessSubStream(handle, absOffset, entry.CompressedLength);
                        if (isBrotli)
                        {
                            using var brotli = new BrotliStream(rawSub, CompressionMode.Decompress, leaveOpen: false);
                            int read;
                            while ((read = brotli.Read(buffer, 0, bufSize)) > 0)
                            {
                                outStream.Write(buffer, 0, read);
                            }
                        }
                        else
                        {
                            int read;
                            while ((read = rawSub.Read(buffer, 0, bufSize)) > 0)
                            {
                                outStream.Write(buffer, 0, read);
                            }
                        }
                    }
                }
                finally
                {
                    ArrayPool<byte>.Shared.Return(buffer);
                }
            });
    }

    private static void ExtractV1ZipParallel(SafeFileHandle handle, SfxTrailer trailer, string fullRoot)
    {
        var uniqueDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var entryIndices = new List<(int Index, long CompLen, string DestPath)>();

        using (var probeSub = new RandomAccessSubStream(handle, trailer.PayloadOffset, trailer.PayloadLength))
        using (var probeZip = new ZipArchive(probeSub, ZipArchiveMode.Read, leaveOpen: false))
        {
            for (var i = 0; i < probeZip.Entries.Count; i++)
            {
                var entry = probeZip.Entries[i];
                var normalized = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                var destPath = Path.GetFullPath(Path.Combine(fullRoot, normalized));
                if (!destPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException($"Unsafe archive entry rejected: {entry.FullName}");

                if (string.IsNullOrEmpty(entry.Name))
                {
                    uniqueDirs.Add(destPath);
                    continue;
                }
                var parent = Path.GetDirectoryName(destPath);
                if (!string.IsNullOrEmpty(parent)) uniqueDirs.Add(parent);
                entryIndices.Add((i, entry.CompressedLength, destPath));
            }
        }

        foreach (var dir in uniqueDirs)
        {
            Directory.CreateDirectory(dir);
        }

        entryIndices.Sort((a, b) => b.CompLen.CompareTo(a.CompLen));
        var workerCount = Math.Clamp(Environment.ProcessorCount, 2, 8);
        var buckets = new List<(int Index, string DestPath)>[workerCount];
        for (var w = 0; w < workerCount; w++) buckets[w] = new List<(int, string)>();
        for (var i = 0; i < entryIndices.Count; i++)
        {
            buckets[i % workerCount].Add((entryIndices[i].Index, entryIndices[i].DestPath));
        }

        Parallel.For(0, workerCount, w =>
        {
            var bucket = buckets[w];
            if (bucket.Count == 0) return;
            using var sub = new RandomAccessSubStream(handle, trailer.PayloadOffset, trailer.PayloadLength);
            using var archive = new ZipArchive(sub, ZipArchiveMode.Read, leaveOpen: false);
            var buffer = ArrayPool<byte>.Shared.Rent(256 * 1024);
            try
            {
                foreach (var item in bucket)
                {
                    var entry = archive.Entries[item.Index];
                    using var inStream = entry.Open();
                    using var outStream = new FileStream(item.DestPath, FileMode.Create, FileAccess.Write, FileShare.None, 65536, FileOptions.SequentialScan);
                    int read;
                    while ((read = inStream.Read(buffer, 0, 256 * 1024)) > 0)
                    {
                        outStream.Write(buffer, 0, read);
                    }
                }
            }
            finally
            {
                ArrayPool<byte>.Shared.Return(buffer);
            }
        });
    }

    private static void CopyDirectoryFallback(string sourceDir, string destDir)
    {
        Directory.CreateDirectory(destDir);
        foreach (var file in Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            var rel = Path.GetRelativePath(sourceDir, file);
            var target = Path.Combine(destDir, rel);
            var parent = Path.GetDirectoryName(target);
            if (!string.IsNullOrEmpty(parent)) Directory.CreateDirectory(parent);
            File.Copy(file, target, overwrite: true);
        }
    }

    private static void CleanupOldCacheVersions(string cacheRoot, string activeFingerprint)
    {
        try
        {
            if (!Directory.Exists(cacheRoot)) return;
            foreach (var dir in Directory.GetDirectories(cacheRoot))
            {
                var name = Path.GetFileName(dir);
                if (string.Equals(name, activeFingerprint, StringComparison.OrdinalIgnoreCase))
                    continue;
                TryDeleteDirectory(dir);
            }
        }
        catch
        {
            // Non-fatal stale cache cleanup
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch
        {
            // Ignore locked directories
        }
    }

    private static void LaunchExtractedApp(string appExePath, string portableExePath, string cacheDir, string[] args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = appExePath,
            WorkingDirectory = Path.GetDirectoryName(appExePath) ?? cacheDir,
            UseShellExecute = false,
        };
        foreach (var arg in args)
        {
            psi.ArgumentList.Add(arg);
        }
        psi.Environment["PORTABLE_EXECUTABLE_FILE"] = portableExePath;
        psi.Environment["PORTABLE_EXECUTABLE_DIR"] = Path.GetDirectoryName(portableExePath) ?? string.Empty;
        psi.Environment["AGENDAMEA_PORTABLE_CACHE_DIR"] = cacheDir;

        Process.Start(psi);
    }

    private static void ShowError(string message)
    {
        try
        {
            _ = MessageBoxW(IntPtr.Zero, message, "Agendamea", 0x00000010);
        }
        catch
        {
            // Ignore headless error display failure
        }
    }

    /// <summary>
    /// Lock-free, thread-safe read-only substream over a shared SafeFileHandle using RandomAccess.Read.
    /// Zero shared OS file pointer mutation and zero per-read Seek syscalls.
    /// </summary>
    private sealed class RandomAccessSubStream : Stream
    {
        private readonly SafeFileHandle _handle;
        private readonly long _offset;
        private readonly long _length;
        private long _position;

        public RandomAccessSubStream(SafeFileHandle handle, long offset, long length)
        {
            _handle = handle;
            _offset = offset;
            _length = length;
        }

        public override bool CanRead => true;
        public override bool CanSeek => true;
        public override bool CanWrite => false;
        public override long Length => _length;

        public override long Position
        {
            get => _position;
            set => Seek(value, SeekOrigin.Begin);
        }

        public override int Read(byte[] buffer, int offset, int count) =>
            Read(buffer.AsSpan(offset, count));

        public override int Read(Span<byte> buffer)
        {
            var remaining = _length - _position;
            if (remaining <= 0) return 0;
            var toRead = (int)Math.Min(buffer.Length, remaining);
            var read = RandomAccess.Read(_handle, buffer[..toRead], _offset + _position);
            _position += read;
            return read;
        }

        public override long Seek(long offset, SeekOrigin origin)
        {
            var next = origin switch
            {
                SeekOrigin.Begin => offset,
                SeekOrigin.Current => _position + offset,
                SeekOrigin.End => _length + offset,
                _ => throw new ArgumentOutOfRangeException(nameof(origin)),
            };
            if (next < 0 || next > _length)
                throw new IOException("Attempted to seek outside embedded portable archive bounds.");
            _position = next;
            return _position;
        }

        public override void Flush() { }
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
