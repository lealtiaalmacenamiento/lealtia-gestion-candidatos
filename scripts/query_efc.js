const { Client } = require('pg');

const conns = {
  dev: 'postgresql://postgres:AnimalSMF98%401@db.wqutrjnxvcgmyyiyjmsd.supabase.co:5432/postgres',
  main: 'postgresql://postgres:AnimalSMF98%401@db.oooyuomshachmmblmpvd.supabase.co:5432/postgres'
};

const q = `
select id, efc, periodo_para_ingresar_folio_oficina_virtual, periodo_para_playbook,
       pre_escuela_sesion_unica_de_arranque, fecha_limite_para_presentar_curricula_cdp,
       inicio_escuela_fundamental
from efc
order by id`;

(async () => {
  for (const [name, cs] of Object.entries(conns)) {
    const c = new Client({ connectionString: cs });
    await c.connect();
    const { rows } = await c.query(q);
    console.log(`\n=== ${name.toUpperCase()} EFC ===`);
    rows.forEach(r => console.log(r));
    await c.end();
  }
})().catch(err => { console.error(err); process.exit(1); });
