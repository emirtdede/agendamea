using System.Buffers;
using System.Buffers.Binary;
using System.IO;
using System.IO.Compression;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Agendamea.Setup.Engine;

public readonly record struct SfxTrailer(long PayloadOffset, long PayloadLength, int FormatVersion = 1, long TocOffset = 0);

/// <summary>
/// Supports both:
/// - AGM_SFX1 (24-byte trailer): Appended standard ZIP payload (parallel RandomAccess extraction)
/// - AGM_SFX2 (32-byte trailer): Parallel indexed Brotli payload (smaller + 3-5x faster multi-core extraction)
/// </summary>
public static class SfxPayloadReader
{
    public const int TrailerSize = 24;
    public const int TrailerV2Size = 32;
    private static readonly byte[] MagicV1 = Encoding.ASCII.GetBytes("AGM_SFX1");
    private static readonly byte[] MagicV2 = Encoding.ASCII.GetBytes("AGM_SFX2");

    private readonly record struct SfxV2Entry(
        string RelativePath,
        long DataOffset,
        long CompressedLength,
        long UncompressedLength,
        long LastWriteUtcTicks,
        byte Flags);

    public static SfxTrailer? TryReadTrailer(string executablePath)
    {
        if (string.IsNullOrWhiteSpace(executablePath) || !File.Exists(executablePath))
            return null;

        using var fs = new FileStream(executablePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        return TryReadTrailer(fs);
    }

    public static SfxTrailer? TryReadTrailer(Stream stream)
    {
        if (!stream.CanSeek)
            return null;

        if (stream.Length >= TrailerV2Size)
        {
            Span<byte> footer2 = stackalloc byte[TrailerV2Size];
            stream.Seek(-TrailerV2Size, SeekOrigin.End);
            if (stream.Read(footer2) == TrailerV2Size && footer2[..8].SequenceEqual(MagicV2))
            {
                var offset = BinaryPrimitives.ReadInt64LittleEndian(footer2[8..16]);
                var length = BinaryPrimitives.ReadInt64LittleEndian(footer2[16..24]);
                var tocOffset = BinaryPrimitives.ReadInt64LittleEndian(footer2[24..32]);
                if (offset > 0 && length > 0 &&
                    offset + length + TrailerV2Size == stream.Length &&
                    tocOffset >= offset && tocOffset < offset + length)
                {
                    return new SfxTrailer(offset, length, FormatVersion: 2, TocOffset: tocOffset);
                }
            }
        }

        if (stream.Length >= TrailerSize)
        {
            Span<byte> footer = stackalloc byte[TrailerSize];
            stream.Seek(-TrailerSize, SeekOrigin.End);
            var read = stream.Read(footer);
            if (read == TrailerSize && footer[..8].SequenceEqual(MagicV1))
            {
                var offset = BinaryPrimitives.ReadInt64LittleEndian(footer[8..16]);
                var length = BinaryPrimitives.ReadInt64LittleEndian(footer[16..24]);
                if (offset > 0 && length > 0 && offset + length + TrailerSize == stream.Length)
                {
                    return new SfxTrailer(offset, length, FormatVersion: 1, TocOffset: 0);
                }
            }
        }

        return null;
    }

    /// <summary>
    /// Creates an appended-ZIP SFX v1 bundle (used by tests and optional C# tooling).
    /// </summary>
    public static void BuildBundle(string stubExePath, string zipPath, string outputExePath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outputExePath))!);
        using var outFs = new FileStream(outputExePath, FileMode.Create, FileAccess.Write, FileShare.None);
        long payloadOffset;
        using (var stubFs = new FileStream(stubExePath, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            stubFs.CopyTo(outFs);
            payloadOffset = outFs.Position;
        }

        long payloadLength;
        using (var zipFs = new FileStream(zipPath, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            zipFs.CopyTo(outFs);
            payloadLength = outFs.Position - payloadOffset;
        }

        Span<byte> footer = stackalloc byte[TrailerSize];
        MagicV1.CopyTo(footer[..8]);
        BinaryPrimitives.WriteInt64LittleEndian(footer[8..16], payloadOffset);
        BinaryPrimitives.WriteInt64LittleEndian(footer[16..24], payloadLength);
        outFs.Write(footer);
    }

    /// <summary>
    /// Creates an AGM_SFX2 parallel indexed Brotli bundle from a source directory (used by tests and tooling).
    /// </summary>
    public static void BuildV2Bundle(string stubExePath, string sourceDir, string outputExePath, IEnumerable<(string RelPath, byte[] Content)>? customEntries = null)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outputExePath))!);
        using var outFs = new FileStream(outputExePath, FileMode.Create, FileAccess.Write, FileShare.None);
        long payloadOffset;
        using (var stubFs = new FileStream(stubExePath, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            stubFs.CopyTo(outFs);
            payloadOffset = outFs.Position;
        }

        var entries = new List<SfxV2Entry>();
        var items = new List<(string RelPath, byte[] Raw, long LastWriteTicks)>();

        if (customEntries is not null)
        {
            foreach (var (rel, raw) in customEntries)
            {
                items.Add((rel, raw, DateTime.UtcNow.Ticks));
            }
        }
        else
        {
            var fullSrc = Path.GetFullPath(sourceDir);
            foreach (var file in Directory.EnumerateFiles(fullSrc, "*", SearchOption.AllDirectories))
            {
                var rel = Path.GetRelativePath(fullSrc, file).Replace('\\', '/');
                items.Add((rel, File.ReadAllBytes(file), File.GetLastWriteTimeUtc(file).Ticks));
            }
        }

        foreach (var (rel, raw, ticks) in items)
        {
            var dataOffset = outFs.Position - payloadOffset;
            byte[] toWrite = raw;
            byte flags = 0;

            if (raw.Length > 0)
            {
                using var ms = new MemoryStream();
                using (var br = new BrotliStream(ms, CompressionLevel.Optimal, leaveOpen: true))
                {
                    br.Write(raw, 0, raw.Length);
                }
                if (ms.Length < raw.Length)
                {
                    toWrite = ms.ToArray();
                    flags = 1;
                }
            }

            if (toWrite.Length > 0)
            {
                outFs.Write(toWrite, 0, toWrite.Length);
            }
            entries.Add(new SfxV2Entry(rel, dataOffset, toWrite.Length, raw.Length, ticks, flags));
        }

        var tocOffset = outFs.Position;
        using (var tocMs = new MemoryStream())
        {
            Span<byte> scratch = stackalloc byte[8];
            BinaryPrimitives.WriteInt32LittleEndian(scratch[..4], entries.Count);
            tocMs.Write(scratch[..4]);

            foreach (var e in entries)
            {
                var pathBytes = Encoding.UTF8.GetBytes(e.RelativePath);
                BinaryPrimitives.WriteUInt16LittleEndian(scratch[..2], (ushort)pathBytes.Length);
                tocMs.Write(scratch[..2]);
                tocMs.Write(pathBytes);
                BinaryPrimitives.WriteInt64LittleEndian(scratch, e.DataOffset);
                tocMs.Write(scratch);
                BinaryPrimitives.WriteInt64LittleEndian(scratch, e.CompressedLength);
                tocMs.Write(scratch);
                BinaryPrimitives.WriteInt64LittleEndian(scratch, e.UncompressedLength);
                tocMs.Write(scratch);
                BinaryPrimitives.WriteInt64LittleEndian(scratch, e.LastWriteUtcTicks);
                tocMs.Write(scratch);
                tocMs.WriteByte(e.Flags);
            }
            tocMs.Position = 0;
            tocMs.CopyTo(outFs);
        }

        var payloadLength = outFs.Position - payloadOffset;
        Span<byte> footer = stackalloc byte[TrailerV2Size];
        MagicV2.CopyTo(footer[..8]);
        BinaryPrimitives.WriteInt64LittleEndian(footer[8..16], payloadOffset);
        BinaryPrimitives.WriteInt64LittleEndian(footer[16..24], payloadLength);
        BinaryPrimitives.WriteInt64LittleEndian(footer[24..32], tocOffset);
        outFs.Write(footer);
    }

    /// <summary>
    /// Copies only the stub executable prefix (without the embedded payload)
    /// to destinationPath so uninstall.exe remains compact and clean.
    /// </summary>
    public static void CopyCleanUninstallerStub(string currentExePath, string destinationPath)
    {
        var trailer = TryReadTrailer(currentExePath);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(destinationPath))!);

        using var src = new FileStream(currentExePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var dst = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None);

        var bytesToCopy = trailer?.PayloadOffset ?? src.Length;
        CopyExactBytes(src, dst, bytesToCopy);
    }

    public static long EstimateInstalledSizeBytes(string executablePath, string? externalPayloadPath = null)
    {
        try
        {
            if (!string.IsNullOrWhiteSpace(externalPayloadPath))
            {
                if (Directory.Exists(externalPayloadPath))
                {
                    return Directory.EnumerateFiles(externalPayloadPath, "*", SearchOption.AllDirectories)
                        .Sum(f => new FileInfo(f).Length);
                }
                if (File.Exists(externalPayloadPath))
                {
                    using var zip = ZipFile.OpenRead(externalPayloadPath);
                    return zip.Entries.Sum(e => e.Length);
                }
            }

            var trailer = TryReadTrailer(executablePath);
            if (trailer is not null)
            {
                using var handle = File.OpenHandle(executablePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, FileOptions.RandomAccess);
                if (trailer.Value.FormatVersion == 2)
                {
                    var entries = ReadV2Toc(handle, trailer.Value);
                    long sum = 0;
                    foreach (var e in entries) sum += e.UncompressedLength;
                    return sum;
                }
                using var sub = new RandomAccessSubStream(handle, trailer.Value.PayloadOffset, trailer.Value.PayloadLength);
                using var zip = new ZipArchive(sub, ZipArchiveMode.Read, leaveOpen: false);
                return zip.Entries.Sum(e => e.Length);
            }
        }
        catch
        {
            // Fall back to default estimate
        }

        return 420L * 1024 * 1024;
    }

    public static long ExtractPayload(
        string executablePath,
        string destinationDir,
        string? externalPayloadPath,
        Action<double>? onProgress,
        CancellationToken ct)
    {
        Directory.CreateDirectory(destinationDir);

        if (!string.IsNullOrWhiteSpace(externalPayloadPath) && Directory.Exists(externalPayloadPath))
        {
            return CopyDirectoryWithProgress(externalPayloadPath, destinationDir, onProgress, ct);
        }

        if (!string.IsNullOrWhiteSpace(externalPayloadPath) && File.Exists(externalPayloadPath))
        {
            using var extHandle = File.OpenHandle(externalPayloadPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, FileOptions.RandomAccess);
            var extLen = RandomAccess.GetLength(extHandle);
            return ExtractV1ZipParallel(extHandle, 0, extLen, destinationDir, onProgress, ct);
        }

        var trailer = TryReadTrailer(executablePath)
            ?? throw new InvalidOperationException("No installation payload is embedded in this setup executable.");

        using var handle = File.OpenHandle(executablePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, FileOptions.RandomAccess);
        if (trailer.FormatVersion == 2)
        {
            return ExtractV2Parallel(handle, trailer, destinationDir, onProgress, ct);
        }
        return ExtractV1ZipParallel(handle, trailer.PayloadOffset, trailer.PayloadLength, destinationDir, onProgress, ct);
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

    private static long ExtractV2Parallel(
        SafeFileHandle handle,
        SfxTrailer trailer,
        string destinationDir,
        Action<double>? onProgress,
        CancellationToken ct)
    {
        var fullRoot = Path.GetFullPath(destinationDir);
        if (!fullRoot.EndsWith(Path.DirectorySeparatorChar))
            fullRoot += Path.DirectorySeparatorChar;

        var entries = ReadV2Toc(handle, trailer);
        var uniqueDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var workItems = new List<(SfxV2Entry Entry, string TargetPath)>(entries.Count);
        long totalProgressBytes = 0;
        long totalActualBytes = 0;

        foreach (var entry in entries)
        {
            ct.ThrowIfCancellationRequested();
            var normalized = entry.RelativePath.Replace('/', Path.DirectorySeparatorChar);
            var targetPath = Path.GetFullPath(Path.Combine(fullRoot, normalized));
            if (!targetPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"Unsafe archive entry path rejected: {entry.RelativePath}");
            }

            if ((entry.Flags & 2) != 0)
            {
                uniqueDirs.Add(targetPath);
                continue;
            }

            var parent = Path.GetDirectoryName(targetPath);
            if (!string.IsNullOrEmpty(parent)) uniqueDirs.Add(parent);
            workItems.Add((entry, targetPath));
            totalProgressBytes += Math.Max(1L, entry.UncompressedLength);
            totalActualBytes += Math.Max(0L, entry.UncompressedLength);
        }

        foreach (var dir in uniqueDirs)
        {
            Directory.CreateDirectory(dir);
        }

        workItems.Sort((a, b) => b.Entry.CompressedLength.CompareTo(a.Entry.CompressedLength));
        var denominator = Math.Max(1L, totalProgressBytes);
        long processedBytes = 0;
        long lastReportTicks = 0;

        void ReportThrottled(long delta)
        {
            var next = Interlocked.Add(ref processedBytes, delta);
            if (onProgress is null) return;
            var now = Environment.TickCount64;
            var prev = Volatile.Read(ref lastReportTicks);
            if (now - prev >= 40 || next >= denominator)
            {
                if (Interlocked.CompareExchange(ref lastReportTicks, now, prev) == prev)
                {
                    onProgress(Math.Min(1.0, (double)next / denominator));
                }
            }
        }

        var maxParallel = Math.Clamp(Environment.ProcessorCount, 2, 8);
        Parallel.ForEach(
            workItems,
            new ParallelOptions { MaxDegreeOfParallelism = maxParallel, CancellationToken = ct },
            item =>
            {
                ct.ThrowIfCancellationRequested();
                var entry = item.Entry;
                var absOffset = trailer.PayloadOffset + entry.DataOffset;
                var isBrotli = (entry.Flags & 1) != 0;
                var bufSize = entry.UncompressedLength > 0
                    ? (int)Math.Min(256 * 1024L, Math.Max(4096L, entry.UncompressedLength))
                    : 4096;
                var buffer = ArrayPool<byte>.Shared.Rent(bufSize);
                try
                {
                    using (var outStream = new FileStream(
                        item.TargetPath,
                        FileMode.Create,
                        FileAccess.Write,
                        FileShare.None,
                        Math.Min(bufSize, 65536),
                        FileOptions.SequentialScan))
                    {
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

                    if (entry.LastWriteUtcTicks > 0)
                    {
                        try
                        {
                            var dt = new DateTime(entry.LastWriteUtcTicks, DateTimeKind.Utc);
                            if (dt.Year > 1980) File.SetLastWriteTimeUtc(item.TargetPath, dt);
                        }
                        catch
                        {
                            // Ignore timestamp errors
                        }
                    }

                    ReportThrottled(Math.Max(1L, entry.UncompressedLength));
                }
                finally
                {
                    ArrayPool<byte>.Shared.Return(buffer);
                }
            });

        onProgress?.Invoke(1.0);
        return totalActualBytes;
    }

    private static long ExtractV1ZipParallel(
        SafeFileHandle handle,
        long payloadOffset,
        long payloadLength,
        string destinationDir,
        Action<double>? onProgress,
        CancellationToken ct)
    {
        var fullRoot = Path.GetFullPath(destinationDir);
        if (!fullRoot.EndsWith(Path.DirectorySeparatorChar))
            fullRoot += Path.DirectorySeparatorChar;

        var uniqueDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var entryItems = new List<(int Index, long CompLen, long RawLen, string TargetPath)>();
        long totalProgressBytes = 0;
        long totalActualBytes = 0;

        using (var probeSub = new RandomAccessSubStream(handle, payloadOffset, payloadLength))
        using (var probeArchive = new ZipArchive(probeSub, ZipArchiveMode.Read, leaveOpen: false))
        {
            for (var i = 0; i < probeArchive.Entries.Count; i++)
            {
                ct.ThrowIfCancellationRequested();
                var entry = probeArchive.Entries[i];
                var normalized = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                var targetPath = Path.GetFullPath(Path.Combine(fullRoot, normalized));

                // Strict Zip-Slip path traversal prevention
                if (!targetPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException($"Unsafe archive entry path rejected: {entry.FullName}");
                }

                if (string.IsNullOrEmpty(entry.Name))
                {
                    uniqueDirs.Add(targetPath);
                    continue;
                }

                var parent = Path.GetDirectoryName(targetPath);
                if (!string.IsNullOrEmpty(parent)) uniqueDirs.Add(parent);
                entryItems.Add((i, entry.CompressedLength, entry.Length, targetPath));
                totalProgressBytes += Math.Max(1L, entry.Length);
                totalActualBytes += Math.Max(0L, entry.Length);
            }
        }

        foreach (var dir in uniqueDirs)
        {
            Directory.CreateDirectory(dir);
        }

        entryItems.Sort((a, b) => b.CompLen.CompareTo(a.CompLen));
        var denominator = Math.Max(1L, totalProgressBytes);
        long processedBytes = 0;
        long lastReportTicks = 0;

        void ReportThrottled(long delta)
        {
            var next = Interlocked.Add(ref processedBytes, delta);
            if (onProgress is null) return;
            var now = Environment.TickCount64;
            var prev = Volatile.Read(ref lastReportTicks);
            if (now - prev >= 40 || next >= denominator)
            {
                if (Interlocked.CompareExchange(ref lastReportTicks, now, prev) == prev)
                {
                    onProgress(Math.Min(1.0, (double)next / denominator));
                }
            }
        }

        var workerCount = Math.Clamp(Environment.ProcessorCount, 2, 8);
        var buckets = new List<(int Index, long RawLen, string TargetPath)>[workerCount];
        for (var w = 0; w < workerCount; w++) buckets[w] = new List<(int, long, string)>();
        for (var i = 0; i < entryItems.Count; i++)
        {
            buckets[i % workerCount].Add((entryItems[i].Index, entryItems[i].RawLen, entryItems[i].TargetPath));
        }

        Parallel.For(
            0,
            workerCount,
            new ParallelOptions { MaxDegreeOfParallelism = workerCount, CancellationToken = ct },
            w =>
            {
                var bucket = buckets[w];
                if (bucket.Count == 0) return;
                using var sub = new RandomAccessSubStream(handle, payloadOffset, payloadLength);
                using var archive = new ZipArchive(sub, ZipArchiveMode.Read, leaveOpen: false);
                var buffer = ArrayPool<byte>.Shared.Rent(256 * 1024);
                try
                {
                    foreach (var item in bucket)
                    {
                        ct.ThrowIfCancellationRequested();
                        var entry = archive.Entries[item.Index];
                        using (var entryStream = entry.Open())
                        using (var outStream = new FileStream(item.TargetPath, FileMode.Create, FileAccess.Write, FileShare.None, 65536, FileOptions.SequentialScan))
                        {
                            int read;
                            while ((read = entryStream.Read(buffer, 0, 256 * 1024)) > 0)
                            {
                                outStream.Write(buffer, 0, read);
                            }
                        }

                        if (entry.LastWriteTime.Year > 1980)
                        {
                            try
                            {
                                File.SetLastWriteTimeUtc(item.TargetPath, entry.LastWriteTime.UtcDateTime);
                            }
                            catch
                            {
                                // Ignore timestamp errors
                            }
                        }

                        ReportThrottled(Math.Max(1L, item.RawLen));
                    }
                }
                finally
                {
                    ArrayPool<byte>.Shared.Return(buffer);
                }
            });

        onProgress?.Invoke(1.0);
        return totalActualBytes;
    }

    private static long CopyDirectoryWithProgress(
        string sourceDir,
        string destinationDir,
        Action<double>? onProgress,
        CancellationToken ct)
    {
        var files = Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories);
        long totalBytes = 0;
        var lengths = new long[files.Length];
        for (var i = 0; i < files.Length; i++)
        {
            lengths[i] = new FileInfo(files[i]).Length;
            totalBytes += lengths[i];
        }
        var denom = Math.Max(1L, totalBytes);
        long copied = 0;
        long lastReportTicks = 0;

        for (var i = 0; i < files.Length; i++)
        {
            ct.ThrowIfCancellationRequested();
            var srcFile = files[i];
            var rel = Path.GetRelativePath(sourceDir, srcFile);
            var dstFile = Path.Combine(destinationDir, rel);
            Directory.CreateDirectory(Path.GetDirectoryName(dstFile)!);
            File.Copy(srcFile, dstFile, overwrite: true);
            copied += Math.Max(1L, lengths[i]);
            var now = Environment.TickCount64;
            if (onProgress is not null && (now - lastReportTicks >= 40 || copied >= denom))
            {
                lastReportTicks = now;
                onProgress(Math.Min(1.0, (double)copied / denom));
            }
        }
        onProgress?.Invoke(1.0);
        return totalBytes;
    }

    private static void CopyExactBytes(Stream source, Stream destination, long count)
    {
        var buffer = ArrayPool<byte>.Shared.Rent(256 * 1024);
        try
        {
            var remaining = count;
            while (remaining > 0)
            {
                var toRead = (int)Math.Min(256 * 1024, remaining);
                var read = source.Read(buffer, 0, toRead);
                if (read <= 0) break;
                destination.Write(buffer, 0, read);
                remaining -= read;
            }
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
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
                throw new IOException("Attempted to seek outside embedded SFX payload bounds.");
            _position = next;
            return _position;
        }

        public override void Flush() { }
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
