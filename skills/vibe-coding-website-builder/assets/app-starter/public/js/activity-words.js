// The words the Activity screen uses. This file belongs to the app: add the
// app's own lines here, and leave js/activity.js as it came.
//
// ACTIONS: what a line in the log means, by its action. Add the actions the
// app's modules write with audit() ('booking.cancelled': 'Cancelled a booking').
// A line without words is shown by its action name.
export const ACTIONS = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'A sign-in failed',
  'auth.signup': 'Created their own account',
  'auth.password_changed': 'Changed their own password',
  'auth.denied': 'Tried something their role may not do',
  'access.denied': 'Tried to reach a record that is not theirs',
  'rule.refused': 'Was refused by a rule',
  'user.created': 'Added an account',
  'user.changed': 'Changed an account',
  'user.password_set': 'Set a new password for someone',
  'backup.downloaded': 'Downloaded a backup',
  'seed.loaded': 'Example data was loaded',
};

// RULES: the rule behind a refusal, by the name the code gives it
// (conflict('...', { rule: 'max_upcoming' })). Say what was refused, as the
// owner would put it: 'max_upcoming': 'Already had 2 upcoming bookings'.
// A rule without words is shown by its name.
export const RULES = {
};
