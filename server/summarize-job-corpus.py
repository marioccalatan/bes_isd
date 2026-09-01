import json
import re
import sys

documents = json.load(open(sys.argv[1], encoding='utf-8'))
for document in documents:
    print(f"\n{document['source']}")
    for index, table in enumerate(document.get('tables', []), 1):
        title = next((cell for row in table[:5] for cell in row if re.search(r'Position Title:', cell, re.I)), '')
        purpose = next((cell for row in table[:8] for cell in row if re.search(r'Purpose of the Position:', cell, re.I)), '')
        print(f"  T{index}: {title[:180] or '(no position title)'}")
        if purpose:
            print(f"      {purpose[:180]}")
