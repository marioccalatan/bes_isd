"""Read the supplied form export without changing it. Write a private JSON import payload."""
import datetime
import json
import pathlib
import sys
import openpyxl

source, destination = map(pathlib.Path, sys.argv[1:3])
workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
sheet = workbook['Form Responses 1']
rows = list(sheet.values)
headers = [str(value).strip() for value in rows[0]]
expected = ['Timestamp', 'NAME (Surname, First Name, Middle Name)', 'Date of Birth', 'AGE', 'PLACE OF BIRTH', 'GENDER AT BIRTH', 'CIVIL STATUS', 'HEIGHT', 'WEIGHT', 'UMID ID NO', 'PAG-IBIG ID NO', 'PHILHEALTH NO', 'TIN', 'CITIZENSHIP', 'RESIDENTIAL ADDRESS', 'PERMANENT ADDRESS', 'MOBILE NUMBER', 'E-MAIL ADDRESS', 'NAME OF SPOUSE (Surname, First Name, Middle Name)', 'OCCUPATION', 'EMPLOYER/ BUSINESS NAME', 'NAME OF CHILDREN  ( Surname, First Name, Middle Name)', 'GRADUATE STUDIES ( Degree/ Name of School/ Year Graduated)', 'COLLEGE ( Degree/ Name of School/ Year Graduated)', 'VOCATIONAL( Degree/ Name of School/ Year Graduated)', 'SECONDARY ( High School Track / Strand/ Name of School/ Year Graduated)', 'ELEMENTARY ( Name of School/ Year Graduated)', 'ELIGIBILITY 1/  PROFESSIONAL LICENSE 1', 'ELIGIBILITY 2/  PROFESSIONAL LICENSE 2', 'WORK EXPERIENCE 1', 'WORK EXPERIENCE 2', 'WORK EXPERIENCE 3', 'WORK EXPERIENCE 4', 'APPLICATION LETTER', 'RESUME', 'TRANSCRIPT OF RECORDS', 'LICENSES', 'CERTIFICATES', 'By checking this box']
if headers != expected:
    raise ValueError('Workbook columns differ from the reviewed application form.')

def text(value):
    if value is None:
        return ''
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()

keys = ['submittedAt', 'originalFullName', 'birthDate', 'ageAtApplication', 'birthPlace', 'sex', 'civilStatus', 'height', 'weight', 'umidNo', 'pagIbigNo', 'philhealthNo', 'tin', 'citizenship', 'address', 'permanentAddress', 'mobileNo', 'email', 'spouseName', 'spouseOccupation', 'spouseEmployer', 'childrenNames', 'graduateStudies', 'college', 'vocational', 'secondary', 'elementary', 'eligibility1', 'eligibility2', 'workExperience1', 'workExperience2', 'workExperience3', 'workExperience4', 'applicationLetterLinks', 'resumeLinks', 'transcriptLinks', 'licenseLinks', 'certificateLinks', 'certification']
records = []
for number, row in enumerate(rows[1:], 2):
    if not any(value is not None for value in row):
        continue
    record = dict(zip(keys, map(text, row)))
    record['birthDate'] = record['birthDate'][:10]
    record['sex'] = record['sex'].title()
    record['civilStatus'] = record['civilStatus'].title()
    name = record['originalFullName']
    parts = [part.strip() for part in name.split(',')]
    # Two-part comma names do not reliably separate compound given names from middle names.
    # Keep the complete given-name portion rather than guessing; retain the original too.
    if len(parts) >= 2:
        record.update(lastName=parts[0], firstName=parts[1], middleName=', '.join(parts[2:]))
    else:
        given, surname = name.rsplit(' ', 1)
        record.update(lastName=surname, firstName=given, middleName='')
    record.update(suffix='', positionApplying='Accounting Associate', applicationSource='Online Application Form')
    records.append({'row': number, 'profile': record, 'raw': dict(zip(headers, map(text, row)))})
payload = {'sourceFile': source.name, 'sheet': sheet.title, 'records': records}
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
print(json.dumps({'rows': len(records), 'columns': len(headers), 'output': str(destination)}))
