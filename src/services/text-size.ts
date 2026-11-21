import { offlineStorage } from './offline-storage';

export const TEXT_SIZES = [
  { value: 'normal', label: 'Normal', scale: 1 },
  { value: 'medium', label: 'Mediano', scale: 1.125 },
  { value: 'large', label: 'Grande', scale: 1.25 },
  { value: 'extra-large', label: 'Extra grande', scale: 1.5 },
] as const;

const key = 'text-size';
type TextSize = (typeof TEXT_SIZES)[number];

const storedSize = offlineStorage.read(key);
let preference = TEXT_SIZES.find(({ value }) => value === storedSize) ?? TEXT_SIZES[0];

export function getTextSize() {
  return preference.value;
}

export function applyTextSize() {
  document.documentElement.style.setProperty('--text-scale', String(preference.scale));
}

export function setTextSize(size: TextSize) {
  preference = size;
  applyTextSize();
  offlineStorage.write(key, size.value);
}
