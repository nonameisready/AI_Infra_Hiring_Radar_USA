# Mac 本地自动投递 — 一次性安装指南（中文）

装好之后的效果：**每天凌晨 00:55 Mac 自动唤醒 → 1:00 自动跑本地批次**（家庭 IP + 本地 Qwen 答题 + 自动从 Gmail 取验证码），结果推送到 `ashby-local-results` 分支；**早上 5 点云端 Opus 窗口**负责合并、审核、把 Mac 没搞定的（needs_answers / Ashby / Workday / 政策敏感题）补完并记账。你什么都不用手动点。

## 第 1 步：拉最新代码并跑安装脚本

```zsh
cd ~/AI_Infra_Hiring_Radar_USA
git pull origin main
zsh agent/launchd/install-mac.sh
```

脚本会逐项检查并告诉你缺什么（✔ 已好 / ✘ 缺失）。缺的按下面补齐后**重跑脚本**即可，可反复运行。

## 第 2 步：密钥文件（1 分钟）

```zsh
mkdir -p ~/.jobright-agent && chmod 700 ~/.jobright-agent
cat > ~/.jobright-agent/env <<'EOF'
export JOBRIGHT_PASSWORD='你的Jobright密码'
export RESUME_PDF="$HOME/Downloads/Hui_Mao_Backend_Software_Engineer.pdf"
EOF
chmod 600 ~/.jobright-agent/env
```

密钥只存在 `~/.jobright-agent/`，永远不进仓库。

## 第 3 步：Gmail 只读授权（5 分钟，只做一次）

这是让本地脚本能**自动读取 Greenhouse 验证码**的关键。全程不需要也不允许把 Google 密码给任何脚本 —— 你只是在自己的浏览器里点一次"允许（只读）"。

1. 打开 https://console.cloud.google.com/ （用你的 Gmail 登录）
2. 顶部项目下拉 → 新建项目（名字随意，如 `jobright-local`）→ 创建
3. 左侧菜单 **API 和服务 → 库** → 搜 `Gmail API` → 启用
4. **API 和服务 → OAuth 同意屏幕**：User Type 选 External → 填 App 名称和你的邮箱 → 一路保存；在"测试用户 (Test users)"里**把你自己的 Gmail 加进去**（重要！）
5. **API 和服务 → 凭据 → 创建凭据 → OAuth 客户端 ID** → 应用类型选 **桌面应用 (Desktop app)** → 创建 → 复制 client_id 和 client_secret
6. 回到终端：

```zsh
cat > ~/.jobright-agent/gmail-oauth.json <<'EOF'
{"client_id":"粘贴你的ID.apps.googleusercontent.com","client_secret":"粘贴你的GOCSPX-..."}
EOF
chmod 600 ~/.jobright-agent/gmail-oauth.json
cd ~/AI_Infra_Hiring_Radar_USA
node agent/gmail-auth.mjs     # 会打开浏览器 → 选你的账号 → 点允许
node agent/gmail-code.mjs     # 自测：能打印最近一条验证码（或提示没有新码）就是通了
```

## 第 4 步：Qwen 常驻

编辑 `~/.jobright-agent/qwen-start.sh`（安装脚本已生成模板），按你实际的运行方式改一行：Ollama 用户写 `exec ollama serve`；llama.cpp 用户写 `exec llama-server -m 模型路径 --port 8080`；LM Studio 已自启的可留 `exec sleep infinity`。launchd 会保证它常驻（挂了自动重启）。若端口不是 8080，在 `~/.jobright-agent/env` 加 `export QWEN_BASE_URL=http://127.0.0.1:端口`。

## 第 5 步：定时唤醒（很多人漏掉的一步！）

launchd 的定时任务**不会唤醒睡着的 Mac** —— 合盖/睡眠状态下凌晨 1 点的批次会被直接跳过（这就是"忘记手动启动就没跑"的根源）。设置每天 00:55 自动唤醒：

```zsh
sudo pmset repeat wakeorpoweron MTWRFSU 00:55:00
pmset -g sched   # 确认输出里有 wake at 12:55AM
```

笔记本请保持接通电源；若是台式 Mac mini 无需额外设置。

## 日常观察

- 昨晚跑没跑：`tail -50 /tmp/local-batch.log`，或看仓库 `ashby-local-results` 分支有没有当天的提交
- Qwen 服务日志：`tail -f /tmp/qwen-server.log`
- 手动补跑一次：`source ~/.jobright-agent/env && cd ~/AI_Infra_Hiring_Radar_USA && node agent/local-batch.mjs`
- 试运行（不真提交）：加 `--dry --cap 2`

## 分工（装好后的完整流水线）

| 时间 (ET) | 谁 | 干什么 |
|---|---|---|
| 00:55 | pmset | 唤醒 Mac |
| 01:00 | Mac + Qwen | Greenhouse 主力批次（家庭 IP、自动取码），结果推 `ashby-local-results`；答不了的题记入 brain-queue/pending |
| 05:00 | 云端 Opus 5（新会话） | 合并 Mac 结果 + 审核 Qwen 规则 → **补完 Mac 剩下的**（needs_answers 抢救、Ashby 驱动、Workday/Oracle/Amazon、政策敏感题把关）→ 记账、APPLIED.md、中文日结推送。只有 Mac 整晚没跑时才做全量兜底 |
| 10:30 | Mac + Qwen | brain-rules 规则学习，推送规则更新 |

Qwen 不会被交给任何政策敏感判断（国防/仲裁/宣誓/个人事实）——那些永远留给云端或你本人，这是写死在 RUNBOOK 里的规矩。
