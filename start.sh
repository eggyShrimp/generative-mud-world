#!/usr/bin/env bash
set -euo pipefail

# 配置优先级: 环境变量 > world.config.yaml > 代码默认值
# 如需修改端口等设置，优先编辑 world.config.yaml；此处 env var 仅作覆盖
SERVER_PORT="${WORLD_SERVER_PORT:-3000}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export WORLD_LOG_FILE="$SCRIPT_DIR/world.log"
export WORLD_SERVER_PORT="$SERVER_PORT"
export WORLD_WS_URL="${WORLD_WS_URL:-ws://localhost:$SERVER_PORT}"

usage() {
  cat <<EOF
用法: ./start.sh [场景]

场景:
  all       启动服务端 + TUI 客户端 (默认)
  server    仅启动服务端
  client    仅启动 TUI 客户端
  dev       服务端 + 客户端热重载
  test      运行所有测试
  status    检查服务端状态
  logs      实时查看统一日志 (world.log)
EOF
}

check_server() {
  node -e '
const net = require("node:net");
const port = Number(process.argv[1]);
const socket = net.createConnection({ host: "localhost", port });
const exit = (code) => {
  socket.destroy();
  process.exit(code);
};
socket.setTimeout(500);
socket.on("connect", () => exit(0));
socket.on("timeout", () => exit(1));
socket.on("error", () => exit(1));
' "$SERVER_PORT" &>/dev/null
}

wait_server() {
  for i in $(seq 1 10); do
    check_server && return 0
    sleep 0.5
  done
  return 1
}

kill_processes() {
  local label="$1"
  shift
  local roots
  roots="$(
    for pattern in "$@"; do
      pgrep -f "$pattern" 2>/dev/null || true
    done | sort -un
  )"

  if [ -z "$roots" ]; then
    return 0
  fi

  local pids
  pids="$(
    for pid in $roots; do
      echo "$pid"
      pgrep -P "$pid" 2>/dev/null || true
    done | sort -un
  )"

  echo "🧹 清理旧${label}: $(echo "$pids" | tr '\n' ' ')"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 0.5

  local alive=""
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      alive="$alive $pid"
    fi
  done

  if [ -n "$alive" ]; then
    # shellcheck disable=SC2086
    kill -9 $alive 2>/dev/null || true
  fi
}

cleanup_server() {
  kill_processes "服务端进程" \
    "$SCRIPT_DIR/node_modules/.bin/tsx watch src/index.ts" \
    "$SCRIPT_DIR/node_modules/.bin/tsx src/index.ts" \
    "tsx/dist/loader.mjs src/index.ts"
}

cleanup_client() {
  kill_processes "客户端进程" \
    "bun .*src/tui/index.tsx" \
    "bun src/tui/index.tsx"
}

start_server() {
  local mode="${1:-prod}"
  if check_server; then
    # 端口已被占用 — 显示占用进程，询问是否杀掉
    local info
    info=$(lsof -i ":$SERVER_PORT" -sTCP:LISTEN -P 2>/dev/null | tail -n +2)
    if [ -n "$info" ]; then
      echo "⚠️  端口 $SERVER_PORT 已被占用:"
      echo "$info" | awk '{printf "    %-12s %s  %s\n", $1, $2, $9}'
      echo ""
      read -r -p "  是否杀掉占用进程并重启？[y/N] " answer
      if [[ "$answer" =~ ^[Yy]$ ]]; then
        local pids
        pids=$(lsof -i ":$SERVER_PORT" -sTCP:LISTEN -t 2>/dev/null)
        for pid in $pids; do
          kill "$pid" 2>/dev/null || true
        done
        sleep 0.5
        # 确认端口已释放
        for pid in $pids; do
          if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
          fi
        done
        sleep 0.3
        if check_server; then
          echo "❌ 端口 $SERVER_PORT 释放失败，启动取消"
          exit 1
        fi
        echo "✅ 已清理，继续启动..."
      else
        echo "❌ 端口 $SERVER_PORT 被占用，启动取消"
        exit 1
      fi
    fi
  fi
  echo "🚀 启动服务端 ($mode) → $WORLD_LOG_FILE"
  cd "$SCRIPT_DIR"
  if [ "$mode" = "dev" ]; then
    nohup npm run dev >> "$WORLD_LOG_FILE" 2>&1 &
  else
    nohup ./node_modules/.bin/tsx src/index.ts >> "$WORLD_LOG_FILE" 2>&1 &
  fi
  if wait_server && sleep 0.5 && check_server; then
    echo "✅ 服务端已启动"
  else
    echo "❌ 服务端启动失败"
    exit 1
  fi
}

start_client() {
  local mode="${1:-prod}"
  echo "🎮 启动 TUI 客户端 ($mode)..."
  cd "$SCRIPT_DIR"
  if [ "$mode" = "dev" ]; then
    npm run dev:tui
  else
    npm run dev:tui
  fi
}

run_tests() {
  echo "🧪 运行测试..."
  cd "$SCRIPT_DIR"
  npm run build
  npm test
}

show_status() {
  if check_server; then
    local info
    info=$(lsof -i ":$SERVER_PORT" -sTCP:LISTEN -P 2>/dev/null | tail -n +2 | head -1)
    if [ -n "$info" ]; then
      local cmd pid
      cmd=$(echo "$info" | awk '{print $1}')
      pid=$(echo "$info" | awk '{print $2}')
      echo "⬤ 服务端运行中 ($WORLD_WS_URL) — $cmd (PID $pid)"
    else
      echo "⬤ 服务端运行中 ($WORLD_WS_URL)"
    fi
  else
    echo "○ 服务端未运行"
  fi
}

SCENARIO="${1:-all}"

case "$SCENARIO" in
  all)
    cleanup_server
    start_server prod
    echo ""
    cleanup_client
    start_client prod
    ;;
  server)
    cleanup_server
    start_server prod
    ;;
  client)
    if ! check_server; then
      echo "⚠️  服务端未运行，先启动服务端..."
      cleanup_server
      start_server prod
      echo ""
    fi
    cleanup_client
    start_client prod
    ;;
  dev)
    export WORLD_LOG_LEVEL=dbg
    cleanup_server
    start_server dev
    echo ""
    cleanup_client
    start_client dev
    ;;
  test)
    run_tests
    ;;
  status)
    show_status
    ;;
  logs)
    echo "📋 $WORLD_LOG_FILE (Ctrl+C 退出)"
    tail -f "$WORLD_LOG_FILE"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "未知场景: $SCENARIO"
    echo ""
    usage
    exit 1
    ;;
esac
