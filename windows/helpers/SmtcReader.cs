// Windows 미디어 세션(SMTC)을 1초마다 읽어 한 줄짜리 JSON으로 표준출력에 쓴다.
// 세션 선택, 제목 정리, 진행 시간 계산은 Node 쪽(windows/now-playing)에서 한다.
// 썸네일은 곡이 바뀌었을 때만 읽어 base64로 한 번 보낸다.
// 표준입력으로 {"pause":"앱 이름"} 명령을 받으면 그 앱의 세션을 일시정지한다 (YouTube와 Spotify가 동시에 재생될 때 쓴다).
// {"mute":"프로세스 이름","on":true|false} 명령은 그 프로세스의 소리가 스피커로 나가지 않게 막는다(앱별 음소거).
// Spotify Soloist처럼 미디어 세션이 없는 프로그램도 소리는 막을 수 있다. 새 소리 세션이 생겨도 1초마다 다시 적용한다.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;

public static class SmtcReader {
  const int PollMs = 1000;
  const uint MaxThumbBytes = 256 * 1024;
  const int ThumbRetries = 5;

  // System.Runtime.WindowsRuntime 없이 빌드하려고 비동기 작업을 직접 기다린다.
  static T Wait<T>(IAsyncOperation<T> op) {
    for (int i = 0; i < 300 && op.Status == AsyncStatus.Started; i++) Thread.Sleep(10);
    if (op.Status != AsyncStatus.Completed) throw new TimeoutException("SMTC 응답 없음 (" + op.Status + ")");
    return op.GetResults();
  }

  static readonly ConcurrentQueue<string> Commands = new ConcurrentQueue<string>();
  // 프로세스 이름 조각 -> 원하는 음소거 상태. 끄는 명령(false)은 한 번 적용한 뒤 지운다.
  static readonly Dictionary<string, bool> Mutes = new Dictionary<string, bool>();

  // 표준입력은 Node가 보내는 명령만 읽는다. 메인 루프를 막지 않도록 따로 읽는다.
  static void ReadCommands() {
    var reader = new Thread(() => {
      string line;
      while ((line = Console.In.ReadLine()) != null) Commands.Enqueue(line);
    });
    reader.IsBackground = true;
    reader.Start();
  }

  static void ApplyCommands(GlobalSystemMediaTransportControlsSessionManager manager, JavaScriptSerializer json) {
    string line;
    while (Commands.TryDequeue(out line)) {
      try {
        var command = json.Deserialize<Dictionary<string, object>>(line);
        object app;
        object name;
        if (command != null && command.TryGetValue("mute", out name) && name is string) {
          object on;
          Mutes[((string)name).ToLowerInvariant()] = !command.TryGetValue("on", out on) || !(on is bool) || (bool)on;
          continue;
        }
        if (command == null || !command.TryGetValue("pause", out app) || !(app is string)) continue;
        foreach (var session in manager.GetSessions()) {
          if (session.SourceAppUserModelId == (string)app) Wait(session.TryPauseAsync());
        }
      } catch (Exception) {
        // 잘못된 명령은 무시한다. 재생 정보 보내기는 계속한다.
      }
    }
  }

  static void ApplyMutes() {
    foreach (var name in new List<string>(Mutes.Keys)) {
      try { AppAudio.SetMute(name, Mutes[name]); } catch (Exception) { /* 소리 장치가 바뀌는 순간 등은 다음 주기에 다시 한다. */ }
      if (!Mutes[name]) Mutes.Remove(name);
    }
  }

  static string ReadThumbnail(IRandomAccessStreamReference reference) {
    if (reference == null) return null;
    using (var stream = Wait(reference.OpenReadAsync())) {
      if (stream.Size == 0 || stream.Size > MaxThumbBytes) return null;
      var reader = new DataReader(stream.GetInputStreamAt(0));
      uint length = Wait(reader.LoadAsync((uint)stream.Size));
      var bytes = new byte[length];
      reader.ReadBytes(bytes);
      return Convert.ToBase64String(bytes);
    }
  }

  public static void Main() {
    Console.OutputEncoding = new UTF8Encoding(false);
    var json = new JavaScriptSerializer { MaxJsonLength = 4 * 1024 * 1024 };
    var thumbKeys = new Dictionary<string, string>();
    var thumbTries = new Dictionary<string, int>();
    var lastThumbs = new Dictionary<string, string>();
    var seenThumbKeys = new Dictionary<string, string>();
    GlobalSystemMediaTransportControlsSessionManager manager = null;
    ReadCommands();
    while (true) {
      var line = new Dictionary<string, object>();
      try {
        if (manager == null) manager = Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
        ApplyCommands(manager, json);
        ApplyMutes();
        var sessions = new List<object>();
        foreach (var session in manager.GetSessions()) {
          var app = session.SourceAppUserModelId;
          var media = Wait(session.TryGetMediaPropertiesAsync());
          var playback = session.GetPlaybackInfo();
          var timeline = session.GetTimelineProperties();
          var item = new Dictionary<string, object> {
            { "app", app },
            { "status", playback.PlaybackStatus.ToString() },
            { "title", media.Title },
            { "artist", media.Artist },
            { "album", media.AlbumTitle },
            { "position", timeline.Position.TotalSeconds },
            { "duration", timeline.EndTime.TotalSeconds },
            { "updatedAt", timeline.LastUpdatedTime.ToUnixTimeMilliseconds() }
          };
          var key = media.Title + "\x1f" + media.Artist;
          string seen;
          int tries;
          thumbTries.TryGetValue(app, out tries);
          if (!thumbKeys.TryGetValue(app, out seen) || seen != key) tries = 0;
          // 브라우저는 썸네일을 제목보다 늦게 올리기도 해서 몇 번 더 읽어 본다.
          if (tries < ThumbRetries && (seen != key || tries > 0)) {
            string thumb = null;
            try { thumb = ReadThumbnail(media.Thumbnail); } catch { thumb = null; }
            // 곡이 바뀐 직후에는 이전 곡의 썸네일이 남아 있을 수 있으므로 같은 이미지는 아직 안 바뀐 것으로 본다.
            string previous;
            if (thumb != null && lastThumbs.TryGetValue(app, out previous) && previous == thumb && seenThumbKeys.ContainsKey(app) && seenThumbKeys[app] != key) thumb = null;
            if (thumb != null) {
              item["thumbnail"] = thumb;
              lastThumbs[app] = thumb;
              seenThumbKeys[app] = key;
              tries = ThumbRetries;
            } else tries += 1;
          }
          thumbKeys[app] = key;
          thumbTries[app] = tries;
          sessions.Add(item);
        }
        line["sessions"] = sessions;
      } catch (Exception error) {
        manager = null;
        line["error"] = error.Message;
      }
      line["now"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
      Console.WriteLine(json.Serialize(line));
      Console.Out.Flush();
      Thread.Sleep(PollMs);
    }
  }
}

// 기본 재생 장치의 앱별 소리 세션을 찾아 이름이 맞는 프로세스의 음소거를 켜고 끈다. 다른 앱과 시스템 소리에는 손대지 않는다.
public static class AppAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object result);
  }

  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    [PreserveSig] int GetAudioSessionControl(IntPtr groupId, int flags, out IntPtr control);
    [PreserveSig] int GetSimpleAudioVolume(IntPtr groupId, int flags, out IntPtr volume);
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
  }

  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetSession(int index, out IAudioSessionControl2 session);
  }

  [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    // IAudioSessionControl에서 물려받은 9개 메서드 (순서를 맞추려고 자리만 둔다)
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
    [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
    [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
    [PreserveSig] int GetGroupingParam(out Guid param);
    [PreserveSig] int SetGroupingParam(ref Guid param, ref Guid context);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr client);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr client);
    [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetProcessId(out uint pid);
  }

  [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    [PreserveSig] int SetMasterVolume(float level, ref Guid context);
    [PreserveSig] int GetMasterVolume(out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  // 이름에 nameFragment가 들어간 프로세스의 소리 세션을 모두 음소거하거나 푼다. 바꾼 세션 수를 돌려준다.
  public static int SetMute(string nameFragment, bool mute) {
    return Visit(nameFragment, (volume, context) => volume.SetMute(mute, ref context));
  }

  // 이름에 nameFragment가 들어간 프로세스 중 음소거된 세션이 있으면 true (확인용).
  public static bool IsMuted(string nameFragment) {
    bool any = false;
    Visit(nameFragment, (volume, context) => { bool muted; volume.GetMute(out muted); any |= muted; return 0; });
    return any;
  }

  delegate int VolumeAction(ISimpleAudioVolume volume, Guid context);

  static int Visit(string nameFragment, VolumeAction action) {
    var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
    IMMDevice device;
    if (enumerator.GetDefaultAudioEndpoint(0, 1, out device) != 0 || device == null) return 0;
    var iid = typeof(IAudioSessionManager2).GUID;
    object manager;
    if (device.Activate(ref iid, 23, IntPtr.Zero, out manager) != 0) return 0;
    IAudioSessionEnumerator sessions;
    if (((IAudioSessionManager2)manager).GetSessionEnumerator(out sessions) != 0) return 0;
    int count;
    sessions.GetCount(out count);
    int changed = 0;
    var context = Guid.Empty;
    for (int i = 0; i < count; i++) {
      IAudioSessionControl2 session;
      if (sessions.GetSession(i, out session) != 0) continue;
      uint pid;
      if (session.GetProcessId(out pid) != 0 || pid == 0) continue;
      string name;
      try { name = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch (Exception) { continue; }
      if (!name.Contains(nameFragment.ToLowerInvariant())) continue;
      var volume = session as ISimpleAudioVolume;
      if (volume == null) continue;
      if (action(volume, context) == 0) changed++;
    }
    return changed;
  }
}
