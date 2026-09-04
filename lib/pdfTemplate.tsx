import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  FIELD_LABELS,
  type IntakeField,
  type PatientIntake,
} from "@/lib/schema";

// pdfTemplate.tsx — @react-pdf/renderer document for the doctor-ready intake
// form (spec §4). Rendered server-side inside /api/generate-pdf.
//
// NOTE: uses react-pdf primitives (View/Text), NOT HTML. @react-pdf/renderer
// is an external server package (next.config.mjs).

const ACCENT = "#4FB3BF";
const INK = "#1e293b";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const HAIRLINE = "#e2e8f0";

const styles = StyleSheet.create({
  page: {
    padding: 48,
    paddingBottom: 64,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: INK,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
    paddingBottom: 12,
  },
  clinic: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
  },
  subtitle: {
    fontSize: 9,
    color: MUTED,
    marginTop: 3,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 14,
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
  },
  timestamp: {
    fontSize: 9,
    color: MUTED,
  },
  intro: {
    fontSize: 9,
    color: MUTED,
    marginBottom: 10,
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: HAIRLINE,
  },
  row: {
    marginBottom: 9,
  },
  label: {
    fontSize: 8,
    color: MUTED,
    marginBottom: 2,
  },
  value: {
    fontSize: 11,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    textAlign: "center",
    fontSize: 8,
    color: FAINT,
    borderTopWidth: 0.5,
    borderTopColor: HAIRLINE,
    paddingTop: 8,
  },
});

/** Section groupings for the PDF layout. */
const SECTIONS: { title: string; fields: IntakeField[] }[] = [
  {
    title: "Patient details",
    fields: [
      "patientName",
      "age",
      "gender",
      "contactNumber",
      "address",
    ],
  },
  {
    title: "Visit",
    fields: ["doctorOrDepartment", "chiefComplaint"],
  },
  {
    title: "Medical background",
    fields: [
      "knownAllergies",
      "currentMedications",
      "pastMedicalHistory",
    ],
  },
  {
    title: "Insurance",
    fields: ["insuranceProvider", "insuranceId"],
  },
  {
    title: "Emergency contact",
    fields: ["emergencyContactName", "emergencyContactNumber"],
  },
];

function fieldValue(data: PatientIntake, key: IntakeField): string {
  const value = data[key];
  if (value === undefined || String(value).trim() === "") {
    return "Not provided";
  }
  if (key === "age") return `${value} years`;
  return String(value);
}

/** Human-readable timestamp used in the PDF header. */
export function formatGeneratedAt(date: Date): string {
  return `${date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}, ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function IntakePdfDocument({
  data,
  clinicName,
  generatedAt,
}: {
  data: PatientIntake;
  clinicName: string;
  generatedAt: string;
}) {
  return (
    <Document
      title={`Patient Intake Form — ${data.patientName}`}
      author={clinicName}
      creator="Scriba"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* Letterhead */}
        <View style={styles.header} fixed>
          <Text style={styles.clinic}>{clinicName}</Text>
          <Text style={styles.subtitle}>Patient Intake Information</Text>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Patient Intake Form</Text>
          <Text style={styles.timestamp}>Generated: {generatedAt}</Text>
        </View>
        <Text style={styles.intro}>
          Details below were self-reported by the patient or their family
          member and verified by them before submission.
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.fields.map((key) => (
              <View key={key} style={styles.row} wrap={false}>
                <Text style={styles.label}>{FIELD_LABELS[key]}</Text>
                <Text style={styles.value}>{fieldValue(data, key)}</Text>
              </View>
            ))}
          </View>
        ))}

        {/* Footer note — spec §4 */}
        <Text
          style={styles.footer}
          fixed
        >
          Generated via Scriba — verified by patient/family.
        </Text>
      </Page>
    </Document>
  );
}

