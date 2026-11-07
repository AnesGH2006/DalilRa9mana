/**
 * document_drafting_tool — generates official administrative documents.
 * Returns a structured document (title, body, metadata) stored server-side
 * and reachable via a download URL.
 */
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer, BorderStyle } from "docx";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { SchoolStage } from "../../../shared/school-stage.js";

export interface DocumentDraftingInput {
  document_type: "letter" | "report" | "notice" | "warning" | "meeting_report" | "certificate" | "summary";
  title: string;
  body: string;
  recipient?: string;
  sender?: string;
  date?: string;
  school_name?: string;
  reference_number?: string;
  footer_note?: string;
}

// Arabic document header block
function makeHeader(input: DocumentDraftingInput, date: string, schoolTypeLabel: string): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "الجمهورية الجزائرية الديمقراطية الشعبية", bold: true, size: 22, font: "Arial" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "وزارة التربية الوطنية", bold: true, size: 22, font: "Arial" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: input.school_name || `${schoolTypeLabel} —`, bold: true, size: 24, font: "Arial" })],
    }),
    new Paragraph({ children: [new TextRun({ text: "" })] }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: `المرجع: ${input.reference_number || "—"}`, size: 20, font: "Arial" })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: `التاريخ: ${date}`, size: 20, font: "Arial" })],
    }),
    new Paragraph({ children: [new TextRun({ text: "" })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: input.title, bold: true, size: 28, font: "Arial" })],
    }),
    new Paragraph({ children: [new TextRun({ text: "" })] }),
  ];
}

export async function documentDraftingTool(input: DocumentDraftingInput, userId: string, stage: SchoolStage): Promise<unknown> {
  const schoolTypeLabel = stage === "lycee" ? "ثانوية" : "متوسطة";
  const directorLabel = stage === "lycee" ? "مدير الثانوية" : "مدير المتوسطة";
  const date = input.date || new Date().toLocaleDateString("ar-DZ", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Split body into paragraphs
  const bodyParagraphs = input.body.split("\n").map(line =>
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: line || " ", size: 22, font: "Arial" })],
      spacing: { after: 120 },
    })
  );

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
        },
      },
      children: [
        ...makeHeader(input, date, schoolTypeLabel),
        ...(input.recipient ? [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `إلى السيد/ة: ${input.recipient}`, bold: true, size: 22, font: "Arial" })],
          }),
          new Paragraph({ children: [new TextRun({ text: "" })] }),
        ] : []),
        ...bodyParagraphs,
        new Paragraph({ children: [new TextRun({ text: "" })] }),
        ...(input.footer_note ? [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: input.footer_note, italics: true, size: 18, font: "Arial", color: "888888" })],
          }),
        ] : []),
        new Paragraph({ children: [new TextRun({ text: "" })] }),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [new TextRun({ text: input.sender || directorLabel, bold: true, size: 20, font: "Arial" })],
        }),
      ],
    }],
  });

  // Save to /tmp/documents/
  const docDir = join(process.cwd(), "tmp", "documents");
  if (!existsSync(docDir)) mkdirSync(docDir, { recursive: true });

  const fileId = randomUUID();
  const fileName = `doc_${fileId}.docx`;
  const filePath = join(docDir, fileName);

  const buffer = await Packer.toBuffer(doc);
  writeFileSync(filePath, buffer);

  return {
    success: true,
    document_id: fileId,
    file_name: `${input.title}.docx`,
    download_url: `/api/documents/download/${fileId}`,
    preview: {
      title: input.title,
      type: input.document_type,
      date,
      recipient: input.recipient,
      body_preview: input.body.slice(0, 300) + (input.body.length > 300 ? "..." : ""),
    },
    message: `تم إنشاء الوثيقة بنجاح: "${input.title}". يمكن تحميلها من الرابط أعلاه.`,
  };
}
