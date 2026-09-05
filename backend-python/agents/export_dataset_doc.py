"""
export_dataset_doc.py —— 决策点标注数据集导出器（P1 数据管线）。

把 data/decision_points 下的全部样本导出为：
    --stage md   → output/dataset-annotation-export/stage1/final_draft.md
    --stage html → output/dataset-annotation-export/stage2/formatted-决策点标注数据集.html

数据完整性优先：样本内容由 JSON 确定性导出，不经任何改写。
标注区留白（思维链/原则/你的选择/信心/等级），供协作人工标注。
"""
import argparse
import glob
import json
import os
import sys

sys.path.insert(0, '.')

from agents.annotate import _interest_score, _board_text, _history_text

# 脚本位于 <workspace>/backend-python/agents/，工作区根 = 上两级
WS = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(WS, 'backend-python', 'data', 'decision_points')
OUT_DIR = os.path.join(WS, 'output', 'dataset-annotation-export')

PRINCIPLES = ('exclude_killed, region_constraint, overlap_boost, count_deduction, '
              'release_fishing, cross_round_overlap, nine_grid_priority, replay_check, '
              'dilution, card_scheduling, anti_purge')


def load_samples():
    samples = []
    for batch in ('normal', 'hard', 'revive'):
        for f in glob.glob(os.path.join(DATA_DIR, batch, '*.json')):
            try:
                for s in json.load(open(f, encoding='utf-8')):
                    samples.append(s)
            except Exception as e:
                print(f'跳过 {f}: {e}')
    samples.sort(key=_interest_score, reverse=True)
    return samples


def _usage_md():
    return """## 使用说明

本数据集为《幸福的丝线》单人模式智能体化升级项目的决策点样本库，供人工标注协作使用。

- **标注对象**：每条样本 = 一个决策点（正派选 3 个监视目标，或反派选卡+标记方案）。样本按标注价值降序排列。
- **思维链要求（四段式）**：看到什么 → 推断什么 → 比较了哪些选项 → 最终选择及理由，2~4 句，只引用可核实事实（角色编号、标记位置与形状、回合数、卡牌次数）。
- **原则枚举**：exclude_killed / region_constraint / overlap_boost / count_deduction / release_fishing / cross_round_overlap / nine_grid_priority / replay_check / dilution / card_scheduling / anti_purge。
- **你的选择**：同意 AI 选择则留空；不同意则给出替代动作（正派如 `{"targets": [603, 502, 601]}`，反派如 `{"cardIndex": 0, "actions": [...]}`）。
- **信心**：0~1，你对该选择是最优解的信心。
- **等级**：A 可用 / B 有瑕疵需备注 / C 作废。
- **一票否决**：违背排除法（监视已死亡/已标记者）、反派越范围标记、不满员行动、标记同伙、重复监视，直接判错。
"""


def _usage_html():
    return ("<h2>使用说明</h2>"
            "<p>本数据集为《幸福的丝线》智能体化升级项目的决策点样本库，供人工标注协作使用。"
            "每条样本 = 一个决策点，按标注价值降序排列。</p>"
            "<p><strong>思维链（四段式）</strong>：看到什么 → 推断什么 → 比较了哪些选项 → 最终选择及理由，"
            "2~4 句，只引用可核实事实（角色编号、标记位置与形状、回合数、卡牌次数）。</p>"
            "<p><strong>原则枚举</strong>：exclude_killed / region_constraint / overlap_boost / "
            "count_deduction / release_fishing / cross_round_overlap / nine_grid_priority / "
            "replay_check / dilution / card_scheduling / anti_purge。</p>"
            "<p><strong>你的选择</strong>：同意 AI 选择则留空；不同意则给出替代动作。</p>"
            "<p><strong>等级</strong>：A 可用 / B 有瑕疵 / C 作废。<strong>一票否决</strong>："
            "违背排除法、越范围标记、不满员行动、标记同伙、重复监视。</p>")


def _sample_md(idx, s):
    dp = s['decision_point']
    villains = _evil_villains(dp['public_state']['board'])
    lines = [f"### 样本 {idx:03d} · {s['sample_id']}（{dp['side']}侧 · 第{dp['round']}回合 · {dp['phase']}）",
             '']
    if villains:
        lines += [f"- **我方反派**：{', '.join(map(str, villains))}（evil 侧标注的前提信息）", '']
    lines += [f"- **已用卡**：{dp['public_state'].get('used_cards')}",
             '- **历史**：']
    for h in dp['public_state'].get('history') or []:
        lines.append(f"  - {_history_line(h)}")
    belief = (dp.get('belief_state') or {}).get('top5_suspects') or []
    lines.append('- **信念 Top5**：' + (', '.join(f"{t['id']}:{t['prob']}" for t in belief)
                                        if belief else '（无）'))
    lines.append(f"- **AI 选择**：`{json.dumps(s.get('ai_label'), ensure_ascii=False)}`")
    lines += ['', '**棋盘**', '', '```text', _board_text(dp['public_state']['board']), '```', '']
    lines += ['**标注区**', '',
              '- 思维链（看到→推断→比较→决定）：', '',
              '- 原则：', '',
              '- 你的选择（不同意 AI 时给出）：', '',
              '- 信心（0~1）：', '',
              '- 等级（A/B/C）：', '']
    return '\n'.join(lines)


def _history_line(h):
    parts = [f"R{h['round']}"]
    if h.get('surveillance'):
        parts.append(f"监视{h['surveillance']}")
    if h.get('death'):
        marks = ','.join(f"{m['targetId']}{m['shape'][0]}" for m in h['death'])
        desc = h.get('cardDescription') or f"卡#{h.get('card')}"
        parts.append(f"标记[{marks}] {desc}")
    if h.get('skip'):
        parts.append('跳过')
    return ' '.join(parts)


def _evil_villains(board):
    """evil 侧样本：从全知棋盘视图提取我方三名反派（标注 evil 样本的前提信息）。"""
    ids = sorted(c['id'] for c in board if c.get('role') == 'evil')
    return ids if ids else None


def _board_html(board, villains=None):
    grid = {c['id']: c for c in board}
    villains = set(villains or [])
    lines = []
    for row in range(4, -1, -1):
        cells = []
        for col in range(5):
            cid = (row + 2) * 100 + (col + 1)
            c = grid.get(cid)
            if not c:
                cells.append('    ')
                continue
            tag = ''
            if c['status'] in ('dead', 'default_dead'):
                tag = '×'
            elif c.get('hasDeathMarker'):
                tag = '九' if c.get('deathMarkerShape') == '九宫格' else '十'
            elif c.get('watched'):
                tag = 'W'
            if cid in villains:
                tag = (tag or 'V') if tag else 'V'
            cells.append(f'{cid}{tag}')
        lines.append(' | '.join(cells))
    return ''.join(f'<p class="bl">{l}</p>' for l in lines)


def _sample_html(idx, s):
    dp = s['decision_point']
    hist = ''.join(f'<li>{_history_line(h)}</li>' for h in dp['public_state'].get('history') or [])
    belief = (dp.get('belief_state') or {}).get('top5_suspects') or []
    belief_txt = ', '.join(f"{t['id']}:{t['prob']}" for t in belief) if belief else '（无）'
    villains = _evil_villains(dp['public_state']['board'])
    villain_line = (f'<p class="evil"><strong>我方反派：{", ".join(map(str, villains))}</strong></p>'
                    if villains else '')
    anno = ('<p class="anno">思维链（看到→推断→比较→决定）：</p>'
            '<p class="anno">原则：</p>'
            '<p class="anno">你的选择（不同意 AI 时给出）：</p>'
            '<p class="anno">信心（0~1）：</p>'
            '<p class="anno">等级（A/B/C）：</p>')
    return (f'<div class="sample"><h3>样本 {idx:03d} · {s["sample_id"]}'
            f'（{dp["side"]}侧 · 第{dp["round"]}回合 · {dp["phase"]}）</h3>'
            f'{villain_line}'
            f'{_board_html(dp["public_state"]["board"], villains)}'
            f'<p class="meta">已用卡：{dp["public_state"].get("used_cards")}</p>'
            f'<ul class="hist">{hist}</ul>'
            f'<p class="meta">信念 Top5：{belief_txt}</p>'
            f'<p class="ai">AI 选择：{json.dumps(s.get("ai_label"), ensure_ascii=False)}</p>'
            f'{anno}</div>')


def gen_md(samples):
    batches = {'normal': [], 'hard': [], 'revive': []}
    for s in samples:
        batches[s['game_meta'].get('revive403', False) and 'revive' or
                ('hard' if s['game_meta'].get('good_difficulty') == 'hard' else 'normal')].append(s)
    title = {'normal': '批次一：normal 对局（自对弈，未复活）',
             'hard': '批次二：hard 对局（自对弈，未复活）',
             'revive': '批次三：403 复活变体对局'}
    out = ['# 决策点标注数据集（《幸福的丝线》）', '', _usage_md()]
    idx = 0
    for batch in ('normal', 'hard', 'revive'):
        out += ['', f'## {title[batch]}（{len(batches[batch])} 条）', '']
        for s in batches[batch]:
            idx += 1
            out.append(_sample_md(idx, s))
    path = os.path.join(OUT_DIR, 'stage1', 'final_draft.md')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write('\n'.join(out))
    return path


def gen_html(samples):
    head = ('<!DOCTYPE html><html><head><meta charset="utf-8"><title>决策点标注数据集</title>'
            '<style>'
            'body{font-family:"微软雅黑",sans-serif;font-size:10.5pt;color:#222;line-height:1.5}'
            'h1{font-size:20pt;border-bottom:2px solid #333;padding-bottom:6px}'
            'h2{font-size:14pt;background:#eee;padding:4px 8px;border-left:4px solid #666;page-break-before:always}'
            'h3{font-size:11pt;margin:10px 0 4px}'
            '.sample{border:1px solid #bbb;padding:6px 8px;margin-bottom:10px}'
            'p.bl{font-family:"Consolas",monospace;margin:0;font-size:10pt}'
            '.evil{color:#8b0000;margin:2px 0}'
            '.meta{margin:2px 0}.ai{margin:2px 0;color:#333}'
            '.anno{margin:2px 0;border-bottom:1px dashed #ccc;padding-bottom:2px}'
            'ul.hist{margin:2px 0;padding-left:18px}'
            '</style></head><body>')
    out = [head, '<h1>决策点标注数据集（《幸福的丝线》）</h1>', _usage_html()]
    batches = {'normal': [], 'hard': [], 'revive': []}
    for s in samples:
        batches[s['game_meta'].get('revive403', False) and 'revive' or
                ('hard' if s['game_meta'].get('good_difficulty') == 'hard' else 'normal')].append(s)
    title = {'normal': '批次一：normal 对局（自对弈，未复活）',
             'hard': '批次二：hard 对局（自对弈，未复活）',
             'revive': '批次三：403 复活变体对局'}
    idx = 0
    for batch in ('normal', 'hard', 'revive'):
        out.append(f'<h2>{title[batch]}（{len(batches[batch])} 条）</h2>')
        for s in batches[batch]:
            idx += 1
            out.append(_sample_html(idx, s))
    out.append('</body></html>')
    path = os.path.join(OUT_DIR, 'stage2', 'formatted-决策点标注数据集.html')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write('\n'.join(out))
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stage', choices=['md', 'html'], required=True)
    args = ap.parse_args()
    samples = load_samples()
    print(f'载入 {len(samples)} 条样本')
    if args.stage == 'md':
        p = gen_md(samples)
    else:
        p = gen_html(samples)
    print(f'已生成 {p}')


if __name__ == '__main__':
    main()
