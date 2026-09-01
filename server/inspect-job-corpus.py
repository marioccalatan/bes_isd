import json
import sys

documents = json.load(open(sys.argv[1], encoding='utf-8'))
needles = [value.lower() for value in sys.argv[2:]]
for document in documents:
    if needles and not any(needle in document['source'].lower() for needle in needles):
        continue
    print(f"\n===== {document['source']} =====")
    for table_index, table in enumerate(document.get('tables', [])):
        print(f"--- TABLE {table_index + 1}: {len(table)} rows ---")
        for row_index, row in enumerate(table):
            cells = [f"[{index}] {value[:240]}" for index, value in enumerate(row) if value]
            print(f"R{row_index}: " + " | ".join(cells))
