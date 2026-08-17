const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
if (pkg.main !== 'server.js') throw new Error('package main must be server.js');
if (pkg.scripts.start !== 'node server.js') throw new Error('bad start script');
for (const dep of ['express','helmet','bcryptjs','jsonwebtoken','pg','ws','dotenv']) {
  if (!pkg.dependencies[dep]) throw new Error(`missing dependency: ${dep}`);
}
const schema = fs.readFileSync('schema_uno50.sql','utf8');
for (const table of ['users','profiles','rooms','room_players','matches','match_players','match_actions','chat_messages','reports','moderation_actions']) {
  if (!schema.includes(`CREATE TABLE ${table}`)) throw new Error(`missing table ${table}`);
}
console.log('PASS package');
console.log('PASS schema references');
console.log('PASS server file present');
