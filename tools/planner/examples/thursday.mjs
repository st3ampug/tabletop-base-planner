// Example: my Children of the Recon against Stephen's Imperial Fists on Take and Hold vs Reconnaissance, layout 1.
// Run from the repository folder:  node tools/planner/run.mjs tools/planner/examples/thursday.mjs --out planner-out
export default async (planner, ctx) => {
  const layout = await planner.findLayout('TAH', 'REC', 1);
  await planner.setLayout(layout);

  // Import both lists. The Rhino has no size in the data, so it's given here.
  const mine = await planner.importList(ctx.read('tests/fixtures/children-of-the-recon.txt'), { army: 'friendly', sizes: { 'Chaos Rhino': 'hull 117x74' } });
  const theirs = await planner.importList(ctx.read('tests/fixtures/stephen-imperial-fists.txt'), { army: 'hostile' });
  if (!mine.ok || !theirs.ok) return { mine, theirs };
  await ctx.save('01-deployed', { caption: 'TAH v REC 1 · both armies deployed by the planner' });

  // Put the Flawless Blades 8" further forward (the top of the board is the enemy's side), on the nearest free spot.
  const fb = (await planner.units('friendly')).find(u => u.u === 'friendly:FB');
  const move = await planner.placeUnit('friendly:FB', fb.centre.x, fb.centre.y - 8*25.4, { exact: false });
  const toEnemy = await planner.measure('friendly:FB', 'hostile');
  const sight = await planner.seen('friendly:FB', { by: 'hostile' });
  await ctx.save('02-blades-forward', { caption: 'Flawless Blades 8" forward' });

  return { layout, move, closestEnemy: toEnemy, bladesSeenByHostile: sight, check: await planner.check() };
};
