const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const root = '/Users/bj/Desktop/03_Private/camping site';
const { Repository } = require(path.join(root, 'electron/repository.cjs'));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sopung-joint-node16-'));
try {
  const original = JSON.parse(fs.readFileSync('/private/tmp/sopung-joint-large-fixture.json', 'utf8'));
  const records = Array.from({length: 230}, (_, i) => ({
    ...original.reservations[0], id: `joint-archive-${i}`, externalId: `JOINT-${i}`,
    name: `가상 보관 손님 ${String(i).padStart(3, '0')}`,
  }));
  const text = JSON.stringify({format:'sopung-archive', version:1, year:2020,
    reservations: records, allocations:[], activity:[]});
  const ref = {file:'sopung-archive-2020-jointnative-1.json', year:2020,
    reservations:records.length, allocations:0, activity:0,
    bytes:Buffer.byteLength(text), sha256:crypto.createHash('sha256').update(text).digest('hex')};
  const state = {...original, reservations:[], allocations:[], changes:[], activity:[], archives:[ref]};
  const repo = new Repository(path.join(directory,'data'), path.join(directory,'backups'));
  repo.commitArchive(state, [{file:ref.file, text}]);
  const backed = path.join(repo.backupPath,'archive',ref.file);
  assert.equal(fs.readFileSync(backed,'utf8'),text);
  fs.unlinkSync(backed);
  repo.dailyBackup();
  assert.equal(fs.readFileSync(backed,'utf8'),text);
  const first = repo.searchArchives('가상 보관',0);
  const second = repo.searchArchives('가상 보관',100);
  const third = repo.searchArchives('가상 보관',200);
  assert.equal(first.total,230);
  assert.equal(first.results.length,100);
  assert.equal(third.results.length,30);
  assert.deepEqual(
    [...first.results,...second.results,...third.results].map(x=>x.reservation.id).sort(),
    records.map(x=>x.id).sort(),
  );
  assert.equal(repo.lookupArchives([[records[229].source,'JOINT-229']]).length,1);
  const backupFile = repo.backup();
  const archiveFile = path.join(repo.archiveDir,ref.file);
  const broken = 'x'.repeat(ref.bytes);
  fs.writeFileSync(archiveFile,broken);
  const before = fs.readFileSync(repo.file,'utf8');
  let picked = repo.inspectBackup(backupFile);
  const restore = repo.restore.bind(repo);
  repo.restore = () => { throw new Error('독립 검증: 본 파일 교체 실패'); };
  assert.throws(()=>repo.restoreBackup(picked.token),/본 파일 교체 실패/);
  repo.restore = restore;
  assert.equal(fs.readFileSync(repo.file,'utf8'),before);
  assert.equal(fs.readFileSync(archiveFile,'utf8'),broken);
  picked = repo.inspectBackup(backupFile);
  repo.restoreBackup(picked.token);
  assert.equal(fs.readFileSync(archiveFile,'utf8'),text);
  assert.equal(repo.searchArchives('가상 보관',200).results.length,30);
  assert.ok(fs.readdirSync(repo.archiveDir).some(n=>n.startsWith('replaced-')));
  const exported = repo.exportBackup(path.join(directory,'export'));
  const main = fs.readdirSync(exported).find(n=>n.endsWith('.json'));
  const fresh = new Repository(path.join(directory,'fresh'),path.join(directory,'fresh-backups'));
  picked = fresh.inspectBackup(path.join(exported,main));
  fresh.restoreBackup(picked.token);
  assert.equal(fresh.searchArchives('가상 보관',200).results.length,30);
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const photoOnly = new Repository(path.join(directory,'photo-only'),path.join(directory,'photo-backups'));
  const photoRef = photoOnly.saveAerial(photo);
  photoOnly.save({...state,archives:[],settings:{...state.settings,aerial:photoRef}});
  assert.equal(photoOnly.readAerial(photoRef),photo);
  const photoExport = photoOnly.exportBackup(path.join(directory,'photo-export'));
  const photoJSON = fs.readdirSync(photoExport).find(n=>n.endsWith('.json'));
  const photoFresh = new Repository(path.join(directory,'photo-fresh'),path.join(directory,'photo-fresh-backups'));
  const photoPick = photoFresh.inspectBackup(path.join(photoExport,photoJSON));
  photoFresh.restoreBackup(photoPick.token);
  assert.equal(photoFresh.readAerial(photoFresh.load().settings.aerial),photo);
  console.log(JSON.stringify({engine:process.versions.electron||'node', node:process.versions.node,
    checks:['누락된 백업 사본 재생성','보관 검색 201번째 이후 접근','손상 파일 복구와 실패 원복','폴더 내보내기·새 PC 복원','사진만 있는 백업의 새 PC 복원'],
    reservations:230, result:'통과'}));
} finally {
  fs.rmSync(directory,{recursive:true,force:true});
}
