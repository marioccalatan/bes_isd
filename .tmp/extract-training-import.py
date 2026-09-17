import json
from datetime import datetime, date
from pathlib import Path
import openpyxl

book = openpyxl.load_workbook(r'C:\Users\mario\Desktop\Training_Seminar_Summary.xlsx', read_only=True, data_only=True)
result = {}
for sheet_name, header_row in [('TRAINING_SEMINAR', 7), ('Source rows', 7), ('Rows without titles', 6)]:
    rows = list(book[sheet_name].values)
    headers = rows[header_row - 1]
    result[sheet_name] = [dict(zip(headers, row)) for row in rows[header_row:] if any(value is not None for value in row)]
Path('.tmp/training-import-source.json').write_text(json.dumps(result, ensure_ascii=False, default=lambda value: value.isoformat()[:10] if isinstance(value, (datetime, date)) else str(value)), encoding='utf-8')
print({key: len(value) for key, value in result.items()})
