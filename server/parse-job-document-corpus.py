import json
import re
import sys
from collections import defaultdict

CORPUS = sys.argv[1] if len(sys.argv) > 1 else '.tmp/job-document-corpus.json'
OUTPUT = sys.argv[2] if len(sys.argv) > 2 else '.tmp/job-document-parsed.json'

def clean(value):
    value = str(value or '').replace('\ufffd', "'")
    value = re.sub(r'[ \t]+', ' ', value)
    value = re.sub(r' *\n *', '\n', value)
    return value.strip()

def labeled(value, label):
    match = re.search(rf'{re.escape(label)}\s*:\s*(.*)', clean(value), re.I | re.S)
    return clean(match.group(1)) if match else ''

def field_from_table(table, label, max_rows=9):
    for row in table[:max_rows]:
        for index, cell in enumerate(row):
            value = clean(cell)
            if not re.search(rf'^{re.escape(label)}\s*:', value, re.I):
                continue
            direct = labeled(value, label)
            if direct: return direct
            for following in row[index + 1:]:
                following = clean(following)
                if following and not re.search(rf'^{re.escape(label)}\s*:', following, re.I):
                    return following
    return ''

def uniq_cells(row):
    out = []
    for cell in row:
        cell = clean(cell)
        if cell and cell not in out:
            out.append(cell)
    return out

def roman_levels(text):
    text = clean(text).upper()
    found = []
    # Markers are normally a title/acronym followed by comma-separated Roman levels.
    for token in re.findall(r'(?<![A-Z])(?:IV|III|II|I|V)(?![A-Z])', text):
        level = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5}[token]
        if level not in found:
            found.append(level)
    return sorted(found)

def title_levels(title):
    levels = roman_levels(title)
    return levels or [1]

def strip_levels(title):
    title = labeled(title, 'Position Title') or clean(title)
    title = re.sub(r'\s+(?:I|II|III|IV|V)(?:\s*,\s*(?:I|II|III|IV|V))*\s*$', '', title, flags=re.I)
    return clean(title)

def category_name(text):
    first = clean(text).split('\n')[0]
    return re.sub(r'\s*Competenc(?:y|ies)\s*(?:Level)?\s*:.*$', '', first, flags=re.I).strip(' :-') or 'General'

def is_stop(text):
    return bool(re.search(r'^(Working Relationships|Job Specifications|I acknowledge|Acknowledged\s*:)', clean(text), re.I))

def is_category(row):
    cells = uniq_cells(row)
    if not cells or is_stop(cells[0]): return False
    first = cells[0]
    if re.search(r'Competenc(?:y|ies)\s*(?:Level)?\s*:', first, re.I): return True
    if len(cells) <= 2 and any('%' in cell for cell in cells): return True
    return False

def header_indexes(table):
    for row in table:
        for idx, cell in enumerate(row):
            if re.search(r'COMPETENCIES NEEDED', clean(cell), re.I):
                # Duty is generally the last distinct nonempty cell before frequency.
                return idx, max(1, idx - 2)
    return None, None

def numeric_competency(row, competency_index, applicable):
    values = []
    for cell in row[competency_index + 1:]:
        value = clean(cell)
        if re.fullmatch(r'[1-5]', value): values.append(int(value))
    if not values: return {}
    if len(values) >= len(applicable):
        return dict(zip(applicable, values[-len(applicable):]))
    return {level: values[-1] for level in applicable}

def split_competencies(text):
    lines = [clean(line).strip(' -;') for line in clean(text).split('\n')]
    return [line for line in lines if len(line) > 2]

documents = json.load(open(CORPUS, encoding='utf-8'))
jobs = []
for document in documents:
    current = None
    for table_index, table in enumerate(document.get('tables', [])):
        title_cell = next((cell for row in table[:7] for cell in row if re.search(r'Position Title\s*:', clean(cell), re.I)), '')
        if title_cell:
            source_title = field_from_table(table, 'Position Title', 7)
            title = strip_levels(source_title)
            current = {
                'source': document['source'], 'tableIndex': table_index + 1,
                'sourceTitle': source_title, 'title': title,
                'levels': title_levels(source_title),
                'department': field_from_table(table, 'Department', 5),
                'office': field_from_table(table, 'Office', 5),
                'purpose': field_from_table(table, 'Purpose of the Position', 9),
                'duties': [], 'qualifications': []
            }
            jobs.append(current)
        if not current: continue
        competency_index, duty_index = header_indexes(table)
        if competency_index is None: continue
        category = 'General'
        for row_index, row in enumerate(table):
            cells = uniq_cells(row)
            if not cells: continue
            if is_stop(cells[0]): break
            if is_category(row):
                category = category_name(cells[0])
                continue
            marker = clean(row[0]) if row else ''
            applicable = roman_levels(marker)
            if not applicable: applicable = current['levels']
            applicable = [level for level in applicable if level in current['levels']] or applicable
            duty = ''
            # Find the best duty cell before competency column, skipping the role marker.
            candidates = []
            for idx, cell in enumerate(row[:competency_index]):
                value = clean(cell)
                if value and not re.fullmatch(r'\d+%?', value): candidates.append(value)
            if candidates: duty = max(candidates, key=len)
            competency = clean(row[competency_index]) if competency_index < len(row) else ''
            if not duty or len(duty) < 3: continue
            levels = numeric_competency(row, competency_index, applicable)
            for level in applicable:
                current['duties'].append({'positionLevel': level, 'subject': category, 'description': duty})
                for subject in split_competencies(competency):
                    prof = levels.get(level)
                    current['qualifications'].append({
                        'positionLevel': level, 'subject': subject,
                        'qualificationLevel': f'Required competency level {prof}' if prof else '',
                        'description': f'Competency associated with: {duty}'
                    })

def dedupe(records, keys):
    seen, out = set(), []
    for record in records:
        key = tuple(clean(record.get(k, '')).casefold() for k in keys)
        if key not in seen:
            seen.add(key); out.append(record)
    return out

for job in jobs:
    job['duties'] = dedupe(job['duties'], ['positionLevel', 'subject', 'description'])
    job['qualifications'] = dedupe(job['qualifications'], ['positionLevel', 'subject', 'qualificationLevel', 'description'])

json.dump(jobs, open(OUTPUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(json.dumps({'documents': len(documents), 'logicalJobs': len(jobs), 'duties': sum(len(j['duties']) for j in jobs), 'qualifications': sum(len(j['qualifications']) for j in jobs), 'output': OUTPUT}))
