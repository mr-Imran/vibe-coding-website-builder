// Times of day where the business is.
//
// Store every moment in UTC (now() in db.js). But rules are about the clock
// on the wall: "the 9 o'clock class", "open Monday to Friday", "no bookings
// after 6 pm the day before". These two functions convert between a stored
// moment and the local day and time in config.timeZone, including summer
// time, with nothing but what Node has built in.
//
// In rules, take the current moment from config.now(), never from
// new Date() directly, so that a test can set the clock:
//   const t = await startApp({ config: { now: () => new Date('2026-03-02T08:55:00Z') } });

// A stored moment -> what the wall clock shows there.
//   localParts(new Date('2026-07-01T08:00:00Z'), 'Europe/London')
//   -> { day: '2026-07-01', time: '09:00', weekday: 3 }      weekday: 1 = Monday ... 7 = Sunday
export function localParts(date, timeZone = 'UTC') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday };
}

// A local day and time -> the moment to store.
//   zonedToUtc('2026-07-01', '09:00', 'Europe/London') -> Date 2026-07-01T08:00:00Z
// For a time that does not exist (the hour skipped when clocks go forward) it
// returns the moment just after the jump; for a time that happens twice, the
// first of the two.
export function zonedToUtc(day, time, timeZone = 'UTC') {
  const wanted = Date.parse(`${day}T${time}:00Z`);
  if (Number.isNaN(wanted)) throw new Error(`Not a valid day and time: ${day} ${time}`);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const shown = localParts(new Date(guess), timeZone);
    const diff = wanted - Date.parse(`${shown.day}T${shown.time}:00Z`);
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}
