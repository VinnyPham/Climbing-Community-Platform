const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const env = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .reduce((acc, line) => {
    const idx = line.indexOf('=');
    if (idx < 0) return acc;
    acc[line.slice(0, idx)] = line.slice(idx + 1);
    return acc;
  }, {});
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
(async () => {
  console.log('env loaded', Object.keys(env));
  for (const s of ['*', 'id', 'name', 'grade', 'color', 'wall_section', 'pin_x', 'pin_y', 'is_active', 'set_date']) {
    try {
      const { data, error } = await supabase.from('routes').select(s).limit(1);
      console.log('select', s, 'error', error ? error.message : 'ok', 'data', data);
    } catch (err) {
      console.error('select', s, 'exception', err.message);
    }
  }
})();
