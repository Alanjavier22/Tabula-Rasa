export const withFirstFile = (
  files: FileList | null | undefined,
  callback: (file: File) => void,
): void => {
  const file = files?.[0];
  if (file) callback(file);
};
