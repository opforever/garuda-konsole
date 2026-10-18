#!/bin/sh
# Zero-prompt KDE Wayland screencast → streamable fragmented MP4 on stdout.
# Self-introspecting: discovers the KWin Screencasting D-Bus path/method at
# runtime, auto-detects the connector name, and learns the PipeWire node id
# from the streamCreated signal (or the method reply, depending on Plasma
# version). Use as: export GK_RD_CAPTURE_CMD="sh <abs path>/rd-screencast-kwin.sh"
# Env: GK_RD_SCREEN (connector override), GK_RD_BITRATE (kbps, default 2500)
set -u
BR="${GK_RD_BITRATE:-2500}"
BUS=org.kde.KWin
IFACE=org.kde.KWin.Screencasting

PATHC=""
for P in /Screencasting /org/kde/KWin/Screencasting /Screencast /org/kde/KWin/Screencast; do
    if busctl --user introspect "$BUS" "$P" "$IFACE" >/dev/null 2>&1; then PATHC=$P; break; fi
done
if [ -z "$PATHC" ]; then
    echo "rd-screencast: KWin Screencasting interface not found on session bus." >&2
    echo "rd-screencast: introspect output for debugging:" >&2
    busctl --user introspect "$BUS" /Screencasting "$IFACE" 2>&1 | sed 's/^/rd-screencast: /' >&2
    exit 1
fi
INTROS=$(busctl --user introspect "$BUS" "$PATHC" "$IFACE" 2>/dev/null)

METHOD=""
for M in recordScreen requestStream recordOutput; do
    if printf '%s\n' "$INTROS" | awk -v m="$M" '$1 ~ ("^" m "$") || $1 == ("." m) { found = 1 } END { exit !found }'; then METHOD=$M; break; fi
done
if [ -z "$METHOD" ]; then
    echo "rd-screencast: no recordScreen-like method. introspect:" >&2
    printf '%s\n' "$INTROS" | sed 's/^/rd-screencast: /' >&2
    exit 1
fi
SIG=$(printf '%s\n' "$INTROS" | awk -v m="$METHOD" 'index($1, m) && $2 == "method" { print $3; exit }')

# connector name: env override → drm sysfs → educated guesses
SCREEN="${GK_RD_SCREEN:-}"
if [ -z "$SCREEN" ]; then
    SCREEN=$(ls /sys/class/drm 2>/dev/null | sed -n 's/^card[0-9]*-//p' | grep -Ev '^(Virtual|writeback|DSI)' | head -1)
fi
[ -n "$SCREEN" ] || SCREEN=eDP-1

MON=$(mktemp /tmp/rd-mon.XXXXXX)
busctl --user monitor "$BUS" >"$MON" 2>/dev/null &
MONPID=$!
trap 'kill $MONPID 2>/dev/null; rm -f "$MON"' EXIT

if [ "${SIG#s}" != "$SIG" ] || [ -z "$SIG" ]; then
    RET=$(busctl --user call "$BUS" "$PATHC" "$IFACE" "$METHOD" s "$SCREEN" 2>&1)
else
    RET=$(busctl --user call "$BUS" "$PATHC" "$IFACE" "$METHOD" u "$SCREEN" 2>&1)
fi
UUID=$(printf '%s' "$RET" | awk '{print $2}')
echo "rd-screencast: method=$METHOD screen=$SCREEN reply=$RET" >&2

NODE=""
i=0
while [ "$i" -lt 25 ]; do
    NODE=$(awk '/member=streamCreated/{u="";n="";f=1;next} f&&/^ *u +[0-9]+/{if(u==""){u=$2}else{n=$2;print u" "n;f=0}}' "$MON" 2>/dev/null | tail -1 | awk -v uid="$UUID" '{ if ($1 == uid) print $2; else print $2 }')
    [ -n "$NODE" ] && break
    sleep 0.1
    i=$((i+1))
done
[ -n "$NODE" ] || NODE=$UUID   # Plasma versions where the call returns the node id directly
kill $MONPID 2>/dev/null; rm -f "$MON"
echo "rd-screencast: pipewire node=$NODE" >&2

if gst-inspect-1.0 vaapih264enc >/dev/null 2>&1; then
    ENC="vaapih264enc tune=low-latency"
elif gst-inspect-1.0 x264enc >/dev/null 2>&1; then
    ENC="x264enc tune=zerolatency speed-preset=ultrafast key-int-max=30 bitrate=$BR"
else
    echo "rd-screencast: no h264 encoder installed (sudo pacman -S gst-libav)" >&2
    exit 1
fi
exec gst-launch-1.0 -q pipewiresrc path="$NODE" do-timestamp=true \
    ! videoconvert ! queue max-size-buffers=2 leaky=downstream \
    ! $ENC ! h264parse ! mp4mux fragment-duration=200 streamable=true \
    ! fdsink fd=1
