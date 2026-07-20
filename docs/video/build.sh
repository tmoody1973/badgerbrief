#!/bin/bash
# BadgerBrief demo assembly — 1920x1080 / 30fps / H.264 + silent AAC (YouTube).
set -e
V="$(cd "$(dirname "$0")" && pwd)"
cd "$V"
mkdir -p out parts
ENC="-c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -r 30 -s 1920x1080"

card () { # card <png> <seconds> <outname>
  ffmpeg -y -loglevel error -loop 1 -i "cards/$1.png" -t "$2" $ENC "parts/$3.mp4"
}

# clip <segdir> <lowerthird|none> <outname> [max_seconds]
clip () {
  local src; src=$(ls "seg/$1"/*.webm 2>/dev/null | head -1)
  [ -z "$src" ] && { echo "skip $1 (no footage)"; return; }
  local dur; dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
  local lim=${4:-999}
  if [ "$2" = "none" ]; then
    ffmpeg -y -loglevel error -i "$src" -t "$lim" $ENC "parts/$3.mp4"
  else
    local fo; fo=$(python3 -c "print(round(min($dur,$lim)-1.2,2))")
    # -loop 1 is required: a bare PNG input is ONE frame, so the overlay would
    # flash for a single frame and the fades would never fire.
    ffmpeg -y -loglevel error -i "$src" -loop 1 -i "cards/$2.png" -t "$lim" -filter_complex \
      "[1]format=rgba,fade=in:st=0.5:d=0.4:alpha=1,fade=out:st=${fo}:d=0.5:alpha=1[l];[0][l]overlay=0:0:shortest=0" \
      $ENC "parts/$3.mp4"
  fi
}

# frames <name> <outname>  — CDP screencast frames (auth segments)
frames () {
  [ -f "frames/$1/concat.txt" ] || { echo "skip $1 (no frames)"; return; }
  ( cd "frames/$1" && ffmpeg -y -loglevel error -f concat -safe 0 -i concat.txt \
      -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
      $ENC "../../parts/$2.mp4" )
}

card 01-open 5 p1
clip 02-home        l-home p2 10
clip 03-race        l-race p3 15
clip 04-candidate   l-cand p4 15
frames 05-chat  p5
# Chat close-up: crop a 16:9 window over the LIVE end of the transcript. The
# thread is permanent (no "new conversation" in the product), so earlier
# identical takes sit above; this frames the current exchange instead of them.
if [ -f parts/p5.mp4 ]; then
  ffmpeg -y -loglevel error -i parts/p5.mp4 -t 22 \
    -vf "crop=1280:720:320:360,scale=1920:1080" $ENC parts/p5z.mp4
  mv parts/p5z.mp4 parts/p5.mp4
fi
frames 06-brief p6
clip 07-methodology l-meth p7 7
card 08-end 5 p8

: > parts/list.txt
for p in p1 p2 p3 p4 p5 p6 p7 p8; do
  [ -f "parts/$p.mp4" ] && echo "file '$p.mp4'" >> parts/list.txt
done

ffmpeg -y -loglevel error -f concat -safe 0 -i parts/list.txt -c copy out/_v.mp4
# silent stereo track — some platforms mishandle video-only uploads
ffmpeg -y -loglevel error -i out/_v.mp4 -f lavfi -i anullsrc=r=48000:cl=stereo \
  -shortest -c:v copy -c:a aac -b:a 128k out/badgerbrief-demo.mp4
rm -f out/_v.mp4
echo "BUILT: $V/out/badgerbrief-demo.mp4"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 out/badgerbrief-demo.mp4
