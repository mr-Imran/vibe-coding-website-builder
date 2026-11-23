// The app's own parts. Each module is one file in this folder that exports
// register(app, deps); list them here.
//
// A module owns: its tables (a file in migrations/), its rules, its routes,
// and its tests (tests/<module>.test.js). Modules use each other's data
// through the database relationships, which is what makes them one system.
//
//   import * as members from './members.js';
//   import * as rooms from './rooms.js';
//   import * as bookings from './bookings.js';
//   const modules = [members, rooms, bookings];

const modules = [];

// Multi-step jobs defined with defineWorkflow(), so that interrupted ones are
// finished or undone when the app starts.
export const workflows = [];

export function registerModules(app, deps) {
  for (const m of modules) m.register(app, deps);
}
