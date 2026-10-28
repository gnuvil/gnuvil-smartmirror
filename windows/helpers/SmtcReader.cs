// Windows 미디어 세션(SMTC)을 1초마다 읽어 한 줄짜리 JSON으로 표준출력에 쓴다.
// 세션 선택, 제목 정리, 진행 시간 계산은 Node 쪽(windows/now-playing)에서 한다.
// 썸네일은 곡이 바뀌었을 때만 읽어 base64로 한 번 보낸다.
using System;
using System.Collections.Generic;
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
    while (true) {
      var line = new Dictionary<string, object>();
      try {
        if (manager == null) manager = Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
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
