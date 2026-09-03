"""
训练数据记录器 — 双人对局结束时把「完整对局 + 状态→动作决策」写入 dataset/ 目录

用于采集真人双人对局数据，供训练单人模式智能体（good_ai / evil_ai）使用。
通过环境变量 RECORD_MATCH 控制是否落盘（默认关闭）。
"""
import json
import time
from pathlib import Path

# dataset 目录位于 backend-python/dataset/
DATASET_DIR = Path(__file__).resolve().parent.parent / 'dataset'


def save(session) -> str:
    """将对局训练记录写入 dataset/，返回文件路径；已记录过则跳过（返回 ''）。"""
    if getattr(session, 'recorded', False):
        return ''
    session.recorded = True

    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    record = session.get_training_record()
    filename = f"{session.mode}_{session.room_id}_{int(time.time())}.json"
    path = DATASET_DIR / filename
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(record, f, ensure_ascii=False, indent=2)
    return str(path)
