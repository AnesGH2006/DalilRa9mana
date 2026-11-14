import { useState, useRef } from "react";
import { UploadCloud, FileSpreadsheet, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/language-provider";
import { Card } from "@/components/ui/card";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isUploading: boolean;
}

export function FileUpload({ onFileSelect, isUploading }: FileUploadProps) {
  const { t } = useLanguage();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndSelectFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSelectFile(e.target.files[0]);
    }
  };

  const validateAndSelectFile = (file: File) => {
    const validExtensions = [".xls", ".xlsx"];
    const fileExtension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    
    if (validExtensions.includes(fileExtension)) {
      onFileSelect(file);
    } else {
      // Could show toast here
      console.error("Invalid file type");
    }
  };

  return (
    <Card
      className={`relative overflow-hidden border-2 border-dashed transition-all duration-200 ${
        isDragging 
          ? "border-primary bg-primary/5" 
          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !isUploading && fileInputRef.current?.click()}
      data-testid="upload-dropzone"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        disabled={isUploading}
        data-testid="input-file"
      />
      
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center cursor-pointer">
        {isUploading ? (
          <div className="flex flex-col items-center text-primary">
            <Loader2 className="h-12 w-12 animate-spin mb-4" />
            <h3 className="text-lg font-semibold">{t("analyzing")}</h3>
          </div>
        ) : (
          <>
            <div className="bg-primary/10 p-4 rounded-full mb-4">
              <UploadCloud className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">{t("uploadTitle")}</h3>
            <p className="text-muted-foreground mb-6 max-w-sm">
              {t("uploadDesc")}
            </p>
            <div className="flex items-center text-sm font-medium text-primary bg-primary/5 px-4 py-2 rounded-full">
              <FileSpreadsheet className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
              {t("dragDrop")} <span className="mx-1 text-muted-foreground font-normal">{t("orBrowse")}</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
