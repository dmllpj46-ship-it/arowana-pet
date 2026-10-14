// 探针：验证 skill 实际用的启动方式（electron.exe . <args>）下 --pet= 是否存活
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const EXE = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
const APP = __dirname;

// 临时把 package.json 的 main 换成探针，起完立刻还原
const probeMain = path.join(APP, '_argv_probe_main.js');
fs.writeFileSync(probeMain,
  "const { app } = require('electron');\n" +
  "app.whenReady().then(() => {\n" +
  "  console.log('ARGV=' + JSON.stringify(process.argv.slice(1)));\n" +
  "  console.log('PET_ID_ENV=' + JSON.stringify(process.env.PET_ID));\n" +
  "  console.log('PET_PIN_ENV=' + JSON.stringify(process.env.PET_PIN));\n" +
  "  app.exit(0);\n" +
  "});");

const pkg = path.join(APP, 'package.json');
const orig = fs.readFileSync(pkg, 'utf8');
fs.writeFileSync(pkg, orig.replace('"main": "main.js"', '"main": "_argv_probe_main.js"'));

const run = (args, env) => {
  const r = spawnSync(EXE, ['.'].concat(args), {
    cwd: APP, encoding: 'utf8', timeout: 40000,
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: undefined }, env)
  });
  return (r.stdout || '') + (r.stderr || '');
};

console.log('--- electron.exe . --pet=dragon --pin  (命令行写法) ---');
console.log(run(['--pet=dragon', '--pin'], { PET_ID: undefined, PET_PIN: undefined }));

console.log('--- electron.exe .  (PET_ID/PET_PIN 环境变量写法) ---');
console.log(run([], { PET_ID: 'dragon', PET_PIN: '1' }));

fs.writeFileSync(pkg, orig);
fs.unlinkSync(probeMain);
