#!/usr/bin/env bash
export DISPLAY="${DISPLAY:-:0}"

pkill -x obs 2>/dev/null || true
sleep 1

# เปิดหน้าต่างฉากลอยกระทงแนวตั้งแยกต่างหาก
chromium --user-data-dir=/tmp/loykrathong-chrome --app=http://localhost:3000/ --window-size=540,960 --no-first-run >/dev/null 2>&1 &

# รอจนกว่าหน้าต่างจะขึ้น แล้วดึง Window ID ให้ OBS จับภาพอัตโนมัติ
WID_HEX=""
for _ in $(seq 1 20); do
  WID_HEX=$(xwininfo -root -tree 2>/dev/null | awk '/ลอยกระทงออนไลน์/ && /Chromium/ {print $1; exit}')
  [ -n "$WID_HEX" ] && break
  sleep 0.5
done

if [ -n "$WID_HEX" ]; then
  WID_DEC=$((WID_HEX))
  cat <<EOF > ~/.config/obs-studio/basic/scenes/LoyKrathong.json
{
  "current_scene": "LoyKrathong",
  "current_program_scene": "LoyKrathong",
  "scene_order": [{"name": "LoyKrathong"}],
  "name": "LoyKrathong",
  "sources": [
    {
      "name": "LoyKrathong",
      "id": "scene",
      "versioned_id": "scene",
      "settings": {
        "id_counter": 1,
        "items": [
          {
            "name": "LoyKrathongWindow",
            "id": 1,
            "visible": true,
            "pos": {"x": 0.0, "y": 0.0},
            "scale": {"x": 1.0, "y": 1.0},
            "rot": 0.0,
            "bounds_type": 2,
            "bounds_align": 0,
            "bounds": {"x": 720.0, "y": 1280.0}
          }
        ]
      }
    },
    {
      "name": "LoyKrathongWindow",
      "id": "xcomposite_input",
      "versioned_id": "xcomposite_input",
      "settings": {
        "capture_window": "${WID_DEC}\r\nลอยกระทงออนไลน์\r\nChromium",
        "show_cursor": false
      }
    }
  ]
}
EOF
fi

obs >/dev/null 2>&1 &
