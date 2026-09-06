import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { INTAKE_FIELD_LABELS, INTAKE_FIELD_ORDER, type IntakeData } from "@/lib/schema";

// pdfTemplate.tsx — @react-pdf/renderer document for the doctor-ready
// clinical summary (spec §7). Rendered server-side in /api/generate-report.
// Uses react-pdf primitives (View/Text) — NOT HTML elements.

const ACCENT   = "#4FB3BF";
const INK      = "#1e293b";
const MUTED    = "#64748b";
const FAINT    = "#94a3b8";
const HAIRLINE = "#e2e8f0";

const styles = StyleSheet.create({
  page: {
    padding:      48,
    paddingBottom: 72,
    fontSize:     11,
    fontFamily:   "Helvetica",
    color:        INK,
  },
  header: {
    borderBottomWidth:  2,
    borderBottomColor:  ACCENT,
    paddingBottom:      12,
    marginBottom:       14,
  },
  appName: {
    fontSize:    20,
    fontFamily:  "Helvetica-Bold",
    color:       ACCENT,
  },
  subtitle: {
    fontSize:  9,
    color:     MUTED,
    marginTop: 3,
  },
  titleRow: {
    flexDirection:  "row",
    justifyContent: "space-between",
    alignItems:     "flex-end",
    marginBottom:   6,
  },
  docTitle: {
    fontSize:   13,
    fontFamily: "Helvetica-Bold",
  },
  timestamp: {
    fontSize: 9,
    color:    MUTED,
  },
  disclaimer: {
    fontSize:         9,
    color:            MUTED,
    marginBottom:     14,
    fontStyle:        "italic",
  },
  sectionTitle: {
    fontSize:          8.5,
    fontFamily:        "Helvetica-Bold",
    color:             ACCENT,
    textTransform:     "uppercase",
    letterSpacing:     1.2,
    marginTop:         14,
    marginBottom:      8,
    paddingBottom:     3,
    borderBottomWidth: 0.5,
    borderBottomColor: HAIRLINE,
  },
  summaryText: {
    fontSize:    11,
    lineHeight:  1.6,
    color:       INK,
  },
  row: { marginBottom: 9 },
  label: {
    fontSize:    8,
    color:       MUTED,
    marginBottom: 2,
  },
  value: { fontSize: 11 },
  footer: {
    position:         "absolute",
    bottom:           28,
    left:             48,
    right:            48,
    textAlign:        "center",
    fontSize:         8,
    color:            FAINT,
    borderTopWidth:   0.5,
    borderTopColor:   HAIRLINE,
    paddingTop:       8,
  },
});

export function formatGeneratedAt(date: Date): string {
  return `${date.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  })}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function IntakePdfDocument({
  data,
  clinicalSummary,
  patientName,
  generatedAt,
}: {
  data:            IntakeData;
  clinicalSummary: string;
  patientName:     string;
  generatedAt:     string;
}) {
  return (
    <Document
      title={`Patient Intake Report — ${patientName}`}
      author="NoQueue Health"
      creator="NoQueue Health"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* Letterhead */}
        <View style={styles.header} fixed>
          <Text style={styles.appName}>NoQueue Health</Text>
          <Text style={styles.subtitle}>Patient-Reported Intake Summary — For Clinical Review</Text>
        </View>

        {/* Title row */}
        <View style={styles.titleRow}>
          <Text style={styles.docTitle}>Patient Intake Report</Text>
          <Text style={styles.timestamp}>Generated: {generatedAt}</Text>
        </View>
        <Text style={styles.disclaimer}>
          Generated from patient self-report via AI intake. Not a diagnosis. For review by a licensed clinician.
        </Text>

        {/* Clinical summary */}
        <Text style={styles.sectionTitle}>Clinical Summary</Text>
        <Text style={styles.summaryText}>{clinicalSummary}</Text>

        {/* Structured fields */}
        <Text style={styles.sectionTitle}>Structured Intake Data</Text>
        {INTAKE_FIELD_ORDER.map((key) => (
          <View key={key} style={styles.row} wrap={false}>
            <Text style={styles.label}>{INTAKE_FIELD_LABELS[key]}</Text>
            <Text style={styles.value}>
              {data[key]?.trim() || "Not provided"}
            </Text>
          </View>
        ))}

        {/* Footer */}
        <Text style={styles.footer} fixed>
          NoQueue Health — AI intake self-report. Not a medical record. Review by a licensed clinician required.
        </Text>
      </Page>
    </Document>
  );
}
