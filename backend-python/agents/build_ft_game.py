"""
build_ft_game.py —— 整局双智能体数据 → SFT 训练集构建器。

输入：recorder --game-out 产出的整局 JSON（decisions 含每回合思维链/置信度/动作）。
输出：ShareGPT messages jsonl（可直接上传 DeepSeek 平台微调 / 本地 QLoRA）。

两种粒度：
  --granularity decision  每个决策点一条样本（观测含第1回合起的完整历史）→ 默认
  --granularity game      整局一条样本（system + 按回合顺序拼接全部决策）

用法：python -m agents.build_ft_game --dir data/games --out data/sft/ft_game_train.jsonl
"""
import argparse
import glob
import json
import os
import sys

sys.path.insert(0, '.')

from agents.prompts import GOOD_SYSTEM_PROMPT, EVIL_SYSTEM_PROMPT, FEWSHOT_GOOD, FEWSHOT_EVIL

SYSTEM = {'good': GOOD_SYSTEM_PROMPT + FEWSHOT_GOOD,
          'evil': EVIL_SYSTEM_PROMPT + FEWSHOT_EVIL}


def _decision_assistant(dec):
    d = dec['decision']
    out = {'reasoning': d.get('reasoning') or '', 'confidence': d.get('confidence')}
    action = d.get('action') or {}
    if dec['side'] == 'good':
        out['targets'] = action.get('targets', [])
    else:
        out['cardIndex'] = action.get('cardIndex')
        out['actions'] = action.get('actions', [])
    return out


def _decision_user(dec):
    obs = dec['observation']
    return json.dumps({
        'side': obs['side'],
        'round': obs['round'],
        'phase': obs['phase'],
        'board': obs['public_state']['board'],
        'hand_cards_used': obs['public_state']['used_cards'],
        'history': obs['public_state']['history'],
        'belief': obs.get('belief_state'),
        'action_space': obs.get('legal_actions'),
    }, ensure_ascii=False)


def main():
    ap = argparse.ArgumentParser(description='整局双智能体数据 → SFT 训练集')
    ap.add_argument('--dir', required=True, help='整局 JSON 目录（recorder --game-out 输出）')
    ap.add_argument('--out', required=True, help='输出 jsonl 路径')
    ap.add_argument('--granularity', default='decision',
                    choices=['decision', 'game'],
                    help='decision=每决策点一条样本（默认）；game=整局一条样本')
    ap.add_argument('--min-confidence', type=float, default=None,
                    help='只保留置信度 ≥ 此值的决策（可选质量过滤）')
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.dir, '*.json')))
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    n_decision = n_game = n_skip = 0

    with open(args.out, 'w', encoding='utf-8') as fp:
        for f in files:
            game = json.load(open(f, encoding='utf-8'))
            decisions = game.get('decisions', [])
            if args.granularity == 'decision':
                for dec in decisions:
                    conf = dec['decision'].get('confidence')
                    if args.min_confidence is not None and (
                            conf is None or conf < args.min_confidence):
                        n_skip += 1
                        continue
                    rec = {
                        'sample_id': f'{game["game_id"]}-d{dec["seq"]}',
                        'game_id': game['game_id'],
                        'side': dec['side'],
                        'messages': [
                            {'role': 'system', 'content': SYSTEM[dec['side']]},
                            {'role': 'user', 'content': _decision_user(dec)},
                            {'role': 'assistant',
                             'content': json.dumps(_decision_assistant(dec),
                                                   ensure_ascii=False)},
                        ],
                    }
                    fp.write(json.dumps(rec, ensure_ascii=False) + '\n')
                    n_decision += 1
            else:  # 整局一条样本：双方决策按时间顺序拼成多轮对话
                msgs = []
                for dec in decisions:
                    msgs.append({'role': 'system',
                                 'content': SYSTEM[dec['side']]})
                    msgs.append({'role': 'user', 'content': _decision_user(dec)})
                    msgs.append({'role': 'assistant',
                                 'content': json.dumps(_decision_assistant(dec),
                                                       ensure_ascii=False)})
                rec = {'sample_id': game['game_id'], 'game_id': game['game_id'],
                       'side': 'both', 'messages': msgs}
                fp.write(json.dumps(rec, ensure_ascii=False) + '\n')
                n_game += 1

    print(f'{args.out}: {len(files)} 局 → '
          f'{"决策点样本 " + str(n_decision) + " 条" if args.granularity == "decision" else "整局样本 " + str(n_game) + " 条"}'
          f'{"（跳过低置信度 " + str(n_skip) + " 条）" if n_skip else ""}')


if __name__ == '__main__':
    main()
