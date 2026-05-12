export function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

export function diffWholeSeconds(laterDate, earlierDate) {
  return Math.max(0, Math.floor((laterDate.getTime() - earlierDate.getTime()) / 1000));
}
