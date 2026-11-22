using System.Buffers.Binary;
using System.IO;
using System.IO.Compression;
using System.Text;

namespace Agendamea.Setup.Engine;

public readonly record struct SfxTrailer(long PayloadOffset, long PayloadLength);

/// <summary>
/// Appended-ZIP Self-Extracting Archive format:
/// [WPF Stub Executable][ZIP Payload][8-byte Magic "AGM_SFX1"][Int64 LE PayloadOffset][Int64 LE PayloadLength]
/// </summary>
public static class SfxPayloadReader
{
    public const int TrailerSize = 24;
    private static readonly byte[] MagicBytes = Encoding.ASCII.GetBytes("AGM_SFX1");

    public static SfxTrailer? TryReadTrailer(string executablePath)
    {
        if (string.IsNullOrWhiteSpace(executablePath) || !File.Exists(executablePath))
            return null;

        using var fs = new FileStream(executablePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        return TryReadTrailer(fs);
    }

    public static SfxTrailer? TryReadTrailer(Stream stream)
    {
        if (!stream.CanSeek || stream.Length < TrailerSize)
            return null;

        Span<byte> footer = stackalloc byte[TrailerSize];
        stream.Seek(-TrailerSize, SeekOrigin.End);
        var read = stream.Read(footer);
        if (read != TrailerSize) return null;

        if (!footer[..8].SequenceEqual(MagicBytes))
            return null;

        var offset = BinaryPrimitives.ReadInt64LittleEndian(footer[8..16]);
        var length = BinaryPrimitives.ReadInt64LittleEndian(footer[16..24]);

        if (offset <= 0 || length <= 0 || offset + length + TrailerSize != stream.Length)
            return null;

        return new SfxTrailer(offset, length);
    }

    /// <summary>
    /// Creates an appended-ZIP SFX bundle (used by tests and optional C# tooling).
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
        MagicBytes.CopyTo(footer[..8]);
        BinaryPrimitives.WriteInt64LittleEndian(footer[8..16], payloadOffset);
        BinaryPrimitives.WriteInt64LittleEndian(footer[16..24], payloadLength);
        outFs.Write(footer);
    }

    /// <summary>
    /// Copies only the stub executable prefix (without the embedded ZIP payload)
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
                using var fs = new FileStream(executablePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                using var sub = new SubReadStream(fs, trailer.Value.PayloadOffset, trailer.Value.PayloadLength);
                using var zip = new ZipArchive(sub, ZipArchiveMode.Read, leaveOpen: false);
                return zip.Entries.Sum(e => e.Length);
            }
        }
        catch
        {
            // Fall back to default estimate
        }

        return 190L * 1024 * 1024;
    }

    public static void ExtractPayload(
        string executablePath,
        string destinationDir,
        string? externalPayloadPath,
        Action<double>? onProgress,
        CancellationToken ct)
    {
        Directory.CreateDirectory(destinationDir);

        if (!string.IsNullOrWhiteSpace(externalPayloadPath) && Directory.Exists(externalPayloadPath))
        {
            CopyDirectoryWithProgress(externalPayloadPath, destinationDir, onProgress, ct);
            return;
        }

        if (!string.IsNullOrWhiteSpace(externalPayloadPath) && File.Exists(externalPayloadPath))
        {
            using var zip = ZipFile.OpenRead(externalPayloadPath);
            ExtractZipSafe(zip, destinationDir, onProgress, ct);
            return;
        }

        var trailer = TryReadTrailer(executablePath)
            ?? throw new InvalidOperationException("No installation payload is embedded in this setup executable.");

        using var fs = new FileStream(executablePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var sub = new SubReadStream(fs, trailer.PayloadOffset, trailer.PayloadLength);
        using var archive = new ZipArchive(sub, ZipArchiveMode.Read, leaveOpen: false);
        ExtractZipSafe(archive, destinationDir, onProgress, ct);
    }

    private static void ExtractZipSafe(
        ZipArchive archive,
        string destinationDir,
        Action<double>? onProgress,
        CancellationToken ct)
    {
        var fullRoot = Path.GetFullPath(destinationDir);
        if (!fullRoot.EndsWith(Path.DirectorySeparatorChar))
            fullRoot += Path.DirectorySeparatorChar;

        var totalBytes = Math.Max(1L, archive.Entries.Sum(e => Math.Max(1L, e.Length)));
        long processedBytes = 0;

        foreach (var entry in archive.Entries)
        {
            ct.ThrowIfCancellationRequested();
            var normalized = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
            var targetPath = Path.GetFullPath(Path.Combine(fullRoot, normalized));

            // Strict Zip-Slip path traversal prevention
            if (!targetPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"Unsafe archive entry path rejected: {entry.FullName}");
            }

            if (string.IsNullOrEmpty(entry.Name))
            {
                Directory.CreateDirectory(targetPath);
                continue;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(targetPath)!);
            using (var entryStream = entry.Open())
            using (var outStream = new FileStream(targetPath, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                entryStream.CopyTo(outStream);
            }

            if (entry.LastWriteTime.Year > 1980)
            {
                try
                {
                    File.SetLastWriteTimeUtc(targetPath, entry.LastWriteTime.UtcDateTime);
                }
                catch
                {
                    // Ignore timestamp errors
                }
            }

            processedBytes += Math.Max(1L, entry.Length);
            onProgress?.Invoke(Math.Min(1.0, (double)processedBytes / totalBytes));
        }
    }

    private static void CopyDirectoryWithProgress(
        string sourceDir,
        string destinationDir,
        Action<double>? onProgress,
        CancellationToken ct)
    {
        var files = Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories);
        var totalBytes = Math.Max(1L, files.Sum(f => Math.Max(1L, new FileInfo(f).Length)));
        long copied = 0;

        foreach (var srcFile in files)
        {
            ct.ThrowIfCancellationRequested();
            var rel = Path.GetRelativePath(sourceDir, srcFile);
            var dstFile = Path.Combine(destinationDir, rel);
            Directory.CreateDirectory(Path.GetDirectoryName(dstFile)!);
            File.Copy(srcFile, dstFile, overwrite: true);
            copied += Math.Max(1L, new FileInfo(srcFile).Length);
            onProgress?.Invoke(Math.Min(1.0, (double)copied / totalBytes));
        }
    }

    private static void CopyExactBytes(Stream source, Stream destination, long count)
    {
        var buffer = new byte[81920];
        var remaining = count;
        while (remaining > 0)
        {
            var toRead = (int)Math.Min(buffer.Length, remaining);
            var read = source.Read(buffer, 0, toRead);
            if (read <= 0) break;
            destination.Write(buffer, 0, read);
            remaining -= read;
        }
    }

    private sealed class SubReadStream : Stream
    {
        private readonly Stream _inner;
        private readonly long _offset;
        private readonly long _length;
        private long _position;

        public SubReadStream(Stream inner, long offset, long length)
        {
            _inner = inner;
            _offset = offset;
            _length = length;
            _inner.Seek(_offset, SeekOrigin.Begin);
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

        public override int Read(byte[] buffer, int offset, int count)
        {
            var remaining = _length - _position;
            if (remaining <= 0) return 0;
            var toRead = (int)Math.Min(count, remaining);
            _inner.Seek(_offset + _position, SeekOrigin.Begin);
            var read = _inner.Read(buffer, offset, toRead);
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
            _inner.Seek(_offset + _position, SeekOrigin.Begin);
            return _position;
        }

        public override void Flush() { }
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
