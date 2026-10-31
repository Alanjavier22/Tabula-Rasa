const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const MONTH_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

export const formatMonthLabel = (value: string) => {
  const [year, month] = value.split('-');
  const monthIndex = Number.parseInt(month, 10) - 1;
  return `${MONTH_NAMES[monthIndex] ?? month} de ${year}`;
};

export const formatMonthShort = (value: string) => {
  const [year, month] = value.split('-');
  const monthIndex = Number.parseInt(month, 10) - 1;
  return `${MONTH_SHORT[monthIndex] ?? month} ${year?.slice(2) ?? ''}`;
};

export const formatUSD = (num: number) =>
  num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

