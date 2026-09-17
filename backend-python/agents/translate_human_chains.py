"""
translate_human_chains.py —— 17 条人类思维链中→英（金标准样本，2026-09-09）。

把 human_label.thought_process 的英文版写入 human_label.thought_process_en，
中文原文保留在 thought_process_zh（可追溯）。记号约定：
    X cross = 十字标记在 X；X nine_grid = 九宫格标记在 X；surveilled = 被监视。

用法：python -m agents.translate_human_chains
"""
import glob
import json
import os
import sys

sys.path.insert(0, '.')

# sample_id -> English thought chain（逐条精译，数字与集合与原文完全一致）
EN = {
'g-0000-r42281-good-r5-07':
"""Seen: R1 605 cross possible sources {601,602,603,604,205,305,405,505}; 301 cross possible sources {302,303,304,305,201,401,501,601}. R2 markers 504 cross, 303 nine_grid cannot come from {601,305,602}. R3 markers 602 cross, 404 nine_grid cannot come from {304,302,604}. R4 markers 401 cross, 502 cross cannot come from {505,304,402}. Combine these constraints with the nine_grid candidates (303 nine_grid: {202,203,204,302,304,402,403,404}; 404 nine_grid: {303,304,305,403,405,503,504,505}).
Inference: Enumerating all villain trios that satisfy every constraint, only two solutions remain: A:{505,601,302} B:{304,601,503} (any other combination fails because some round's marker could not be placed by an unsurveilled villain, or two markers in one round conflict on sources). Common intersection and probabilities: both solutions share {601}, so 601 appears in every valid solution - probability 1 (highest certainty). Secondary suspects: 302 and 505 in solution A, 304 and 503 in solution B, each with probability 0.5; all other rooms have probability 0.
Branch test: surveilling rooms like {302,505,304,503} in round 5 can distinguish the branches via marker sources. If round 5 shows only one marker, exactly one of the surveilled is a villain and the other two acted; combined with marker shape this locks the hypothesis.
Decision: pick 601 as the most likely villain first, then 302,505 (or 304,503 - but 601 is the common core).
Confidence: 601 ~ 1.0; 302/505 ~ 0.5; 304/503 ~ 0.5""",

'g-0000-r42281-good-r6-09':
"""Inference: Through the first four rounds, enumerating all assignments satisfying "each round's marker sources were not surveilled, and the source room must share row/column (cross) or the 3x3 area (nine_grid) with the target", only two villain trios are feasible: A:{505,601,302} B:{304,601,503}. Round 5 surveilled [505,601,202] and the marker was [302 nine_grid]. If B were true, 302 would not be a villain and could not produce a marker sourced from 302; moreover 304 and 503 were both unsurveilled, so by rule at least 2 markers must be placed, but only 1 appeared - contradiction, B eliminated. If A is true, 505 and 601 were surveilled and could not act; the only unsurveilled villain 302 executed the""",

'g-0001-r42402-good-r5-07':
"""Inference: Expanding each cross/nine_grid marker by row/column or 3x3 area and excluding rooms surveilled that round, the source candidate sets are: 604 cross -> {601,602,603,605,504,404,304,204}; 302 cross -> {301,303,304,305,202,402,502,602}; 203 cross -> {201,202,204,205,303,403,503,603}; 405 nine_grid -> {305,404,504,505} (304 surveilled, excluded); 501 cross -> {502,503,505,401,301,201,601} (504 surveilled, excluded); 303 nine_grid -> {202,203,204,302,304,402,403} (404 surveilled, excluded)""",

'g-0002-r42525-good-r5-07':
"""Inference: Exclude all marked-and-killed characters: {602,304,405,302,503,202,301,404,601,501} cannot be villains (a villain would not kill themselves). Round 3's "202 nine_grid" can only be placed within 202's 3x3 area, candidates {201,203,303}; so one villain must come from A={201,203,303}. Likewise "503 nine_grid" candidates {403,502,504,603,604,605}, and 402 was surveilled in round 3 so it could not act; so another villain must come from B={403,502,504,603,604,605}. Eliminate 303: if 303 were a villain, in round 4 it was surveilled and could not act; round 4""",

'g-0002-r42525-good-r6-09':
"""Inference: Exclude all marked-and-killed characters: 602,304,405,302,503,202,301,404,601,501 cannot be villains. Round 5's card was "cross x2 + nine_grid" but only two crosses (601 cross, 501 cross) were played - the nine_grid was not executed. Round 5 surveilled [201,305,604], so only two unsurveilled villains could execute the crosses; the third villain must be inside the surveilled set {201,305,604}, otherwise they would have been forced to execute the nine_grid, contradicting the record. Hence the trio must contain one of 201,305,604. Round 1 needed two crosses to kill 602 and 304. Candidates that can kill 602 AND also execute a cross in round 5 (killing 601 or 501) are only""",

'g-0003-r42642-good-r5-07':
"""Inference: First exclude the killed: 601,302,204,404,205,502,504,402 cannot be villains; remaining rooms {201,202,203,301,303,304,305,401,403,405,501,503,505,602,603,604,605}. Per-round source candidate sets (surveilled rooms removed): R1 601 cross: {602,603,604,605,201,301,401,501}; R1 302 cross: {202,301,303,304,305,602}; R2 204 cross: {201,202,203,304,604}; R2 404 nine_grid: {303,304,305,403,405,503""",

'g-0003-r42642-good-r6-09':
"""Inference: Exclude all marked-and-killed rooms: {601,302,204,404,205,502,504,402,301,605,304} cannot be villains; among the remaining candidates, round 5's card "cross x2 + nine_grid" must be executed by the three villains respectively, and round 5 surveilled [202,503,501], so the source candidates for the three markers are: 301 cross: {303,305,201,401} (501 surveilled, excluded); 605 cross: {602,603,604,305,405,505}; 304 nine_grid: {203,303,305,403,405}, all three distinct. Exhaustively enumerating these combinations and checking all other rounds' constraints (each round's markers must be placed by unsurveilled villains, and two markers in the same round are generally placed by different villains""",

'g-0004-r42765-good-r5-07':
"""Inference: Exclude the killed: rooms 301,605,304,402,201,401,505,602 cannot be villains; remaining candidates 202,203,204,205,302,303,305,403,404,405,501,502,503,504,601,603,604. Per-round candidate sets (that round's surveilled and killed targets removed): R1 (no surveillance): 301 cross <- A1={302,303,305,501,601}; 605 cross <- B1={601,603,604,205,305,405}; R2 (surveilled 601,305,602): 304 nine_grid <- A2={203,204,205,303,403,404,405}; 402 nine_grid <- B2=""",

'g-0004-r42765-good-r6-09':
"""Inference: Exclude all marked-and-killed rooms: 301,605,304,402,201,401,505,602,303,305 are not villains; remaining candidates {202,203,204,205,302,403,404,405,501,502,503,504,601,603,604}. Round 5's 305 nine_grid can only be executed by one of 204,205,404; but in R4, 505 cross candidates are {502,503,504,205,405} and 602 cross candidates are {603,604,202,502}, with R4 surveillance [501,601,302] excluding those three. If 204 or 404 executed 305 nine_grid, they could not execute any R4 marker (not in the G/H candidate sets""",

'g-0005-r42877-good-r5-07':
"""Inference: Exclude the marked-and-killed rooms: {601,505,302,204,503,404,201,304,502}; remaining candidates 202,203,205,301,303,305,401,402,403,405,501,504,602,603,604,605. Per-round source candidates (surveilled removed): R1 (no surveillance): 601 cross <- {602,603,604,605,301,401,501}; 505 cross <- {501,504,205,305,405}; 302 nine_grid <- {202,203,301,303,401,402,403}; R2 (surveilled 605,501,401): 204 cross <- {20""",

'g-0005-r42877-good-r6-09':
"""Inference: Exclude all marked-and-killed rooms: 601,505,302,204,503,404,201,304,502,205; remaining candidates 202,203,301,303,305,401,402,403,405,501,504,602,603,604,605. Round 5 surveilled [405,203,602] and only one cross (205 cross) was played - the nine_grid was not executed. Candidates that can execute 205 cross are {202,305,605} (203,405 surveilled; 602 surveilled). If the executor were 305 or 605, the first four rounds' markers cannot all be assigned (exhaustive search finds no feasible combination), so the executor must be 202. Meanwhile the nine_grid went unplayed only because the other two villains were both surveilled, so the other two""",

'g-0006-r42984-good-r5-07':
"""Inference: Exclude the killed: {601,504,305,303,205,502,604,503} cannot be villains; remaining candidates 201,202,203,204,301,302,304,401,402,403,404,405,501,505,602,603,605. Per-round source candidates (surveilled removed): R1 (no surveillance): 601 cross <- {602,603,605,201,301,401,501}; 504 cross <- {501,505,204,304,404}; R2 (surveilled 604,501,602): 305 cross <- {301,302,304,405,505,605}; 303 nine_grid <- {202,203,204,302,304,40""",

'g-0006-r42984-good-r6-09':
"""Inference: Exclude the killed: {601,504,305,303,205,502,604,503,204,401}; remaining candidates {201,202,203,301,302,304,402,403,404,405,501,505,602,603,605}. Round 5's card was "cross x2 + nine_grid" but only two crosses (204 cross, 401 cross) were played - the nine_grid was not executed. Therefore the third villain must have been surveilled (one of 603,605,505), while the other two villains were unsurveilled and executed the two crosses. Per-round source candidates (surveilled removed): R1 (no surveillance): 601 cross <- {602,603,605,201,301,401,501}; 504 cross <- {501""",

'g-0007-r43109-good-r5-07':
"""Inference: Exclude the marked-and-killed rooms: {605,302,503,304,401,303,205,603} cannot be villains. Remaining candidates: 201,202,203,204,301,305,402,403,404,405,501,502,504,505,601,602,604. Per-round source candidates (surveilled removed; cross = same row or column, nine_grid = row +/- 1 and column +/- 1): R1 (no surveillance, markers 605 cross, 302 cross): 605 cross <- {601,602,604,305,405,505}; 302 cross <- {301,305,202,""",

'g-0008-r43224-good-r5-07':
"""Inference: Exclude the killed rooms: R1 killed 602,504; R2 killed 205,402; R3 killed 304,201; R4 killed 603,404 -> exclude {602,504,205,402,304,201,603,404}; candidates 202,203,204,301,302,303,305,401,403,405,501,502,503,505,601,604,605. Per-round marker candidates (surveilled removed; cross = same row/column, nine_grid = row +/- 1, column +/- 1): R1: 602 cross -> {601,604,605,202,302,502}; 504 cross -> {501,502,503,505,204,604}""",

'g-0008-r43224-good-r6-09':
"""Inference: Exclude all marked-and-killed rooms: {602,504,205,402,304,201,603,404,401,204}; remaining candidates 202,203,301,302,303,305,403,405,501,502,503,505,601,604,605. Per-round source candidates (surveilled removed; the two markers in one round are placed by different villains): R1: 602 cross <- {601,604,605,202,302,502}; 504 cross <- {501,502,503,505}; R2 (surveilled 604,502,601): 205 cross <- {202,203,305,405,505}; 402 nine_grid <- {301,302,303,403,50""",

'g-0029-r45658-good-r5-07':
"""Seen: Round 4 - 304, 204, 502 were surveilled; the villains played the "cross x2 + nine_grid" card (3 actions) but placed only 2 markers (203 cross, 604 cross). Inference: k=2 < c=3, so exactly 2 unsurveilled villains acted; among the surveilled {304,204,502} exactly 1 is a true villain. Inference: consecutive-cut analysis - R2's 402 cross and R3's 303 nine_grid, 305 nine_grid have ranges intersecting at 404; and 303 nine_grid + 305 nine_grid intersection = {204,304,404}, where 204,304 were exactly the round-4 surveilled ones - combined with the previous point, exactly one of 304,204 is a villain. Inference: range backtracking - 604 cross leaves survivors {601,602,603,405,505}; 203 cross leaves survivors {201,202,204,205,503,603}; R3's 501 cross, if by the same villain as 203 cross""",

'g-0000-r42281-evil-r1-00':
"""Seen: 201, 202, 505 are this game's villains. 201 and 202 have heavily overlapping ranges, so down-weight nine_grid markers by 201 or 202 unless nine_grid is the only option or a later strategy change requires it.
Inference one: marking 301 or 302 with nine_grid at the start would raise the exposure probability of 201 and 202 - quite possibly getting both surveilled together.
Inference two: Strategy 1 (exposure-first) - 202's nine_grid range contains 303, which has many uneliminated suspects around it; a nine_grid on that target reveals to the good side a suspect set of 7 characters (402,302,202,203,204,304,404) - this is the minimum exposure of a nine_grid marker - greatly lowering the chance the good side surveils a villain in round 1. Likewise 505's nine_grid range contains 504, another 7-suspect target. So play the nine_grid x2 card: 202 marks 303 with nine_grid, 505 marks 504 with nine_grid. Using up the highest-exposure double-nine_grid card first relieves later exposure pressure. Strategy 2 (lane planning) - cross markers have a minimum exposure of 8 suspects (slightly better than nine_grid's 7), so for 505 a cross beats a nine_grid; pick from 501,502,503,405 (a later option, not first choice), 305 - not 205 (its cross range overlaps both 201's and 202's cross ranges), not 504 or 605 (they sit inside 505's nine_grid range, which must be reserved for the likely high-exposure nine_grid plays later); 405 inside the nine_grid range is acceptable because we will fabricate a fake villain identity for 402, so 405 serves as a later option. For 201 and 202: their cross ranges overlap in 4 cells (including themselves); even though cross exposure is lower than nine_grid, using cross early would severely restrict their own future actions. So the later plan is: 201 nine_grid on 301 or 302, 202 nine_grid on 303 to fabricate 402's fake identity. Hence now play 202 nine_grid on 303 and 505 cross on 305. Note: the four actions - 201 nine_grid on 301 or 302, 505 cross on 405, and 201 cross on 401 - must never be combined within the same round.
Comparison: Strategy 1 reasons from exposure; it can also adopt the fake-identity play. Strategy 2 reasons from strategic depth, steering the good side's choices from two marker angles.
Decision: Strategy 1 - play the nine_grid x2 card, 202 marks 303 with nine_grid, 505 marks 504 with nine_grid. Confidence: 0.9. Grade: A (overrides the AI's cross x2 choice).""",
}


def main():
    merged = 0
    for f in glob.glob('data/decision_points/**/*.json', recursive=True):
        recs = json.load(open(f, encoding='utf-8'))
        hit = False
        for s in recs:
            hl = s.get('human_label')
            if hl and hl.get('thought_process') and s['sample_id'] in EN:
                hl['thought_process_zh'] = hl['thought_process']
                hl['thought_process'] = [EN[s['sample_id']]]
                hl['language'] = 'en'
                merged += 1
                hit = True
        if hit:
            json.dump(recs, open(f, 'w', encoding='utf-8'),
                      ensure_ascii=False, indent=1)
    print(f'已英译 {merged} 条人类思维链（原文存 thought_process_zh）')


if __name__ == '__main__':
    main()
