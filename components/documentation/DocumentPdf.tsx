import { Document, Page, StyleSheet, Text, View, Image } from "@react-pdf/renderer";
import type {
  DocumentFormData,
  DocumentTemplate,
} from "@/lib/documentation/types";
import { formatFieldValue } from "@/lib/documentation/format";

// DocumentPdf.tsx — @react-pdf/renderer document for a filled hospital
// document template. Rendered server-side in /api/documentation/generate.
// Uses react-pdf primitives (View/Text/Image) — NOT HTML elements, and this
// file must never carry a "use client" directive.

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
    fontSize:     9,
    color:        MUTED,
    marginBottom: 14,
    fontStyle:    "italic",
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
  row: { marginBottom: 9 },
  label: {
    fontSize:    8,
    color:       MUTED,
    marginBottom: 2,
  },
  value: { fontSize: 11, lineHeight: 1.5 },
  signature: {
    width: 180,
    height: 64,
    objectFit: "contain",
  },
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

export function DocumentPdf({
  template,
  data,
  patientName,
  generatedAt,
}: {
  template: DocumentTemplate;
  data: DocumentFormData;
  patientName: string;
  generatedAt: string;
}) {
  return (
    <Document
      title={`${template.name} — ${patientName}`}
      author="NoQueue Health"
      creator="NoQueue Health"
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.appName}>NoQueue Health</Text>
          <Text style={styles.subtitle}>Hospital Documentation — For Clinical Review</Text>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.docTitle}>{template.name}</Text>
          <Text style={styles.timestamp}>Generated: {generatedAt}</Text>
        </View>
        <Text style={styles.disclaimer}>
          Patient-completed digital form (v{template.version}). Review by a
          licensed clinician required before clinical use.
        </Text>

        {template.sections.map((section) => (
          <View key={section.id} wrap={false}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.fields.map((field) => {
              const raw = data[field.id];
              const isSignatureImage =
                field.type === "signature" &&
                typeof raw === "string" &&
                raw.startsWith("data:image");
              return (
                <View key={field.id} style={styles.row} wrap={false}>
                  <Text style={styles.label}>{field.label}</Text>
                  {isSignatureImage ? (
                    // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt; label precedes it
                    <Image src={raw as string} style={styles.signature} />
                  ) : (
                    <Text style={styles.value}>{formatFieldValue(field, raw)}</Text>
                  )}
                </View>
              );
            })}
          </View>
        ))}

        <Text style={styles.footer} fixed>
          NoQueue Health — generated from patient self-report. Not a medical record. Review by a licensed clinician required.
        </Text>
      </Page>
    </Document>
  );
}
