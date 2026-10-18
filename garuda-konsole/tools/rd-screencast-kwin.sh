#!/bin/sh
# Zero-prompt KDE Wayland screencast → streamable fragmented MP4 on stdout.
# Uses KWin's session D-Bus Screencasting API (same-user only; no portal
# dialog, so no per-session approval). Set as GK_RD_CAPTURE_CMD.
# Env: GK_RD_SCREEN=eDP-1 (optional), GK_RD_BITRATE=2500 (kbps)
set -e
BR="${GK_RD_BITRATE:-2500}"
NODE=""
for PATHCAND in /Screencasting /org/kde/KWin/Screencasting; do
    for SCREEN in ${GK_RD_SCREEN:-} eDP-1 eDP-2 DP-1 DP-2 HDMI-1 HDMI-A-1 Virtual-1 ""; do
        [ -n "$SCREEN" ] || continue
        OUT=$(busctl --user call org.kde.KWin "$PATHCAND" org.kde.KWin.Screencasting recordScreen s "$SCREEN" 2>/dev/null || true)
        NODE=$(printf '%s' "$OUT" | awk '{print $2}')
        [ -n "$NODE" ] && break 2
    done
done
if [ -z "$NODE" ]; then
    echo "rd-screencast-kwin: could not create a KWin screencast stream (tried screens: ${GK_RD_SCREEN:-eDP-1 eDP-2 DP-1 DP-2 HDMI-1 HDMI-A-1 Virtual-1}; set GK_RD_SCREEN)" >&2
    exit 1
fi
echo "rd-screencast-kwin: pipewire node $NODE" >&2
if gst-inspect-1.0 vaapih264enc >/dev/null 2>&1; then
    ENC="vaapih264enc tune=low-latency"
elif gst-inspect-1.0 x264enc >/dev/null 2>&1; then
    ENC="x264enc tune=zerolatency speed-preset=ultrafast key-int-max=30 bitrate=$BR"
else
    echo "rd-screencast-kwin: no h264 encoder (install gst-libav / x264 plugin)" >&2
    exit 1
fi
exec gst-launch-1.0 -q pipewiresrc path="$NODE" do-timestamp=true \
    ! videoconvert ! queue max-size-buffers=2 leaky=downstream \
    ! $ENC ! h264parse ! mp4mux fragment-duration=200 streamable=true \
    ! fdsink fd=1
