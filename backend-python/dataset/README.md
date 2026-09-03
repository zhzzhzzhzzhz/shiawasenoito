# 训练数据集目录

双人模式对局结束后，训练记录会写入本目录（文件名：`{mode}_{roomId}_{timestamp}.json`）。

## 启用/停用

- 记录落盘由环境变量 `RECORD_MATCH` 控制（`.env` 中设为 `on` 开启，`off` 关闭）。
- 双人回合 300s 倒计时由 `TURN_TIMER` 控制（`off` 关闭，便于采集期人为慢慢决策）。

## 单局记录结构

```json
{
  "roomId": "...",
  "mode": "match",
  "villains": [301, 402, 503],
  "winner": "good",
  "totalRounds": 5,
  "goodPlayerId": 1,
  "evilPlayerId": 2,
  "steps": [
    { "type": "good_watch", "round": 2,
      "state": { "board": [...], "history": [...] },
      "action": { "targets": [401, 402, 403] } },
    { "type": "evil_action", "round": 1,
      "state": { "board": [...], "handCards": [...], "history": [...] },
      "action": { "cardIndex": 0, "actions": [{ "villainId": 301, "targetId": 405, "shape": "九宫格" }] } }
  ]
}
```

- `good_watch`：正派监视决策（状态 → 监视目标）
- `evil_action`：反派行动决策（状态 → 行动卡 + 死亡标记）

`state.board` 为决策前的完整棋盘快照（含真实 `role`，供训练时信息完备使用）。

> 建议：本目录内容不入库，提交前确认 `.gitignore` 已忽略 `dataset/*.json`。
