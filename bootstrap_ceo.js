require('dotenv').config();
const bcrypt=require('bcryptjs');
const {Pool}=require('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes('localhost')?false:{rejectUnauthorized:false}});
(async()=>{
 const username=(process.env.CEO_USERNAME||'CeoVelho').trim();
 const password=process.env.CEO_PASSWORD;
 if(!password) throw new Error('Defina CEO_PASSWORD antes de executar o bootstrap.');
 const hash=await bcrypt.hash(password,12);
 await pool.query('BEGIN');
 await pool.query('DELETE FROM users');
 const r=await pool.query('INSERT INTO users(username,password_hash,leader_badge) VALUES($1,$2,TRUE) RETURNING id', [username,hash]);
 await pool.query("INSERT INTO profiles(user_id,avatar_id) VALUES($1,1)",[r.rows[0].id]);
 await pool.query('COMMIT');
 console.log('CEO criada com emblema Líder.');
 await pool.end();
})().catch(async e=>{console.error(e);try{await pool.query('ROLLBACK');}catch{}await pool.end();process.exit(1)});
