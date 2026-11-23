// Working out a plan under rules: who gets which shift, which booking goes in
// which room, which driver takes which delivery. Finds the best plan that
// breaks no rule, and when no such plan exists, says which rules are in the
// way instead of saving a broken plan or failing without a reason.
//
// It is an exact search (it tries the combinations, cleverly), not a guess,
// so the same input always gives the same answer and the answer can be
// checked by hand.

//   const result = solveAssignment({
//     items:   shifts,                       // the things that each need one option
//     options: staff,                        // the things they can be given
//     rules: [                               // each returns true, or a sentence saying why not
//       (shift, person) => person.skills.includes(shift.skill) || `${person.name} is not trained for ${shift.skill}`,
//       (shift, person, plan) => hoursOf(person, plan) + shift.hours <= person.maxHours || `${person.name} would exceed ${person.maxHours} hours`,
//     ],
//     cost: (shift, person, plan) => person.hourlyRate * shift.hours,   // optional: lower is better
//     label: (x) => x.name,                  // optional: how to name items and options in explanations
//   });
//   result -> { ok: true, plan: [{ item, option }], cost, optimal }
//          -> { ok: false, reason, blocked: [{ item, reasons: [...] }] }
//
// plan, as passed to rules and cost, is the list of { item, option } pairs
// decided so far. A rule must only look at that list and its two arguments.
export function solveAssignment({ items, options, rules = [], cost = null, label = (x) => x.name ?? x.id ?? String(x), maxSteps = 200_000 }) {
  // 1. A request that can never be met: an item that no option may take even
  //    when nothing else is planned. Report every rule that stands in the way.
  const blocked = [];
  for (const item of items) {
    const reasons = new Set();
    let possible = false;
    for (const option of options) {
      const why = firstObjection(item, option, []);
      if (why === null) { possible = true; break; }
      reasons.add(why);
    }
    if (!possible) blocked.push({ item: label(item), reasons: options.length ? [...reasons] : ['there is nothing to assign it to'] });
  }
  if (blocked.length) {
    return { ok: false, reason: `${blocked.length} of ${items.length} cannot be placed at all.`, blocked };
  }

  // 2. Search. Hardest items first (fewest possible options), which finds
  //    dead ends early.
  const order = items
    .map((item) => ({ item, choices: options.filter((o) => firstObjection(item, o, []) === null).length }))
    .sort((a, b) => a.choices - b.choices)
    .map((x) => x.item);

  let best = null;
  let bestCost = Infinity;
  let steps = 0;
  let exhausted = true;
  let deepest = { depth: -1, item: null, reasons: [] };

  const search = (depth, plan, running) => {
    if (++steps > maxSteps) { exhausted = false; return; }
    if (depth === order.length) {
      if (running < bestCost) { best = plan.map((p) => ({ ...p })); bestCost = running; }
      return;
    }
    const item = order[depth];
    const candidates = [];
    const reasons = [];
    for (const option of options) {
      const why = firstObjection(item, option, plan);
      if (why === null) candidates.push({ option, c: cost ? cost(item, option, plan) : 0 });
      else reasons.push(why);
    }
    if (!candidates.length && depth > deepest.depth) deepest = { depth, item, reasons: [...new Set(reasons)] };
    candidates.sort((a, b) => a.c - b.c);
    for (const { option, c } of candidates) {
      if (running + c >= bestCost) continue;            // cannot beat the best plan found so far
      plan.push({ item, option });
      search(depth + 1, plan, running + c);
      plan.pop();
      if (!exhausted) return;
      if (best && !cost) return;                         // any valid plan will do
    }
  };
  search(0, [], 0);

  if (best) return { ok: true, plan: best, cost: cost ? bestCost : 0, optimal: exhausted };
  if (!exhausted) {
    return { ok: false, reason: 'No plan was found within the search limit. Try with fewer items at once.', blocked: [] };
  }
  // 3. Each item fits somewhere, but not all at the same time: the rules
  //    conflict. Name the item the search could never place and why.
  return {
    ok: false,
    reason: `The rules cannot all be met together. Every attempt got stuck at "${label(deepest.item)}".`,
    blocked: [{ item: label(deepest.item), reasons: deepest.reasons }],
  };

  function firstObjection(item, option, plan) {
    for (const rule of rules) {
      const verdict = rule(item, option, plan);
      if (verdict !== true) return typeof verdict === 'string' ? verdict : `${label(option)} is not allowed for ${label(item)}`;
    }
    return null;
  }
}
