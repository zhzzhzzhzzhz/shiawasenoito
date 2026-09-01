# 插画放置指南

所有卡片图片从 `frontend/public/placeholder-illust/` 目录加载。
制作好插画后，将图片文件放到对应子目录，刷新页面即可生效（无需改代码）。

## 目录结构

```
frontend/public/placeholder-illust/
├── character/          人物角色插画（25 个角色，编号 201~605）
│   ├── 201.png
│   ├── 202.png
│   └── ... (共 25 张)
├── action/             行动卡插画（5 张，按索引 0~4）
│   ├── 0.png
│   ├── 1.png
│   └── ... (共 5 张)
├── marker/             标记插画
│   ├── jiugongge.png    死亡标记·九宫格
│   ├── shizi.png        死亡标记·十字
│   └── surveillance.png 监视标记
└── dead.png            死亡角色插画
```

## 说明

- 图片缺失时，卡片会自动回退显示原有符号占位（👹/🛡️/✚/▣ 等），游戏不受影响
- 建议使用 PNG 格式（支持透明背景）
- 人物卡为**方形裁切**（rounded-lg + object-cover），人物充满整个框，建议用方形且主体居中的插画
- 行动卡显示为圆角方形裁切（object-cover），建议方形图
- 标记图建议小尺寸（32×32 左右），object-contain 原样显示
