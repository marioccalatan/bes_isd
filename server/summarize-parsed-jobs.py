import json
import sys

jobs = json.load(open(sys.argv[1], encoding='utf-8'))
for index, job in enumerate(jobs, 1):
    print(f"{index:02d}|{job['source']}|{job['title']}|{job['department']}|{job['office']}|D{len(job['duties'])} Q{len(job['qualifications'])}")
