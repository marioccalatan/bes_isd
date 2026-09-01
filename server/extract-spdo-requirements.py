import json
import sys
from docx import Document

table = Document(sys.argv[1]).tables[0]
category = ''
duties = []
qualifications = []
for row in table.rows[6:]:
    cells = [cell.text.strip() for cell in row.cells]
    marker = cells[0]
    if marker.startswith('Working Relationships:'):
        break
    if 'Competency Level:' in marker and not marker.startswith('SPDO'):
        category = marker.split('\n', 1)[0].strip()
        continue
    if not marker.startswith('SPDO') or not cells[1]:
        continue
    duty = cells[1].strip()
    competency_text = cells[4].strip()
    required_levels = cells[7:10]
    for position_level, required in enumerate(required_levels, 1):
        duties.append({'positionLevel': position_level, 'subject': category or 'General Duties', 'description': duty})
        if competency_text:
            subjects = [value.strip(' .') for value in competency_text.split('\n') if value.strip()]
            for subject in subjects:
                qualifications.append({
                    'positionLevel': position_level,
                    'subject': subject,
                    'qualificationLevel': f'Required competency level {required.strip()}' if required.strip() else 'Required competency level not specified',
                    'description': f'Competency associated with: {duty}',
                })
print(json.dumps({'duties': duties, 'qualifications': qualifications}, ensure_ascii=False))
