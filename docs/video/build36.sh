#!/bin/bash
# BadgerBrief 36s explainer — 6 blocks x 6s, narrated, captions burned.
set -e
V="$(cd "$(dirname "$0")" && pwd)"; cd "$V"
VOICE="${VOICE:-sarah}"
VODIR="${VODIR:-vo11}"
mkdir -p out36 parts36 cap36
ENC="-c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -r 30 -s 1920x1080"
BLOCK=6

# Captions rendered as PNG (real type, no ffmpeg font guessing).
node - <<'NODE'
const { chromium } = require('playwright');
const DIR = process.cwd();
const caps = [
 ['c1','18 candidates for governor'],
 ['c2','Every claim links to its source'],
 ['c3','Agents read. They do not decide.'],
 ['c4','Verbatim excerpt + a link, every time'],
 ['c5','Nothing publishes without a person'],
 ['c6','Know your ballot before you fill it in'],
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const CSS = `@import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@700&display=swap');
   *{margin:0;padding:0;box-sizing:border-box}
   body{width:1920px;height:1080px;background:transparent;font-family:'Public Sans',sans-serif}
   .l{position:absolute;left:96px;bottom:88px;border:5px solid #1c1b1a;background:#f6e7b2;
      padding:22px 34px;box-shadow:12px 12px 0 #1c1b1a;font-size:46px;font-weight:700;max-width:1500px}`;
  for (const [id, text] of caps) {
    await p.setContent(`<style>${CSS}</style><body><div class="l">${text}</div></body>`);
    await p.waitForTimeout(650);
    await p.screenshot({ path: `${DIR}/cap36/${id}.png`, omitBackground: true });
  }
  await b.close();
})();
NODE

# block <segdir> <caption> <out> [start_offset]
# Offset matters: the push-in lands at the END of a capture, so trimming from
# 0 threw away the close-up entirely on the first build.
block () {
  local src; src=$(ls "seg36/$1"/*.webm | head -1)
  local ss=${4:-0}
  local fo; fo=$(python3 -c "print($BLOCK-1.0)")
  ffmpeg -y -loglevel error -ss "$ss" -i "$src" -loop 1 -i "cap36/$2.png" -t $BLOCK -filter_complex \
    "[1]format=rgba,fade=in:st=0.35:d=0.35:alpha=1,fade=out:st=${fo}:d=0.5:alpha=1[l];[0][l]overlay=0:0" \
    $ENC "parts36/$3.mp4"
}

block b1-race    c1 v1 3.0
block b2-source  c2 v2 4.2
block b3-agents  c3 v3
block b4-macro   c4 v4 3.3
block b5-gate    c5 v5
block b6-close   c6 v6 0.6

: > parts36/list.txt
for i in 1 2 3 4 5 6; do echo "file 'v$i.mp4'" >> parts36/list.txt; done
ffmpeg -y -loglevel error -f concat -safe 0 -i parts36/list.txt -c copy out36/video.mp4

# Narration: each take starts 0.35s into its 6s block, padded to the grid.
: > parts36/alist.txt
for i in 1 2 3 4 5 6; do
  # Adaptive lead-in: keep the take fully inside its 6s window instead of a
  # fixed 350ms delay that clipped the longest block by 0.02s.
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${VODIR}/${VOICE}_$i.m4a")
  DLY=$(python3 -c "print(int(max(0,min(350,(${BLOCK}-${DUR})*1000-120))))")
  ffmpeg -y -loglevel error -i "${VODIR}/${VOICE}_$i.m4a" \
    -af "adelay=${DLY}|${DLY},apad=whole_dur=${BLOCK}" -t $BLOCK -c:a aac -b:a 192k "parts36/a$i.m4a"
  echo "file 'a$i.m4a'" >> parts36/alist.txt
done
ffmpeg -y -loglevel error -f concat -safe 0 -i parts36/alist.txt -c copy out36/audio.m4a

# say(1) emits 22kHz mono; normalise and upsample for platform delivery.
ffmpeg -y -loglevel error -i out36/video.mp4 -i out36/audio.m4a -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,pan=stereo|c0=c0|c1=c0" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest "out36/badgerbrief-36s-${VOICE}.mp4"
echo "BUILT: $V/out36/badgerbrief-36s-${VOICE}.mp4"
ffprobe -v error -show_entries format=duration -of csv=p=0 "out36/badgerbrief-36s-${VOICE}.mp4"
for i in 1 2 3 4 5 6; do printf 'blk %s lead-in %sms\n' $i "$(ffprobe -v error -show_entries format=duration -of csv=p=0 ${VODIR}/${VOICE}_$i.m4a)"; done
