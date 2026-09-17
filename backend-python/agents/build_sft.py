"""
build_sft.py —— SFT/DPO 数据集构建器（P2 数据准备，接 LLaMA-Factory 可直接训练）。

从 screen_sft 的分档结果构建训练数据：
    build       → A/B 档转 ShareGPT(messages) 格式 → data/sft/good_train.jsonl /
                  evil_train.jsonl；C 档 → data/sft/dpo_rejected.jsonl（DPO 负例）
    spotcheck   → 渲染 Top-N 条 A 档样本 → data/sft/spotcheck-topN.md（人工抽检清单）

训练输入 = 与推理时完全一致的观测 JSON（从样本决策点重构），
输出 = 模型当时的 reasoning + 动作（与推理输出格式一致）。
"""
import argparse
import json
import glob
import os
import sys

sys.path.insert(0, '.')

from agents.prompts import GOOD_SYSTEM_PROMPT, EVIL_SYSTEM_PROMPT, FEWSHOT_GOOD, FEWSHOT_EVIL

SYSTEM = {'good': GOOD_SYSTEM_PROMPT + FEWSHOT_GOOD,
          'evil': EVIL_SYSTEM_PROMPT + FEWSHOT_EVIL}


def _observation(sample):
    """从样本决策点重构与推理时一致的观测 JSON。"""
    dp = sample['decision_point']
    return {
        'side': dp['side'],
        'round': dp['round'],
        'phase': dp['phase'],
        'board': dp['public_state']['board'],
        'hand_cards_used': dp['public_state']['used_cards'],
        'history': dp['public_state']['history'],
        'belief': dp.get('belief_state'),
        'action_space': dp['legal_actions'],
    }


def _assistant_output(sample):
    """重构模型当时的完整输出（reasoning + 动作）。"""
    label = sample['ai_label']
    r = label.get('reasoning', '')
    action = label.get('chosen_action') or {}
    out = {'reasoning': r}
    if sample['decision_point']['side'] == 'good':
        out['targets'] = action.get('targets', [])
    else:
        out['cardIndex'] = action.get('cardIndex')
        out['actions'] = action.get('actions', [])
    return out


def _records(sample_ids, bucket_name):
    """把样本 ID 清单转为 ShareGPT 格式记录列表。"""
    # 建立 ID → 样本 索引
    index = {}
    for f in glob.glob('data/decision_points/agent-batch*/*.json'):
        for s in json.load(open(f, encoding='utf-8')):
            if s.get('ai_label', {}).get('reasoning'):
                index[s['sample_id']] = s
    recs = []
    for sid in sample_ids:
        s = index.get(sid)
        if not s:
            continue
        side = s['decision_point']['side']
        recs.append({
            'sample_id': sid,
            'side': side,
            'bucket': bucket_name,
            'messages': [
                {'role': 'system', 'content': SYSTEM[side]},
                {'role': 'user', 'content': json.dumps(_observation(s), ensure_ascii=False)},
                {'role': 'assistant',
                 'content': json.dumps(_assistant_output(s), ensure_ascii=False)},
            ],
        })
    return recs


def cmd_build(args):
    cand = json.load(open('data/sft_candidates.json', encoding='utf-8'))
    buckets = cand['buckets']
    os.makedirs('data/sft', exist_ok=True)
    out = {
        'good': (buckets['A'] + buckets['B'], 'good_train.jsonl'),
        'evil': (buckets['A'] + buckets['B'], 'evil_train.jsonl'),
        'dpo': (buckets['C'], 'dpo_rejected.jsonl'),
    }
    written = {}
    for key, (ids, fname) in out.items():
        recs = _records(ids, key)
        if key in ('good', 'evil'):
            recs = [r for r in recs if r['side'] == key]  # 按阵营分训
        path = os.path.join('data/sft', fname)
        with open(path, 'w', encoding='utf-8') as fp:
            for r in recs:
                fp.write(json.dumps(r, ensure_ascii=False) + '\n')
        written[fname] = len(recs)
    for fname, n in written.items():
        print(f'data/sft/{fname}: {n} 条')
    print('构建完成')


def cmd_spotcheck(args):
    cand = json.load(open('data/sft_candidates.json', encoding='utf-8'))
    ids = cand['buckets']['A'][:args.n]
    index = {}
    for f in glob.glob('data/decision_points/agent-batch*/*.json'):
        for s in json.load(open(f, encoding='utf-8')):
            if s.get('ai_label', {}).get('reasoning'):
                index[s['sample_id']] = s
    lines = ['# SFT A 档人工抽检清单（前 %d 条）' % len(ids), '']
    from agents.annotate import render
    for sid in ids:
        s = index.get(sid)
        if not s:
            continue
        lines.append(render(s))
        lines.append('\n---\n')
    os.makedirs('data/sft', exist_ok=True)
    path = 'data/sft/spotcheck-top%d.md' % len(ids)
    open(path, 'w', encoding='utf-8').write('\n'.join(lines))
    print(f'抽检清单已写入 {path}（{len(ids)} 条 A 档样本，含推理链与选择，供人工核验推理正确性）')


def main():
    ap = argparse.ArgumentParser(description='SFT/DPO 数据集构建器')
    sub = ap.add_subparsers(dest='cmd', required=True)
    p1 = sub.add_parser('build')
    p1.set_defaults(fn=cmd_build)
    p2 = sub.add_parser('spotcheck')
    p2.add_argument('--n', type=int, default=10)
    p2.set_defaults(fn=cmd_spotcheck)
    args = ap.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
