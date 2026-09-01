"""
AI 全局配置 —— 权重与难度参数集中管理，便于回放调参。

各权重含义见对应模块注释：
- ALPHA:             正派贝叶斯推断的软似然强度（站位线索权重）
- EVIL_WEIGHTS:      反派 AI 评分函数权重
- GOOD_HARD_WEIGHTS: 正派困难档方案评分权重
"""

# 正派贝叶斯推断
ALPHA = 2.0

# 反派 AI 评分权重
EVIL_WEIGHTS = {
    'kill_gain': 1.0,         # 击杀正派基础收益
    'lambda_purge': 0.5,      # 击杀"正派误判的高嫌疑角色"→ 帮正派排除，扣分系数
    'lambda_exposure': 1.5,   # 暴露度惩罚系数
    'tempo': 1.0,             # 节奏因子
    'utilization': 5.0,       # 行动利用率（惩罚浪费行动次数）
}

# 正派困难档方案评分权重
GOOD_HARD_WEIGHTS = {
    'lambda_spread': 0.05,   # 分散站位权重（防止反派"声东击西"）
    'lambda_kill': 1.0,      # 压制反派击杀收益的权重
}
