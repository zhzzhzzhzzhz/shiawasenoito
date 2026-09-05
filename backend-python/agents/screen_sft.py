"""
screen_sft.py —— SFT 候选样本质量筛查器（P2 数据准备）。

对 LLM 对局样本（含 CoT 推理链）做自动化质量分级：
    A 档：推理链充实（≥60 字）且正派侧行动命中 ≥2（evil 侧无命中口径，仅看推理充实度）
    B 档：推理链 ≥30 字 或 正派命中 =1
    C 档：推理链过薄（<30 字）或命中 =0 的"反面教材"（保留但标记）

产出：data/sft_candidates.json —— 分档样本 ID 清单 + 统计摘要，供 SFT 数据构建消费。

用法：python -m agents.screen_sft
"""
import json
import glob
import sys

sys.path.insert(0, '.')


def _hit_count(sample):
    """正派侧样本：选择命中真实反派的个数；非正派返回 None。"""
    dp = sample['decision_point']
    if dp['side'] != 'good':
        return None
    villains = set(sample['game_meta']['villains'])
    targets = sample['ai_label'].get('chosen_action', {}).get('targets', [])
    return len(villains & set(targets))


def main():
    buckets = {'A': [], 'B': [], 'C': []}
    stats = {'total_cot': 0, 'good': 0, 'evil': 0, 'thin': 0}
    for f in glob.glob('data/decision_points/agent-batch*/*.json'):
        for s in json.load(open(f, encoding='utf-8')):
            reasoning = (s.get('ai_label') or {}).get('reasoning')
            if not reasoning:
                continue  # 无 CoT（回退样本）不参与
            stats['total_cot'] += 1
            side = s['decision_point']['side']
            stats[side] += 1
            rlen = len(reasoning)
            if rlen < 30:
                stats['thin'] += 1
                buckets['C'].append(s['sample_id'])
                continue
            hits = _hit_count(s)
            if side == 'good':
                if rlen >= 60 and (hits is None or hits >= 2):
                    buckets['A'].append(s['sample_id'])
                elif hits is None or hits >= 1:
                    buckets['B'].append(s['sample_id'])
                else:
                    buckets['C'].append(s['sample_id'])  # 命中0的反面教材
            else:
                # evil 侧：无命中口径，按推理充实度分档
                if rlen >= 60:
                    buckets['A'].append(s['sample_id'])
                else:
                    buckets['B'].append(s['sample_id'])

    print(f"CoT 总量: {stats['total_cot']}（good {stats['good']} / evil {stats['evil']}）")
    print(f"过薄(<30字): {stats['thin']}")
    for grade, ids in buckets.items():
        print(f"{grade} 档: {len(ids)} 条")
    out = {'stats': stats, 'buckets': buckets}
    with open('data/sft_candidates.json', 'w', encoding='utf-8') as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)
    print('已写入 data/sft_candidates.json')


if __name__ == '__main__':
    main()
