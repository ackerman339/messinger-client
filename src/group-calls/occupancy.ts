let occupied = false;

export function hasGroupCall() {
  return occupied;
}

export function reserveGroupCall() {
  if (occupied) return false;
  occupied = true;
  return true;
}

export function releaseGroupCall() {
  occupied = false;
}
