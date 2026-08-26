#!/bin/bash
# Double-click this file to start a local server and open the site.
# If something goes wrong, this window stays open so you can read why.

cd "$(dirname "$0")"

find_python() {
  if command -v python3 >/dev/null 2>&1; then echo python3;
  elif command -v python >/dev/null 2>&1; then echo python;
  else echo ""; fi
}

PY=$(find_python)

if [ -z "$PY" ]; then
  echo "========================================================="
  echo " Couldn't find Python on this Mac, so I can't start the"
  echo " local server automatically."
  echo ""
  echo " Easiest fix: install the free 'Live Server' extension in"
  echo " VS Code, then right-click index.html and choose"
  echo " 'Open with Live Server'."
  echo "========================================================="
  read -p "Press Enter to close this window..."
  exit 1
fi

# find a free port, starting at 8000
PORT=8000
for i in 1 2 3 4 5 6 7 8 9 10; do
  if ! lsof -i ":$PORT" >/dev/null 2>&1; then
    break
  fi
  PORT=$((PORT + 1))
done

echo "Starting local server with $PY at http://localhost:$PORT ..."
"$PY" -m http.server "$PORT" &
SERVER_PID=$!

# give it a moment, then confirm it's actually up before opening the browser
READY=0
for i in $(seq 1 25); do
  if curl -s -o /dev/null "http://localhost:$PORT"; then
    READY=1
    break
  fi
  sleep 0.3
done

if [ "$READY" -eq 1 ]; then
  open "http://localhost:$PORT"
  echo ""
  echo "The site should now be open in your browser."
  echo "Leave this window open while you use the site — closing it"
  echo "(or pressing Ctrl+C) stops the server."
else
  echo "========================================================="
  echo " The server didn't start in time. Something on this Mac"
  echo " may be blocking it (firewall, antivirus, etc.)."
  echo ""
  echo " Try instead: install the 'Live Server' extension in VS"
  echo " Code, right-click index.html, and choose"
  echo " 'Open with Live Server'."
  echo "========================================================="
  kill "$SERVER_PID" 2>/dev/null
  read -p "Press Enter to close this window..."
  exit 1
fi

wait "$SERVER_PID"
