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
