#!/usr/bin/env bash
# Raspberry Pi를 원스탑 음악 허브 + 스마트미러로 설정한다.
# Raspberry Pi OS(trixie, Desktop) 위에서 데스크톱 로그인 사용자로 실행한다. 여러 번 실행해도 된다.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
MM="${MAGICMIRROR_DIR:-$HOME/MagicMirror}"
NODE_VERSION="${NODE_VERSION:-v24.22.1}"
MM_VERSION="${MM_VERSION:-v2.37.0}"
DEVICE_NAME="${GNUVIL_DEVICE_NAME:-Gnuvil Mirror}"

step() { printf '\n== %s\n' "$*"; }

step "패키지"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  git curl shairport-sync playerctl cava bluez-tools avahi-utils rfkill fonts-noto-cjk

step "Node.js $NODE_VERSION (~/.local/node)"
if [ "$("$HOME/.local/node/bin/node" --version 2>/dev/null)" != "$NODE_VERSION" ]; then
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-arm64.tar.xz" -o /tmp/node.tar.xz
  rm -rf "$HOME/.local/node" && mkdir -p "$HOME/.local/node"
  tar -xJf /tmp/node.tar.xz -C "$HOME/.local/node" --strip-components=1
fi
grep -q '.local/node/bin' "$HOME/.profile" || echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> "$HOME/.profile"
export PATH="$HOME/.local/node/bin:$PATH"

step "MagicMirror² $MM_VERSION"
[ -d "$MM" ] || git clone --depth 1 --branch "$MM_VERSION" https://github.com/MagicMirrorOrg/MagicMirror "$MM"
(cd "$MM" && [ -d node_modules ] || node --run install-mm)

step "MagicMirror 설정과 모듈 연결"
ln -sfn "$REPO/config/config.js" "$MM/config/config.js"
ln -sfn "$REPO/css/custom.css" "$MM/css/custom.css"
for module in "$REPO"/modules/MMM-Gnuvil*; do
  ln -sfn "$module" "$MM/modules/$(basename "$module")"
done

step "블루투스: '$DEVICE_NAME' 이름으로 항상 검색·페어링 허용"
# Raspberry Pi OS는 블루투스를 rfkill로 막아둔 채 시작할 수 있다. systemd-rfkill이 이 상태를 기억한다.
sudo rfkill unblock bluetooth
sudo sed -i \
  -e "s/^#\?Name = .*/Name = $DEVICE_NAME/" \
  -e 's/^#\?Class = .*/Class = 0x240414/' \
  -e 's/^#\?DiscoverableTimeout = .*/DiscoverableTimeout = 0/' \
  -e 's/^#\?PairableTimeout = .*/PairableTimeout = 0/' \
  -e 's/^#\?AlwaysPairable = .*/AlwaysPairable = true/' \
  -e 's/^#\?JustWorksRepairing = .*/JustWorksRepairing = always/' \
  /etc/bluetooth/main.conf
sudo install -D -m 755 "$REPO/pi/bt-ensure-controller.sh" /usr/local/lib/gnuvil/bt-ensure-controller.sh
sudo install -m 644 "$REPO/pi/systemd/gnuvil-bt-agent.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart bluetooth
sudo systemctl enable --now gnuvil-bt-agent.service

step "AirPlay: 시스템 서비스 대신 사용자 PipeWire로 출력"
sudo systemctl disable --now shairport-sync.service || true
mkdir -p "$HOME/.config/gnuvil"
sed "s/\"Gnuvil Mirror\"/\"$DEVICE_NAME\"/" "$REPO/pi/shairport-sync.conf" > "$HOME/.config/gnuvil/shairport-sync.conf"

step "비밀값 파일 (~/.config/gnuvil/env)"
if [ ! -f "$HOME/.config/gnuvil/env" ]; then
  install -m 600 /dev/null "$HOME/.config/gnuvil/env"
  echo "# GBIS_API_KEY=<발급받은 디코딩 키>" > "$HOME/.config/gnuvil/env"
fi

step "사용자 서비스"
mkdir -p "$HOME/.config/systemd/user"
for unit in "$REPO"/pi/systemd/{gnuvil-mpris-proxy,gnuvil-shairport,gnuvil-now-playing,magicmirror}.service; do
  ln -sfn "$unit" "$HOME/.config/systemd/user/$(basename "$unit")"
done
systemctl --user daemon-reload
systemctl --user enable gnuvil-mpris-proxy gnuvil-shairport gnuvil-now-playing magicmirror
systemctl --user restart gnuvil-mpris-proxy gnuvil-shairport gnuvil-now-playing magicmirror

step "완료"
echo "블루투스·AirPlay 이름: $DEVICE_NAME"
echo "버스 정보를 쓰려면 ~/.config/gnuvil/env 에 GBIS_API_KEY를 넣고: systemctl --user restart magicmirror"
