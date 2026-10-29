const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', '-c', `
import importlib.util, io, time, tempfile, pathlib
spec=importlib.util.spec_from_file_location('relay','relay/server_local.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sid='11111111-1111-4111-8111-111111111111'
with tempfile.TemporaryDirectory() as tmp:
 m.STORAGE_FILE=str(pathlib.Path(tmp)/'storage.json')
 item={'ciphertext':'fictional','expires_at':time.time()+600,'is_burn':True}
 m.STORAGE={sid:item}; m.save_storage(m.STORAGE)
 original=m.save_storage
 def fail(data): raise OSError('synthetic disk failure')
 def read():
  h=object.__new__(m.SafeShareHandler); h.path='/api/share/'+sid; h.client_address=('127.0.0.1',1); h.wfile=io.BytesIO(); statuses=[]
  h._send_cors=lambda status=200,content_type='application/json':statuses.append(status)
  h.do_GET(); return statuses[0],h.wfile.getvalue()
 m.save_storage=fail
 status,body=read(); assert status==500 and b'fictional' not in body
 assert sid in m.STORAGE and sid in m.load_storage()
 m.save_storage=original
 assert read()[0]==200
 m.STORAGE=m.load_storage()
 assert read()[0]==404
 m.STORAGE={sid:{**item,'expires_at':time.time()-1}}
 m.save_storage(m.STORAGE)
 assert read()[0]==404
 pathlib.Path(m.STORAGE_FILE).write_text('{broken')
 try: m.load_storage()
 except ValueError: pass
 else: raise AssertionError('corrupt storage accepted')
 print('Relay persistence: failed burn sends no ciphertext; retry/restart and corrupt storage checked')
`], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stdout + result.stderr);
console.log(result.stdout.trim());
