"""
build_v1_data.py —— v1 纯动作行为克隆训练集构建（阶段一）

来源：规则自对弈决策点样本（normal/hard/revive 三批，观测完整含信念）。
输出：data/sft/v1_action_train.jsonl（ShareGPT messages 格式，
      assistant 输出 = {"reasoning": "", +动作}——保持结构一致，reasoning 留空）。

用法：python -m agents.build_v1_data
"""
import glob
import json
import os
import sys

sys.path.insert(0, '.')

from agents.prompts import GOOD_SYSTEM_PROMPT, EVIL_SYSTEM_PROMPT, FEWSHOT_GOOD, FEWSHOT_EVIL

SYSTEM = {'good': GOOD_SYSTEM_PROMPT + FEWSHOT_GOOD,
          'evil': EVIL_SYSTEM_PROMPT + FEWSHOT_EVIL}


def _observation(sample):
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
    label = sample['ai_label']
    action = label.get('chosen_action') or {}
    out = {'reasoning': ''}
    if sample['decision_point']['side'] == 'good':
        out['targets'] = action.get('targets', [])
    else:
        out['cardIndex'] = action.get('cardIndex')
        out['actions'] = action.get('actions', [])
    return out


def main():
    samples = []
    for batch in ('normal', 'hard', 'revive'):
        for f in glob.glob(f'data/decision_points/{batch}/*.json'):
            for s in json.load(open(f, encoding='utf-8')):
                # 只取规则 AI 决策（纯动作、无思维链，符合阶段一行为克隆定位）
                if (s.get('ai_label') or {}).get('brain') == 'RuleBrain':
                    samples.append(s)

    os.makedirs('data/sft', exist_ok=True)
    out_path = 'data/sft/v1_action_train.jsonl'
    good_n = evil_n = 0
    with open(out_path, 'w', encoding='utf-8') as fp:
        for s in samples:
            side = s['decision_point']['side']
            rec = {
                'sample_id': s['sample_id'],
                'side': side,
                'messages': [
                    {'role': 'system', 'content': SYSTEM[side]},
                    {'role': 'user',
                     'content': json.dumps(_observation(s), ensure_ascii=False)},
                    {'role': 'assistant',
                     'content': json.dumps(_assistant_output(s), ensure_ascii=False)},
                ],
            }
            fp.write(json.dumps(rec, ensure_ascii=False) + '\n')
            if side == 'good':
                good_n += 1
            else:
                evil_n += 1
    print(f'{out_path}: {len(samples)} 条（good {good_n} / evil {evil_n}）')


if __name__ == '__main__':
    main()
