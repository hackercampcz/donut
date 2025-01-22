export function sortBy(attr, x, { asc } = {}) {
  const direction = asc ? 1 : -1;
  return x.sort((a, b) => a[attr] ? direction * a[attr].localeCompare(b[attr]) : direction);
}
