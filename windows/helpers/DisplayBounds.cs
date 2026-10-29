// 디스플레이 번호(\\.\DISPLAY2 → 2)를 받아 그 화면의 좌표를 "x,y,너비,높이"로 출력한다.
// 못 찾으면 연결된 화면 목록을 표준오류에 쓰고 1로 끝난다.
// 부팅 직후 PowerShell은 이 PC(HDD)에서 시작에 몇 분 걸려서, 시작 경로에서는 이 도우미를 쓴다.
using System;
using System.Windows.Forms;

public static class DisplayBounds {
  public static int Main(string[] args) {
    string wanted = args.Length > 0 ? "\\\\.\\DISPLAY" + args[0] : null;
    foreach (var screen in Screen.AllScreens) {
      if (screen.DeviceName != wanted) continue;
      var b = screen.Bounds;
      Console.WriteLine(b.X + "," + b.Y + "," + b.Width + "," + b.Height);
      return 0;
    }
    var names = new string[Screen.AllScreens.Length];
    for (int i = 0; i < names.Length; i++) names[i] = Screen.AllScreens[i].DeviceName;
    Console.Error.WriteLine("display not found: " + wanted + " (connected: " + string.Join(", ", names) + ")");
    return 1;
  }
}
