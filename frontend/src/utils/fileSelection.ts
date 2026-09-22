import type { DragEvent } from 'react';

export const withFirstFile = (
  files: FileList | null | undefined,
  callback: (file: File) => void,
): void => {
  const file = files?.[0];
  if (file) callback(file);
};

export const withFirstDocumentFile = (
  files: FileList | null | undefined,
  callback: (file: File) => void,
): void => {
  withFirstFile(files, (file) => {
    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      callback(file);
    }
  });
};

export const handleFileDrag = (
  event: DragEvent,
  setDragActive: (active: boolean) => void,
): void => {
  event.preventDefault();
  event.stopPropagation();
  if (event.type === 'dragenter' || event.type === 'dragover') {
    setDragActive(true);
  } else if (event.type === 'dragleave') {
    setDragActive(false);
  }
};

export const prepareFileDrop = (
  event: DragEvent,
  setDragActive: (active: boolean) => void,
): void => {
  event.preventDefault();
  event.stopPropagation();
  setDragActive(false);
};
