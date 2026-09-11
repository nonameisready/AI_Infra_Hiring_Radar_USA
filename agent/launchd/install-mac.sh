#!/bin/zsh
# One-shot Mac installer for the nightly local Qwen batch.
# Usage:  cd ~/AI_Infra_Hiring_Radar_USA && zsh agent/launchd/install-mac.sh
# Safe to re-run any time — it only fixes what's missing and reports status.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
CFG="$HOME/.jobright-agent"
LA="$HOME/Library/LaunchAgents"
ok()   { print -P "%F{green}✔%f $1"; }
bad()  { print -P "%F{red}✘%f $1"; MISSING=1; }
info() { print -P "%F{blue}ℹ%f $1"; }
MISSING=0

echo "== 1/6 基础检查 =="
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then bad "找不到 node — 先安装: brew install node"; exit 2; fi
ok "node: $NODE_BIN ($(node -v))"
mkdir -p "$CFG" && chmod 700 "$CFG"
mkdir -p "$LA"

echo "\n== 2/6 密钥文件 (~/.jobright-agent/env) =="
if [[ -f "$CFG/env" ]] && grep -q JOBRIGHT_PASSWORD "$CFG/env" && grep -q RESUME_PDF "$CFG/env"; then
  ok "env 已存在"
  source "$CFG/env"
  [[ -f "${RESUME_PDF:-}" ]] && ok "简历: $RESUME_PDF" || bad "RESUME_PDF 指向的文件不存在: ${RESUME_PDF:-未设置}"
else
  bad "缺 $CFG/env — 请创建 (chmod 600)，内容:"
  echo "    export JOBRIGHT_PASSWORD='你的Jobright密码'"
  echo "    export RESUME_PDF=\"\$HOME/路径/简历.pdf\""
  echo "    # 可选: export QWEN_BASE_URL=http://127.0.0.1:8080"
fi

echo "\n== 3/6 Gmail 只读授权（取验证码用，绝不碰你的 Google 密码） =="
if [[ -f "$CFG/gmail-token.json" ]]; then
  if node "$REPO/agent/gmail-code.mjs" >/dev/null 2>&1; then ok "Gmail 授权有效（自测通过）"
  else info "token 存在但自测失败 — 重新跑: node agent/gmail-auth.mjs"; MISSING=1; fi
elif [[ -f "$CFG/gmail-oauth.json" ]]; then
  info "已有 OAuth 客户端，现在打开浏览器授权一次…"
  node "$REPO/agent/gmail-auth.mjs" && ok "Gmail 授权完成" || bad "授权失败，稍后重跑: node agent/gmail-auth.mjs"
else
  bad "缺 $CFG/gmail-oauth.json — 见 agent/MAC-SETUP.md 第 3 步（5 分钟，只需做一次）"
fi

echo "\n== 4/6 Qwen 常驻服务 =="
if [[ ! -f "$CFG/qwen-start.sh" ]]; then
  cat > "$CFG/qwen-start.sh" <<'EOF'
#!/bin/zsh
# 按你的 Qwen 运行方式三选一，删掉其它行：
# 1) Ollama:    exec /usr/local/bin/ollama serve
# 2) llama.cpp: exec /path/to/llama-server -m /path/to/qwen.gguf --port 8080
# 3) LM Studio: LM Studio 自带开机自启，本脚本留空即可: exec sleep infinity
exec sleep infinity
EOF
  chmod 700 "$CFG/qwen-start.sh"
  info "已生成模板 $CFG/qwen-start.sh — 打开它按注释改成你的启动命令"
  MISSING=1
else
  ok "qwen-start.sh 已存在"
fi
QURL="${QWEN_BASE_URL:-http://127.0.0.1:8080}"
if curl -s -m 3 "$QURL/v1/models" >/dev/null 2>&1 || curl -s -m 3 "$QURL/api/tags" >/dev/null 2>&1; then
  ok "Qwen 服务在线: $QURL"
else
  info "Qwen 服务当前不在线（$QURL）— 装好 launchd 后会自动拉起"
fi

echo "\n== 5/6 安装 launchd 定时任务 =="
for p in com.huimao.qwen-server com.huimao.local-batch com.huimao.brain-rules; do
  sed "s#/usr/local/bin/node#$NODE_BIN#g" "$REPO/agent/launchd/$p.plist" > "$LA/$p.plist"
  launchctl unload "$LA/$p.plist" 2>/dev/null
  launchctl load "$LA/$p.plist" && ok "已装载 $p" || bad "装载失败 $p"
done

echo "\n== 6/6 定时唤醒（关键！睡眠中的 Mac 不会自己醒来跑任务） =="
if pmset -g sched | grep -q "wake at 12:55AM"; then
  ok "已设置每天 00:55 唤醒"
else
  info "需要你输一次管理员密码，设置每天 00:55 自动唤醒："
  echo "    sudo pmset repeat wakeorpoweron MTWRFSU 00:55:00"
  MISSING=1
fi

echo "\n================= 结果 ================="
if [[ $MISSING -eq 0 ]]; then
  ok "全部就绪。今晚 1:00 会自动跑；日志: tail -f /tmp/local-batch.log"
  info "现在手动试跑一单（不真提交）: source $CFG/env && node agent/local-batch.mjs --dry --cap 2"
else
  info "还有上面标 ✘/ℹ 的项目没完成 — 处理后重跑本脚本即可。"
fi
