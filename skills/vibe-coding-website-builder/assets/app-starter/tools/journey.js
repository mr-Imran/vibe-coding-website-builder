// Go through the app the way a person does, in a real browser without a
// window: sign in, type into fields, press buttons, answer questions, and
// read what the page says back. The tests prove the routes; this proves that
// the buttons are wired to them.
//
//   node tools/journey.js
//
// REPLACE the steps below with this app's own main journey for each kind of
// user (section 3 of the guide: "a member signs up, finds a class, books a
// place; the teacher sees the list; the member cancels and the place opens up
// again"). Keep one step per thing a person would notice, and end each step
// by checking what they would see. What a step can do is listed at the top of
// tools/browser.js.
//
// It runs on a throw-away copy with the example data from tools/seed.js, so
// the people in it are the example accounts: app.signIn('member') is
// member@example.com. Exit status: 0 every step worked, 1 a step failed (it
// says which, why, and saves a picture), 2 it could not run (no browser).
//
// The steps here are the starter's own: they use only the screens that came
// with it, and they pass on an app that has not changed those screens.

import { withApp } from './browser.js';

await withApp(async (app) => {
  const top = app.accounts[0];                       // the first role in config.js: the people who run the app
  const newcomer = { name: 'Journey Person', email: 'journey.person@example.org', password: 'a first password 1' };

  await app.step('Someone who runs the app signs in and reaches the home page', async () => {
    await app.signIn(top);
    await app.see(top.name);
  });

  await app.step('They add a person, and the list shows the new person', async () => {
    await app.go('/people');
    await app.fillIn('Name', newcomer.name);
    await app.fillIn('Email', newcomer.email);
    await app.fillIn('First password', newcomer.password);
    await app.press('Add person');
    await app.see(`${newcomer.name} was added.`);
    await app.fillIn('Search', 'Journey');
    await app.see(newcomer.email);
  });

  await app.step('Sending the form empty is refused, with the reason beside the field', async () => {
    await app.press('Add person');
    await app.see('Name is needed.');
  });

  await app.step('Switching the account off asks first, and "no" changes nothing', async () => {
    await app.fillIn(`${newcomer.name} can sign in`, false);
    await app.see(`Switch off ${newcomer.name}'s account?`);
    await app.answer('No, go back');
    if (await app.js('Boolean(document.querySelector("dialog[open]"))')) throw new Error('the question is still open');
    if (!(await app.js(`document.querySelector('[aria-label="${newcomer.name} can sign in"]').checked`))) throw new Error('the account was switched off although the answer was no');
  });

  await app.step('Answering "yes" switches it off, and the page says so', async () => {
    await app.fillIn(`${newcomer.name} can sign in`, false);
    await app.answer('Switch it off');
    await app.see(`${newcomer.name} can no longer sign in.`);
  });

  await app.step('The person who was switched off cannot sign in', async () => {
    await app.signOut();
    await app.fillIn('Email', newcomer.email);
    await app.fillIn('Password', newcomer.password);
    await app.press('Sign in');
    await app.see('The email or password is not right.');
  });

  await app.step('The failed sign-in is on the Activity screen, marked as refused', async () => {
    await app.signIn(top);
    await app.go('/activity');
    await app.fillIn('Refused attempts only', true);
    await app.see('A sign-in failed');
    await app.see(newcomer.email);
  });

  await app.step('After signing out, the Back button does not bring the page back', async () => {
    await app.signOut();
    await app.back();
    await app.notSee(newcomer.email);
    if (!(await app.where()).startsWith('/login')) throw new Error(`Back led to ${await app.where()}`);
  });
});
