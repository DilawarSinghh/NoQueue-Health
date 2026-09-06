/**
 * Single-hospital constants for this deployment.
 *
 * Source: vmmc-sjh.mohfw.gov.in/medical-departments
 * Note: verify department names against the official site before final launch —
 * hospital websites do update their listings.
 */

export const HOSPITAL_NAME = "Safdarjung Hospital, New Delhi";

export const HOSPITAL_ADDRESS =
  "Vardhman Mahavir Medical College & Safdarjung Hospital, Ring Road, " +
  "Safdarjung Enclave, New Delhi - 110029 (Near AIIMS Metro Station)";

export const HOSPITAL_PHONE = "011-2616 5060";

// Full clinical department list as published on vmmc-sjh.mohfw.gov.in/medical-departments
export const DEPARTMENTS = [
  "Anaesthesia and Intensive Care",
  "Anatomy",
  "Biochemistry",
  "Blood Centre and Transfusion Medicine",
  "Burns, Plastic and Maxillofacial Surgery",
  "Cancer Surgery",
  "Cardio Thoracic and Vascular Surgery (CTVS)",
  "Cardiology",
  "Central Institute of Orthopaedics (CIO)",
  "Community Medicine",
  "Critical Care Medicine",
  "Dental Surgery",
  "Dermatology and STD",
  "Emergency Medicine",
  "Endocrinology",
  "ENT (Ear, Nose, and Throat)",
  "Forensic Medicine and Toxicology",
  "Haematology",
  "Medical Oncology",
  "Medicine",
  "Microbiology",
  "Nephrology and Renal Transplant Medicine",
  "Neurology",
  "Neurosurgery",
  "Nuclear Medicine",
  "Obstetrics and Gynaecology",
  "Ophthalmology",
  "Paediatric Surgery",
  "Paediatrics",
  "Pathology",
  "Pharmacology",
  "Physical Medicine and Rehabilitation (PMR)",
  "Physiology",
  "Psychiatry",
  "Pulmonary Medicine",
  "Radiation Oncology",
  "Radiodiagnosis and Interventional Radiology",
  "Sports Injury Centre (SIC)",
  "Surgery",
  "Urology and Renal Transplant",
] as const;

export type Department = (typeof DEPARTMENTS)[number];
