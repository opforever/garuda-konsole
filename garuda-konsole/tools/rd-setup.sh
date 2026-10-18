#!/bin/sh
# ONE-TIME host setup for Remote Desktop (v5.3+) — after this, no per-session
# approvals: the web login is the only gate.
#   1) ydotoold  → kernel-level input injection (no prompts), persisted as a
#      USER systemd unit so it survives reboots
#   2) gstreamer + pipewire plugins → zero-prompt KWin screencast pipeline
set -e
UIDN=$(id -u)
XDG="${XDG_RUNTIME_DIR:-/run/user/$UIDN}"
SOCK_A="$XDG/.ydotool_socket"   # ydotool >=1.0 default
SOCK_B="$XDG/ydotool.socket"    # older/default-alt

echo "== 1/3 input: ydotoold =="
if [ -S "$SOCK_A" ] || [ -S "$SOCK_B" ]; then
    echo "  ydotoold already running (socket: $([ -S "$SOCK_A" ] && echo "$SOCK_A" || echo "$SOCK_B"))"
else
    if ! systemctl --user list-unit-files 2>/dev/null | grep -q ydotoold; then
        mkdir -p "$HOME/.config/systemd/user"
        cat > "$HOME/.config/systemd/user/ydotoold.service" <<EOF
[Unit]
Description=ydotoold input-injection daemon (Garuda Konsole Remote Desktop)
After=graphical-session.target

[Service]
ExecStart=${YDOTOOLD_BIN:-/usr/bin/ydotoold}
Restart=on-failure

[Install]
WantedBy=default.target
EOF
        systemctl --user daemon-reload
        echo "  created user unit ~/.config/systemd/user/ydotoold.service"
    fi
    systemctl --user enable --now ydotoold.service && echo "  ydotoold enabled (user unit, survives reboot)"
    sleep 1
fi
[ -S "$SOCK_A" ] && echo "  socket ok: $SOCK_A" || { [ -S "$SOCK_B" ] && echo "  socket ok: $SOCK_B" || echo "  WARNING: no ydotool socket yet — check: systemctl --user status ydotoold"; }

echo "== 2/3 capture: gstreamer + pipewire =="
command -v gst-launch-1.0 >/dev/null 2>&1 || { echo "  installing gstreamer…"; sudo pacman -S --needed --noconfirm gstreamer gst-plugins-base gst-plugins-good gst-libav; }
gst-inspect-1.0 pipewiresrc >/dev/null 2>&1 && echo "  pipewiresrc ok" || echo "  WARNING: gst pipewire plugin missing"
if gst-inspect-1.0 vaapih264enc >/dev/null 2>&1; then echo "  vaapih264enc (hw) ok"; elif gst-inspect-1.0 x264enc >/dev/null 2>&1; then echo "  x264enc (sw) ok"; else echo "  WARNING: no h264 encoder — sudo pacman -S gst-libav"; fi

echo "== 3/3 wire it up =="
echo "  export GK_RD_CAPTURE_CMD=\"sh $(cd "$(dirname "$0")" && pwd)/rd-screencast-kwin.sh\""
echo "  then restart garuda-konsole (node server.js) and open palette → 'Remote Desktop: connect'"
echo "  KWin D-Bus screencast + ydotoold need NO portal dialogs (same-user session)."
echo "done."
