export function nowLabel() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function isPositive(value: string) {
  return value.trim().startsWith("+");
}
