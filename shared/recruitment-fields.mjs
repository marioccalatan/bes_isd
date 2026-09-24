// Shared by the applicant form, API, migration, and importer.
export const recruitmentFields = [
  {
    "key": "submittedAt",
    "column": "submitted_at",
    "label": "Original Submission Date",
    "section": "Source",
    "input": "date"
  },
  {
    "key": "originalFullName",
    "column": "original_full_name",
    "label": "Full Name as Submitted",
    "section": "Source",
    "input": "text"
  },
  {
    "key": "ageAtApplication",
    "column": "age_at_application",
    "label": "Age at Application",
    "section": "Personal Details",
    "input": "text"
  },
  {
    "key": "birthPlace",
    "column": "birth_place",
    "label": "Place of Birth",
    "section": "Personal Details",
    "input": "text"
  },
  {
    "key": "height",
    "column": "height",
    "label": "Height (as reported)",
    "section": "Personal Details",
    "input": "text"
  },
  {
    "key": "weight",
    "column": "weight",
    "label": "Weight (as reported)",
    "section": "Personal Details",
    "input": "text"
  },
  {
    "key": "citizenship",
    "column": "citizenship",
    "label": "Citizenship",
    "section": "Personal Details",
    "input": "text"
  },
  {
    "key": "permanentMunicipality",
    "column": "permanent_municipality",
    "label": "Permanent Municipality",
    "section": "Personal Details",
    "input": "text"
  },
  {
    "key": "permanentBarangay",
    "column": "permanent_barangay",
    "label": "Permanent Barangay",
    "section": "Personal Details",
    "input": "text"
  },
  {
    "key": "permanentAddress",
    "column": "permanent_address",
    "label": "Permanent Address",
    "section": "Personal Details",
    "input": "text"
  },
  {
    "key": "umidNo",
    "column": "umid_no",
    "label": "UMID ID Number",
    "section": "Government IDs",
    "input": "text"
  },
  {
    "key": "pagIbigNo",
    "column": "pag_ibig_no",
    "label": "Pag-IBIG ID Number",
    "section": "Government IDs",
    "input": "text"
  },
  {
    "key": "philhealthNo",
    "column": "philhealth_no",
    "label": "PhilHealth Number",
    "section": "Government IDs",
    "input": "text"
  },
  {
    "key": "tin",
    "column": "tin",
    "label": "TIN",
    "section": "Government IDs",
    "input": "text"
  },
  {
    "key": "spouseName",
    "column": "spouse_name",
    "label": "Spouse’s Full Name",
    "section": "Family Information",
    "input": "text"
  },
  {
    "key": "spouseOccupation",
    "column": "spouse_occupation",
    "label": "Spouse’s Occupation",
    "section": "Family Information",
    "input": "text"
  },
  {
    "key": "spouseEmployer",
    "column": "spouse_employer",
    "label": "Spouse’s Employer / Business",
    "section": "Family Information",
    "input": "text"
  },
  {
    "key": "childrenNames",
    "column": "children_names",
    "label": "Children’s Names",
    "section": "Family Information",
    "input": "textarea"
  },
  {
    "key": "graduateStudies",
    "column": "graduate_studies",
    "label": "Graduate Studies",
    "section": "Education History",
    "input": "textarea"
  },
  {
    "key": "graduateStudiesGraduationMonth",
    "column": "graduate_studies_grad_month",
    "label": "Graduate Studies Graduation Month",
    "section": "Education History",
    "input": "select-month"
  },
  {
    "key": "graduateStudiesGraduationYear",
    "column": "graduate_studies_grad_year",
    "label": "Graduate Studies Graduation Year",
    "section": "Education History",
    "input": "select-year"
  },
  {
    "key": "college",
    "column": "college",
    "label": "College",
    "section": "Education History",
    "input": "textarea"
  },
  {
    "key": "collegeGraduationMonth",
    "column": "college_grad_month",
    "label": "College Graduation Month",
    "section": "Education History",
    "input": "select-month"
  },
  {
    "key": "collegeGraduationYear",
    "column": "college_grad_year",
    "label": "College Graduation Year",
    "section": "Education History",
    "input": "select-year"
  },
  {
    "key": "vocational",
    "column": "vocational",
    "label": "Vocational",
    "section": "Education History",
    "input": "textarea"
  },
  {
    "key": "vocationalGraduationMonth",
    "column": "vocational_grad_month",
    "label": "Vocational Graduation Month",
    "section": "Education History",
    "input": "select-month"
  },
  {
    "key": "vocationalGraduationYear",
    "column": "vocational_grad_year",
    "label": "Vocational Graduation Year",
    "section": "Education History",
    "input": "select-year"
  },
  {
    "key": "secondary",
    "column": "secondary",
    "label": "Secondary",
    "section": "Education History",
    "input": "textarea"
  },
  {
    "key": "secondaryGraduationMonth",
    "column": "secondary_grad_month",
    "label": "Secondary Graduation Month",
    "section": "Education History",
    "input": "select-month"
  },
  {
    "key": "secondaryGraduationYear",
    "column": "secondary_grad_year",
    "label": "Secondary Graduation Year",
    "section": "Education History",
    "input": "select-year"
  },
  {
    "key": "elementary",
    "column": "elementary",
    "label": "Elementary",
    "section": "Education History",
    "input": "textarea"
  },
  {
    "key": "elementaryGraduationMonth",
    "column": "elementary_grad_month",
    "label": "Elementary Graduation Month",
    "section": "Education History",
    "input": "select-month"
  },
  {
    "key": "elementaryGraduationYear",
    "column": "elementary_grad_year",
    "label": "Elementary Graduation Year",
    "section": "Education History",
    "input": "select-year"
  },
  {
    "key": "eligibility1",
    "column": "eligibility_1",
    "label": "Eligibility / Professional License 1",
    "section": "Eligibility and Experience",
    "input": "textarea"
  },
  {
    "key": "eligibility2",
    "column": "eligibility_2",
    "label": "Eligibility / Professional License 2",
    "section": "Eligibility and Experience",
    "input": "textarea"
  },
  {
    "key": "workExperience1",
    "column": "work_experience_1",
    "label": "Work Experience 1",
    "section": "Eligibility and Experience",
    "input": "textarea"
  },
  {
    "key": "workExperience2",
    "column": "work_experience_2",
    "label": "Work Experience 2",
    "section": "Eligibility and Experience",
    "input": "textarea"
  },
  {
    "key": "workExperience3",
    "column": "work_experience_3",
    "label": "Work Experience 3",
    "section": "Eligibility and Experience",
    "input": "textarea"
  },
  {
    "key": "workExperience4",
    "column": "work_experience_4",
    "label": "Work Experience 4",
    "section": "Eligibility and Experience",
    "input": "textarea"
  },
  {
    "key": "applicationLetterLinks",
    "column": "application_letter_links",
    "label": "Application Letter Links",
    "section": "Supporting Documents",
    "input": "textarea"
  },
  {
    "key": "resumeLinks",
    "column": "resume_links",
    "label": "Resume Links",
    "section": "Supporting Documents",
    "input": "textarea"
  },
  {
    "key": "transcriptLinks",
    "column": "transcript_links",
    "label": "Transcript of Records Links",
    "section": "Supporting Documents",
    "input": "textarea"
  },
  {
    "key": "licenseLinks",
    "column": "license_links",
    "label": "License Links",
    "section": "Supporting Documents",
    "input": "textarea"
  },
  {
    "key": "certificateLinks",
    "column": "certificate_links",
    "label": "Certificate Links",
    "section": "Supporting Documents",
    "input": "textarea"
  },
  {
    "key": "certification",
    "column": "certification",
    "label": "Applicant Certification",
    "section": "Certification",
    "input": "textarea"
  }
];
