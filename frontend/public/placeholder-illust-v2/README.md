# 插画放置指南

所有卡片图片从 `frontend/public/placeholder-illust/` 目录加载。
制作好插画后，将图片文件放到对应子目录，刷新页面即可生效（无需改代码）。

## 目录结构

```
frontend/public/placeholder-illust/
├── character/                人物角色插画（25 个角色，编号 201~605）
│   ├── 201.png               原版插画
│   ├── 201_dead.png          死亡状态插画（被死亡标记后切换显示）
│   └── ... (原版 25 张 + 死亡版 25 张)
├── action/                   行动卡插画（5 张，按索引 0~4）
│   ├── 0.png
│   └── ... (共 5 张)
└── marker/                   标记插画
    ├── golden_mark_r2.png    监视标记·第 2 回合（正派拖拽按钮用）
    ├── golden_mark_r3.png    监视标记·第 3 回合
    ├── golden_mark_r4.png    监视标记·第 4 回合
    ├── golden_mark_r5.png    监视标记·第 5 回合
    ├── golden_mark_r6.png    监视标记·第 6 回合
    ├── r1_jiugongge.png      死亡标记·九宫格·第 1 回合（反派拖拽按钮用）
    ├── r1_shizi.png          死亡标记·十字·第 1 回合
    ├── ...                   r2~r5 同理
    └── r5_shizi.png          死亡标记·十字·第 5 回合
```

## 命名规则（务必与代码一致）

| 用途 | 路径 | 说明 |
|---|---|---|
| 角色原插画 | `character/{id}.png` | id 为角色编号 201~605 |
| 角色死亡插画 | `character/{id}_dead.png` | 角色被死亡标记后切换为此图 |
| 行动卡 | `action/{0~4}.png` | 对应 5 张行动卡 |
| 死亡标记·带回合 | `marker/r{N}_jiugongge.png` / `marker/r{N}_shizi.png` | N = 1~5，反派拖拽按钮展示用 |
| 监视标记·带回合 | `marker/golden_mark_r{N}.png` | N = 2~6，正派拖拽按钮展示用 |

## 第二版插画（可选）

第二版插画放在 `frontend/public/placeholder-illust-v2/` 目录，命名规则同上（在账号设置里切换插画版本后生效）。

## 当前资源现状（截至 2026-08-19）

| 资源 | 状态 |
|---|---|
| `action/0~4.png`（行动卡 5 张） | ✅ 已有 |
| `character/201~605.png`（角色原插画 25 张） | ✅ 已有 |
| `marker/r1~r5_{形状}.png`（带回合号死亡标记 10 张） | ✅ 已有 |
| `marker/golden_mark_r2~r6.png`（带回合号监视标记 5 张） | ✅ 已有 |
| `character/{id}_dead.png`（角色死亡插画 25 张） | ❌ 待补充 |

## 说明

- 图片缺失时，卡片会自动回退显示符号占位（👹/🛡️/✚/▣ 等），游戏不受影响
- 建议使用 PNG 格式（支持透明背景）
- 人物卡为**整卡铺满裁切**（object-cover，比例 3:4），建议竖版、主体居中的插画
- 行动卡为**整卡铺满裁切**（object-cover，比例 7:10，即 70×100），建议竖版、主体居中的插画
- 标记图建议小尺寸（32×32 左右），object-contain 原样显示
- **临时兜底**：死亡插画还没画好时，可先把原角色图复制一份改名成 `{id}_dead.png` 顶用，正式插画做好后再替换同名文件即可
