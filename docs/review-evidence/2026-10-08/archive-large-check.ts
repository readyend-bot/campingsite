import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { archivePlan, validateState } from '/Users/bj/Desktop/03_Private/camping site/src/domain.ts';
const require = createRequire('/Users/bj/Desktop/03_Private/camping site/package.json');
const { Repository } = require('/Users/bj/Desktop/03_Private/camping site/electron/repository.cjs');
async function main() {
  const state = JSON.parse(fs.readFileSync('/private/tmp/sopung-joint-large-fixture.json','utf8'));
  validateState(state);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'sopung-joint-archive-large-'));
  try {
    const begin = performance.now();
    const plan = await archivePlan(state,'2026-10-08T17:00:00');
    validateState(plan.next);
    const archived = plan.files.map(f => JSON.parse(f.text));
    const normalized = (rows: any[]) => JSON.parse(JSON.stringify([...rows].sort((a,b) => a.id.localeCompare(b.id))));
    assert.deepEqual(normalized([...plan.next.reservations,...archived.flatMap(f=>f.reservations)]),normalized(state.reservations));
    assert.deepEqual(normalized([...plan.next.allocations,...archived.flatMap(f=>f.allocations)]),normalized(state.allocations));
    const repo = new Repository(path.join(directory,'data'),path.join(directory,'backup'));
    repo.save(state);
    repo.commitArchive(plan.next,plan.files);
    repo.backup();
    assert.equal(repo.searchArchives('가상').total,state.reservations.length);
    console.log(JSON.stringify({reservations:state.reservations.length,allocations:state.allocations.length,
      beforeBytes:Buffer.byteLength(JSON.stringify(state)),afterBytes:fs.statSync(repo.file).size,
      archiveFiles:plan.files.length,archiveBytes:plan.refs.reduce((sum,x)=>sum+x.bytes,0),
      elapsedMs:Math.round(performance.now()-begin),allSavedFieldsPreserved:true,searchTotal:state.reservations.length}));
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
}
main().catch(error => { console.error(error);process.exitCode=1; });
