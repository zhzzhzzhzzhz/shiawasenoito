"""
merge_docx_annotations.py —— 从标注 docx 提取人工标注并合并进数据集 JSON。

解析用户桌面标注文档（546 样本格式），把已填写的
思维链/原则/你的选择/信心/等级 合并写入 data/decision_points/**/*.json 的 human_label 字段。

用法：python -m agents.merge_docx_annotations "<docx路径>" [--dry-run]
"""
import argparse
import glob
import json
import os
import re
import sys

sys.path.insert(0, '.')


def load_paragraphs(path):
    import docx
    d = docx.Document(path)
    return [p.text for p in d.paragraphs if p.text.strip()]


def parse_blocks(paras):
    """把段落流切成 样本块，返回 [(sample_id, {label: content})]"""
    blocks = []
    i = 0
    while i < len(paras):
        m = re.match(r'^样本 \d+ · ([\w-]+)（', paras[i])
        if not m:
            i += 1
            continue
        sid = m.group(1)
        i += 1
        fields = {}
        current = None
        while i < len(paras) and not re.match(r'^样本 \d+ ·', paras[i]):
            p = paras[i]
            if p.startswith('思维链（'):
                current = 'thought'
            elif p.startswith('原则：'):
                current = 'principles'
            elif p.startswith('你的选择（'):
                current = 'choice'
                inline = p.split('：', 1)[-1].strip()
                if inline:
                    fields.setdefault('choice', []).append(inline)
            elif p.startswith('信心（'):
                current = 'confidence'
                inline = p.split('：', 1)[-1].strip()
                if inline:
                    fields.setdefault('confidence', []).append(inline)
            elif p.startswith('等级（'):
                current = 'grade'
                inline = p.split('：', 1)[-1].strip()
                if inline:
                    fields.setdefault('grade', []).append(inline)
            elif p.startswith('批次') or p.startswith('决策点标注数据集') or p.startswith('使用说明'):
                current = None
            elif current and p not in ('思维链（看到→推断→比较→决定）：', '原则：',
                                       '你的选择（不同意 AI 时给出）：', '信心（0~1）：', '等级（A/B/C）：'):
                fields.setdefault(current, []).append(p)
            i += 1
        blocks.append((sid, fields))
    return blocks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('docx')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    paras = load_paragraphs(args.docx)
    blocks = parse_blocks(paras)
    print(f'共 {len(blocks)} 个样本块')

    filled = [(sid, f) for sid, f in blocks if f.get('thought')]
    print(f'已填思维链: {len(filled)} 条')

    if args.dry_run:
        for sid, f in filled[:5]:
            print('---', sid, '---')
            print(' 思维链首行:', f['thought'][0][:80])
        return

    # 合并进数据集
    merged = 0
    for sid, f in filled:
        human = {
            'thought_process': f['thought'],
            'principles_used': [],
            'chosen_action': None,
            'confidence': None,
            'annotator': 'player_zhang_docx',
        }
        # 原则枚举文本 → 列表
        if f.get('principles'):
            text = ' '.join(f['principles'])
            known = ['exclude_killed', 'region_constraint', 'overlap_boost',
                     'count_deduction', 'release_fishing', 'cross_round_overlap',
                     'nine_grid_priority', 'replay_check', 'dilution',
                     'card_scheduling', 'anti_purge', 'decoy_identity']
            human['principles_used'] = [k for k in known if k in text] or text
        # 信心
        if f.get('confidence'):
            m = re.search(r'([\d.]+)', ' '.join(f['confidence']))
            human['confidence'] = float(m.group(1)) if m else None
        # 你的选择（不同意时）
        if f.get('choice'):
            human['chosen_action_note'] = ' '.join(f['choice'])
        # 等级
        if f.get('grade'):
            m = re.search(r'[ABC]', ' '.join(f['grade']))
            if m:
                human['_grade_hint'] = m.group(0)

        for g in glob.glob('data/decision_points/**/*.json', recursive=True):
            recs = json.load(open(g, encoding='utf-8'))
            hit = False
            for s in recs:
                if s['sample_id'] == sid:
                    s['human_label'] = human
                    grade_hint = human.pop('_grade_hint', None)
                    if s.get('quality') is None:
                        s['quality'] = {}
                    if grade_hint:
                        s['quality']['grade'] = grade_hint
                        s['quality']['reviewed'] = False
                    hit = True
            if hit:
                json.dump(recs, open(g, 'w', encoding='utf-8'),
                          ensure_ascii=False, indent=1)
                merged += 1
                break
    print(f'已合并 {merged} 条 human_label')


if __name__ == '__main__':
    main()
