/** « Ouvert 24h/24 » (shops): a single service from midnight to midnight; orders are taken at any time. */
export const ALL_DAY = [{ start: '00:00', end: '24:00' }];
export const isAllDay = (services: { start: string; end: string }[]) => services.length === 1 && services[0]!.start === '00:00' && services[0]!.end === '24:00';
