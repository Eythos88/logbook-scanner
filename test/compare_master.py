"""python test/compare_master.py <master.xlsm> — compare test/out.xlsx formatting to the master's task-log rows."""
import sys, openpyxl, os, warnings
warnings.filterwarnings('ignore')
here = os.path.dirname(__file__)
m = openpyxl.load_workbook(sys.argv[1])['Wednesday.9.16.2026']
o = openpyxl.load_workbook(os.path.join(here, 'out.xlsx')).active

def sig(c):
    f, a, b = c.font, c.alignment, c.border
    return dict(nf=c.number_format if c.column == 1 else '-', font=(f.name, f.sz, bool(f.b)),
                al=(a.horizontal, a.vertical, bool(a.wrap_text) if c.column > 1 else '-'),
                left=b.left.style, right=b.right.style, bottom=b.bottom.style)

# master row 213 = plain entry, 212 = XXXX continuation; out rows 2 and 4
bad = 0
for mr, orow in ((213, 2), (212, 4)):
    for col in (1, 2, 12):
        ms, os_ = sig(m.cell(mr, col)), sig(o.cell(orow, col))
        for k in ms:
            if col == 12 and k == 'font': continue   # merged-over cell: never shows text; library drops its font
            if ms[k] != os_[k]:
                bad += 1; print(f'MISMATCH row{orow} col{col} {k}: master={ms[k]} out={os_[k]}')
mw = {k: round(m.column_dimensions[k].width, 1) for k in 'ABCDEFGHIJKL'}
ow = {k: round(o.column_dimensions[k].width, 1) for k in 'ABCDEFGHIJKL'}
print('widths master', mw); print('widths out   ', ow)
print('merges out', sorted(str(r) for r in o.merged_cells.ranges))
for r in range(1, o.max_row + 1):
    print(r, repr(o.cell(r, 1).value), o.cell(r, 1).number_format, '|', o.cell(r, 2).value)
print('FORMAT MATCH' if not bad else f'{bad} mismatches')
