// Hands the viewer a file: the share sheet on an iPhone ("Save to Files"), else a download.
import type { Download } from "../library/upload";

export async function saveFile(file: Download): Promise<void> {
  const blob = new Blob([file.bytes as BlobPart], { type: file.type });
  const shareable = new File([blob], file.fileName, { type: file.type });
  if (navigator.canShare?.({ files: [shareable] })) {
    try {
      await navigator.share({ files: [shareable] });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
