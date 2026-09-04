"""
annotate.py —— 决策点人工标注工具（P1 数据管线）。

子命令：
    list  按"标注价值"打分排序，输出 Top-N 样本索引
    show  渲染单个样本（文本棋盘 + 历史 + 信念 + AI 选择）
    save  把标注结果写回样本 JSON（更新 human_label/quality/source）

用法（在 backend-python 目录下）：
    python -m agents.annotate list --dir data/decision_points --n 10
    python -m agents.annotate show --dir data/decision_points --id g-0000-r12345-good-r5-04
    python -m agents.annotate save --dir data/decision_points --id <样本ID> --json ann.json

标注 JSON 格式（对应 human_label 字段）：
    {
      "thought_process": ["句1", "句2"],
      "principles_used": ["region_constraint", "count_deduction"],
      "chosen_action": null,            // 同意 AI 选择填 null；不同意则给替代动作
      "confidence": 0.8,
      "annotator": "player_zhang",
      "grade": "A"
    }
"""
import argparse
import glob
import json
import os
import sys

sys.path.insert(0, '.')

SHAPE_TAG = {'九宫格': '九', '十字': '十'}


def _board_text(board):
    """5×5 文本棋盘：编号 + 标记（九/十=死亡标记形状，W=被监视，×=死亡/恒死）。"""
    grid = {c['id']: c for c in board}
    lines = ['   ' + '  '.join(f'[{c}]' for c in (601, 602, 603, 604, 605)) if False else '']
    for row in range(4, -1, -1):
        cells = []
        for col in range(5):
            cid = (row + 2) * 100 + (col + 1)
            c = grid.get(cid)
            if not c:
                cells.append('     ')
                continue
            tag = ''
            if c['status'] in ('dead', 'default_dead'):
                tag = '×'
            elif c.get('hasDeathMarker'):
                tag = SHAPE_TAG.get(c.get('deathMarkerShape'), 'M')
            elif c.get('watched'):
                tag = 'W'
            cells.append(f'{cid}{tag:<2}')
        lines.append(' | '.join(cells))
    return '\n'.join(lines)


def _history_text(history):
    lines = []
    for h in history or []:
        parts = [f"R{h['round']}"]
        if h.get('surveillance'):
            parts.append(f'监视{h["surveillance"]}')
        if h.get('death'):
            marks = ','.join(f"{m['targetId']}{SHAPE_TAG.get(m['shape'], '?')}"
                             for m in h['death'])
            desc = h.get('cardDescription') or f"卡#{h.get('card')}"
            parts.append(f'标记[{marks}] {desc}')
        if h.get('skip'):
            parts.append('跳过')
        lines.append(' '.join(parts))
    return '\n'.join(lines) if lines else '(无历史)'


def render(sample):
    dp = sample['decision_point']
    out = []
    out.append(f"样本 {sample['sample_id']}")
    out.append(f"来源 {sample['source']} | {dp['side']}侧 第{dp['round']}回合 {dp['phase']}")
    out.append('--- 棋盘 ---')
    out.append(_board_text(dp['public_state']['board']))
    out.append(f"已用卡: {dp['public_state'].get('used_cards')}")
    out.append('--- 历史 ---')
    out.append(_history_text(dp['public_state'].get('history')))
    belief = dp.get('belief_state') or {}
    top5 = belief.get('top5_suspects') or []
    if top5:
        out.append('--- 信念 Top5 ---')
        out.append(', '.join(f"{t['id']}:{t['prob']}" for t in top5))
    out.append('--- AI 选择 ---')
    out.append(json.dumps(sample.get('ai_label'), ensure_ascii=False))
    out.append('--- 现有标注 ---')
    out.append(json.dumps(sample.get('human_label'), ensure_ascii=False))
    return '\n'.join(out)


def _interest_score(sample):
    """标注价值打分：残局/多标记/信念集中/放钓特征 越高越值得标。"""
    dp = sample['decision_point']
    sc = 0.0
    if dp['round'] >= 5:
        sc += 3
    hist = dp['public_state'].get('history') or []
    last_death = None
    for h in reversed(hist):
        if h.get('death'):
            last_death = h
            break
    if last_death:
        k = len(last_death['death'])
        if k >= 2:
            sc += 2
        if k == 1 and last_death.get('card') in (0, 1, 2, 3):
            sc += 2  # 放钓特征：两动卡只放一标
    belief = dp.get('belief_state') or {}
    top5 = belief.get('top5_suspects') or []
    if top5 and top5[0].get('prob', 0) >= 0.3:
        sc += 2
    return sc


def _load_all(data_dir):
    samples = []
    for f in glob.glob(os.path.join(data_dir, '**', '*.json'), recursive=True):
        try:
            for s in json.load(open(f, encoding='utf-8')):
                s['_file'] = f
                samples.append(s)
        except Exception as e:
            print(f'跳过损坏文件 {f}: {e}')
    return samples


def cmd_list(args):
    samples = _load_all(args.dir)
    samples.sort(key=_interest_score, reverse=True)
    print(f'共 {len(samples)} 条样本，按标注价值排序 Top {args.n}：')
    for i, s in enumerate(samples[:args.n]):
        dp = s['decision_point']
        print(f"[{i:>2}] {_interest_score(s):.0f}分  {s['sample_id']}  "
              f"{dp['side']} R{dp['round']} 已标注={'是' if s.get('human_label') else '否'}")


def cmd_show(args):
    samples = _load_all(args.dir)
    for s in samples:
        if s['sample_id'] == args.id:
            print(render(s))
            return
    print(f'未找到样本 {args.id}')
    sys.exit(1)


def cmd_save(args):
    ann = json.load(open(args.json, encoding='utf-8'))
    target = None
    for f in glob.glob(os.path.join(args.dir, '**', '*.json'), recursive=True):
        recs = json.load(open(f, encoding='utf-8'))
        for s in recs:
            if s['sample_id'] == args.id:
                target = (f, recs, s)
                break
        if target:
            break
    if not target:
        print(f'未找到样本 {args.id}')
        sys.exit(1)
    f, recs, s = target
    s['human_label'] = {
        'thought_process': ann.get('thought_process', []),
        'principles_used': ann.get('principles_used', []),
        'chosen_action': ann.get('chosen_action'),
        'confidence': ann.get('confidence'),
        'annotator': ann.get('annotator', 'player_zhang'),
        'annotated_at': ann.get('annotated_at', ''),
    }
    s['quality'] = {'grade': ann.get('grade', 'A'), 'reviewed': False, 'issues': []}
    if s['source'] == 'selfplay_raw':
        s['source'] = 'selfplay_corrected'
    json.dump(recs, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'已写入标注 → {f} ({s["sample_id"]}, source={s["source"]})')


def main():
    ap = argparse.ArgumentParser(description='决策点人工标注工具')
    sub = ap.add_subparsers(dest='cmd', required=True)

    p1 = sub.add_parser('list')
    p1.add_argument('--dir', default='data/decision_points')
    p1.add_argument('--n', type=int, default=10)
    p1.set_defaults(fn=cmd_list)

    p2 = sub.add_parser('show')
    p2.add_argument('--dir', default='data/decision_points')
    p2.add_argument('--id', required=True)
    p2.set_defaults(fn=cmd_show)

    p3 = sub.add_parser('save')
    p3.add_argument('--dir', default='data/decision_points')
    p3.add_argument('--id', required=True)
    p3.add_argument('--json', required=True, help='标注 JSON 文件路径')
    p3.set_defaults(fn=cmd_save)

    args = ap.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
