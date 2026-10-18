#!/bin/sh
# ONE-TIME host setup for Remote Desktop (v5.3) — after this, no per-session
# approvals: web login is the only gate.
#   1) ydotoold  → kernel-level input injection (no prompts)
#   2) gstreamer + pipewire plugins → zero-prompt KWin screencast pipeline
set -e
echo "== 1/3 input: ydotoold =="
if command -v ydotoold >/dev/null 2>&1 || pacman -Q ydotool >/dev/null 2>&1; then
    if systemctl list-unit-files 2>/dev/null | grep -q ydotoold; then
        sudo systemctl enable --now ydotoold.service && echo "  ydotoold (system) enabled"
    elif systemctl --user list-unit-files 2>/dev/null | grep -q ydotoold; then
        systemctl --user enable --now ydotoold.service && echo "  ydotoold (user) enabled"
    else
        echo "  ydotool installed but no unit found — run: ydotoold & (or add a user unit)"
    fi
else
    echo "  installing ydotool…"; sudo pacman -S --needed --noconfirm ydotool
    sudo systemctl enable --now ydotoold.service 2>/dev/null || echo "  enable manually: sudo systemctl enable --now ydotoold"
fi
sleep 1
SOCK="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/ydotool.socket"
[ -S "$SOCK" ] && echo "  socket ok: $SOCK" || echo "  WARNING: no ydotool socket at $SOCK yet"

echo "== 2/3 capture: gstreamer + pipewire =="
command -v gst-launch-1.0 >/dev/null 2>&1 || { echo "  installing gstreamer…"; sudo pacman -S --needed --noconfirm gstreamer gst-plugins-base gst-plugins-good gst-libav pipewire-zeroconf 2>/dev/null || sudo pacman -S --needed --noconfirm gstreamer gst-plugins-base gst-plugins-good gst-libav; }
gst-inspect-1.0 pipewiresrc >/dev/null 2>&1 && echo "  pipewiresrc ok" || echo "  WARNING: gst pipewire plugin missing (pacman -S gst-plugins-pipewire? / pipewire package provides it)"
gst-inspect-1.0 vaapih264enc >/dev/null 2>&1 && echo "  vaapih264enc (hw) ok" || gst-inspect-1.0 x264enc >/dev/null 2>&1 && echo "  x264enc (sw) ok" || echo "  WARNING: no h264 encoder — install gst-libav or x264 plugin"

echo "== 3/3 wire it up =="
echo "  export GK_RD_CAPTURE_CMD=\"sh $(cd "$(dirname "$0")" && pwd)/rd-screencast-kwin.sh\""
echo "  then restart garuda-konsole (node server.js) and open palette → 'Remote Desktop: connect'"
echo "  KDE Wayland screencast via KWin D-Bus needs NO portal approval (same-user session bus)."
echo "done."
