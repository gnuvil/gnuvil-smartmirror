// Windows 기본 출력 장치(AUX 스피커)의 소리를 WASAPI 루프백으로 캡처해
// cava의 raw ascii 출력과 같은 형식("0;12;55;...;\n", 막대 값 0-100)으로 표준출력에 쓴다.
// 사용법: GnuvilLoopbackBars.exe --bars 32 --framerate 20
// 장치가 바뀌거나 사라지면 종료하고, MMM-GnuvilVisualizer가 5초 뒤 다시 실행한다.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
  [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
}

[ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioClient {
  [PreserveSig] int Initialize(int shareMode, int streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr sessionGuid);
  [PreserveSig] int GetBufferSize(out uint frames);
  [PreserveSig] int GetStreamLatency(out long latency);
  [PreserveSig] int GetCurrentPadding(out uint frames);
  [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
  [PreserveSig] int GetMixFormat(out IntPtr format);
  [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
  [PreserveSig] int Start();
  [PreserveSig] int Stop();
  [PreserveSig] int Reset();
  [PreserveSig] int SetEventHandle(IntPtr handle);
  [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
}

[ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioCaptureClient {
  [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong qpcPosition);
  [PreserveSig] int ReleaseBuffer(uint frames);
  [PreserveSig] int GetNextPacketSize(out uint frames);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject {}

public static class LoopbackBars {
  const int FftSize = 2048;
  const int StreamFlagsLoopback = 0x00020000;
  const uint BufferFlagsSilent = 0x2;
  const double MinFrequency = 50, MaxFrequency = 16000;
  // 이 범위(dB)를 막대 높이 0-100에 대응시킨다. 실제 YouTube 음악으로 맞춘 값이다.
  const double FloorDb = -70, RangeDb = 50;
  static readonly Guid FloatSubFormat = new Guid("00000003-0000-0010-8000-00aa00389b71");

  static void Check(int hr, string step) {
    if (hr < 0) throw new IOException(step + " 실패 (0x" + hr.ToString("x8") + ")");
  }

  static int Argument(string[] args, string name, int fallback) {
    for (int i = 0; i + 1 < args.Length; i++) if (args[i] == name) return int.Parse(args[i + 1]);
    return fallback;
  }

  static void Fft(double[] re, double[] im) {
    int n = re.Length;
    for (int i = 1, j = 0; i < n; i++) {
      int bit = n >> 1;
      for (; (j & bit) != 0; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { double t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (int len = 2; len <= n; len <<= 1) {
      double angle = -2 * Math.PI / len, wr = Math.Cos(angle), wi = Math.Sin(angle);
      for (int i = 0; i < n; i += len) {
        double cr = 1, ci = 0;
        for (int k = 0; k < len / 2; k++) {
          int a = i + k, b = a + len / 2;
          double xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          double nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }

  public static int Main(string[] args) {
    int bars = Argument(args, "--bars", 32), framerate = Argument(args, "--framerate", 20);
    if (bars < 4 || bars > 128 || framerate < 5 || framerate > 60) {
      Console.Error.WriteLine("bars must be 4-128 and framerate 5-60");
      return 2;
    }
    try {
      Run(bars, framerate);
      return 0;
    } catch (Exception error) {
      Console.Error.WriteLine(error.Message);
      return 1;
    }
  }

  static void Run(int bars, int framerate) {
    var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
    IMMDevice device;
    Check(enumerator.GetDefaultAudioEndpoint(0, 1, out device), "기본 출력 장치 찾기");
    var audioClientId = typeof(IAudioClient).GUID;
    object instance;
    Check(device.Activate(ref audioClientId, 1, IntPtr.Zero, out instance), "오디오 장치 열기");
    var client = (IAudioClient)instance;
    IntPtr format;
    Check(client.GetMixFormat(out format), "출력 형식 확인");
    int formatTag = Marshal.ReadInt16(format, 0) & 0xffff;
    int channels = Marshal.ReadInt16(format, 2);
    int sampleRate = Marshal.ReadInt32(format, 4);
    int blockAlign = Marshal.ReadInt16(format, 12);
    int bits = Marshal.ReadInt16(format, 14);
    bool isFloat = formatTag == 3 || (formatTag == 0xFFFE && new Guid(ReadBytes(format, 24, 16)) == FloatSubFormat);
    if (!(isFloat && bits == 32) && bits != 16) throw new IOException("지원하지 않는 출력 형식 (" + bits + "bit)");
    Check(client.Initialize(0, StreamFlagsLoopback, 2000000, 0, format, IntPtr.Zero), "루프백 캡처 시작 준비");
    var captureId = typeof(IAudioCaptureClient).GUID;
    object service;
    Check(client.GetService(ref captureId, out service), "캡처 서비스 열기");
    var capture = (IAudioCaptureClient)service;
    Check(client.Start(), "루프백 캡처 시작");

    var ring = new double[FftSize];
    int ringPosition = 0;
    var window = new double[FftSize];
    double windowSum = 0;
    for (int i = 0; i < FftSize; i++) { window[i] = 0.5 * (1 - Math.Cos(2 * Math.PI * i / (FftSize - 1))); windowSum += window[i]; }

    // 막대마다 맡을 FFT 구간을 로그 간격으로 나눈다.
    var lowBin = new int[bars];
    var highBin = new int[bars];
    var weightDb = new double[bars];
    double top = Math.Min(MaxFrequency, sampleRate / 2.0), binWidth = (double)sampleRate / FftSize;
    for (int b = 0; b < bars; b++) {
      double from = MinFrequency * Math.Pow(top / MinFrequency, (double)b / bars);
      double to = MinFrequency * Math.Pow(top / MinFrequency, (double)(b + 1) / bars);
      lowBin[b] = Math.Max(1, (int)Math.Round(from / binWidth));
      highBin[b] = Math.Max(lowBin[b], (int)Math.Round(to / binWidth) - 1);
      // 고음은 에너지가 작아 보이므로 옥타브당 3dB를 보정한다.
      weightDb[b] = 3 * Math.Log(Math.Sqrt(from * to) / 1000, 2);
    }

    var levels = new double[bars];
    var re = new double[FftSize];
    var im = new double[FftSize];
    var output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = false, NewLine = "\n" };
    var line = new StringBuilder();
    int frameMs = 1000 / framerate, samplesPerFrame = sampleRate / framerate;
    double fall = 100.0 / framerate * 2.5;
    var clock = Stopwatch.StartNew();
    long nextFrame = frameMs;

    while (true) {
      int received = 0;
      uint packet;
      Check(capture.GetNextPacketSize(out packet), "소리 읽기");
      while (packet > 0) {
        IntPtr data; uint frames, flags; ulong devicePosition, qpcPosition;
        Check(capture.GetBuffer(out data, out frames, out flags, out devicePosition, out qpcPosition), "소리 읽기");
        bool silent = (flags & BufferFlagsSilent) != 0;
        for (int f = 0; f < frames; f++) {
          double sum = 0;
          if (!silent) {
            for (int c = 0; c < channels; c++) {
              int offset = f * blockAlign + c * (bits / 8);
              sum += isFloat ? BitConverter.ToSingle(BitConverter.GetBytes(Marshal.ReadInt32(data, offset)), 0)
                : Marshal.ReadInt16(data, offset) / 32768.0;
            }
          }
          ring[ringPosition] = sum / channels;
          ringPosition = (ringPosition + 1) % FftSize;
        }
        received += (int)frames;
        Check(capture.ReleaseBuffer(frames), "소리 읽기");
        Check(capture.GetNextPacketSize(out packet), "소리 읽기");
      }

      long elapsed = clock.ElapsedMilliseconds;
      if (elapsed < nextFrame) { Thread.Sleep(5); continue; }
      nextFrame = elapsed + frameMs;
      // 아무것도 재생하지 않으면 루프백에 패킷이 오지 않으므로 그만큼 무음을 채운다.
      for (int i = received; i < samplesPerFrame; i++) { ring[ringPosition] = 0; ringPosition = (ringPosition + 1) % FftSize; }

      for (int i = 0; i < FftSize; i++) { re[i] = ring[(ringPosition + i) % FftSize] * window[i]; im[i] = 0; }
      Fft(re, im);
      line.Length = 0;
      for (int b = 0; b < bars; b++) {
        double peak = 0;
        for (int k = lowBin[b]; k <= highBin[b]; k++) peak = Math.Max(peak, Math.Sqrt(re[k] * re[k] + im[k] * im[k]));
        double amplitude = peak * 2 / windowSum;
        double target = amplitude <= 0 ? 0 : (20 * Math.Log10(amplitude) + weightDb[b] - FloorDb) / RangeDb * 100;
        target = Math.Max(0, Math.Min(100, target));
        levels[b] = Math.Max(target, levels[b] - fall);
        if (levels[b] < 1) levels[b] = 0;
        line.Append((int)Math.Round(levels[b])).Append(';');
      }
      output.WriteLine(line.ToString());
      output.Flush();
    }
  }

  static byte[] ReadBytes(IntPtr pointer, int offset, int length) {
    var bytes = new byte[length];
    Marshal.Copy(IntPtr.Add(pointer, offset), bytes, 0, length);
    return bytes;
  }
}
