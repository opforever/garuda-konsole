#!/bin/sh
# Screen capture via the STANDARD xdg-desktop-portal ScreenCast interface,
# with a PERSISTED restore token: you approve ONCE in KDE's dialog, every
# later session restores silently ("1 time approval, never again").
# Emits streamable fragmented MP4 on stdout. Use via GK_RD_CAPTURE_CMD or as
# the server's automatic fallback when the KWin path is unavailable.
# Env: GK_RD_BITRATE (kbps, default 2500)
set -u
BR="${GK_RD_BITRATE:-2500}"
DEST=org.freedesktop.portal.Desktop
OBJ=/org/freedesktop/portal/desktop
SC=org.freedesktop.portal.ScreenCast
CONFDIR="${XDG_CONFIG_HOME:-$HOME/.config}/garuda-konsole"
mkdir -p "$CONFDIR"
TOKFILE="$CONFDIR/rd-restore-token"
RT=""
[ -f "$TOKFILE" ] && RT=$(cat "$TOKFILE")

command -v gdbus >/dev/null 2>&1 || { echo "rd-portal: gdbus missing (glib2)" >&2; exit 1; }

MON=$(mktemp /tmp/rd-portal-mon.XXXXXX)
gdbus monitor --session --dest "$DEST" >"$MON" 2>&1 &
MONPID=$!
trap 'kill $MONPID 2>/dev/null; rm -f "$MON"' EXIT
sleep 0.4

uniq_tok() { printf 'rd%s%s' "$$" "$(date +%s%N | tail -c 7)"; }

wait_response() { # $1 = request path suffix marker; prints matching Response lines
    i=0
    while [ "$i" -lt 120 ]; do
        OUT=$(grep "Response" "$MON" 2>/dev/null | grep "$1" | tail -1)
        [ -n "$OUT" ] && { printf '%s' "$OUT"; return 0; }
        sleep 0.25; i=$((i+1))
    done
    return 1
}

# 1) CreateSession
HT1=$(uniq_tok); ST1=$(uniq_tok)
R1=$(gdbus call --session --dest "$DEST" --object-path "$OBJ" --method "$SC.CreateSession" \
    "{'handle_token': <'$HT1'>, 'session_handle_token': <'$ST1'>}" 2>&1) || { echo "rd-portal: CreateSession failed: $R1" >&2; exit 1; }
RESP1=$(wait_response "$HT1") || { echo "rd-portal: no CreateSession response; monitor tail:" >&2; tail -20 "$MON" >&2; exit 1; }
SESSH=$(printf '%s' "$RESP1" | grep -oE "/org/freedesktop/portal/desktop/session/[^'\" )]*" | head -1)
[ -n "$SESSH" ] || { echo "rd-portal: no session handle in: $RESP1" >&2; exit 1; }

# 2) SelectSources (with restore token when we have one; persist_mode=2)
HT2=$(uniq_tok)
if [ -n "$RT" ]; then
    ARGS="{'handle_token': <'$HT2'>, 'restore_token': <'$RT'>, 'persist_mode': <uint32 2>, 'multiple': <false>, 'types': <uint32 1>}"
else
    ARGS="{'handle_token': <'$HT2'>, 'persist_mode': <uint32 2>, 'multiple': <false>, 'types': <uint32 1>}"
fi
R2=$(gdbus call --session --dest "$DEST" --object-path "$OBJ" --method "$SC.SelectSources" \
    objectpath "$SESSH" "$ARGS" 2>&1) || { echo "rd-portal: SelectSources failed: $R2" >&2; exit 1; }
RESP2=$(wait_response "$HT2") || { echo "rd-portal: no SelectSources response (dialog dismissed?); monitor tail:" >&2; tail -20 "$MON" >&2; exit 1; }
NEWTOK=$(printf '%s' "$RESP2" | grep -oE "'restore_token': <'[^']*'" | sed "s/.*<'//; s/'$//")
if [ -n "$NEWTOK" ]; then printf '%s' "$NEWTOK" > "$TOKFILE"; chmod 600 "$TOKFILE"; fi

# 3) Start
HT3=$(uniq_tok)
R3=$(gdbus call --session --dest "$DEST" --object-path "$OBJ" --method "$SC.Start" \
    objectpath "$SESSH" '' "{}" 2>&1) || { echo "rd-portal: Start failed: $R3" >&2; exit 1; }
RESP3=$(wait_response "$HT3") || { echo "rd-portal: no Start response; monitor tail:" >&2; tail -20 "$MON" >&2; exit 1; }
NEWTOK3=$(printf '%s' "$RESP3" | grep -oE "'restore_token': <'[^']*'" | sed "s/.*<'//; s/'$//")
[ -n "$NEWTOK3" ] && { printf '%s' "$NEWTOK3" > "$TOKFILE"; chmod 600 "$TOKFILE"; }
NODE=$(printf '%s' "$RESP3" | grep -oE "'streams': <[^>]*uint32 [0-9]+" | grep -oE '[0-9]+$' | head -1)
[ -n "$NODE" ] || NODE=$(printf '%s' "$RESP3" | grep -oE "uint32 [0-9]+" | tail -1 | awk '{print $2}')
[ -n "$NODE" ] || { echo "rd-portal: no PipeWire node in Start response: $RESP3" >&2; exit 1; }
echo "rd-portal: session=$SESSH node=$NODE (restore token saved)" >&2

# 4) Encode → fragmented MP4 on stdout
if gst-inspect-1.0 vaapih264enc >/dev/null 2>&1; then
    ENC="vaapih264enc tune=low-latency"
elif gst-inspect-1.0 x264enc >/dev/null 2>&1; then
    ENC="x264enc tune=zerolatency speed-preset=ultrafast key-int-max=30 bitrate=$BR"
else
    echo "rd-portal: no h264 encoder (sudo pacman -S gst-libav)" >&2; exit 1
fi
exec gst-launch-1.0 -q pipewiresrc path="$NODE" do-timestamp=true \
    ! videoconvert ! queue max-size-buffers=2 leaky=downstream \
    ! $ENC ! h264parse ! mp4mux fragment-duration=200 streamable=true \
    ! fdsink fd=1
