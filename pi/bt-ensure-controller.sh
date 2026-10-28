#!/bin/sh
# Pi 3의 내장 블루투스는 부팅 중 초기화가 시간 초과(Opcode 0x0c14 failed: -110)로 실패할 때가 있다.
# 전원이 약할 때 특히 잦다. bluetoothd가 컨트롤러를 못 찾으면 UART 드라이버를 다시 연결한다.
DRIVER=/sys/bus/serial/drivers/hci_uart_bcm
has_controller() { timeout 5 bluetoothctl list 2>/dev/null | grep -q "^Controller"; }
for attempt in 1 2 3; do
  has_controller && exit 0
  echo "Bluetooth controller missing, rebinding (attempt $attempt)"
  [ -e "$DRIVER/serial0-0" ] && echo serial0-0 > "$DRIVER/unbind"
  sleep 2
  echo serial0-0 > "$DRIVER/bind" 2>/dev/null
  sleep 8
done
has_controller
