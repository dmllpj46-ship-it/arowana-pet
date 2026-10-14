/*
 * 启动器：清理 ELECTRON_RUN_AS_NODE 后再拉起 electron.exe
 * 某些终端（例如 Electron 应用自带的内嵌终端）会带上这个变量，
 * 导致 electron.exe 退化成纯 Node 运行、require('electron') 拿不到 app。
 *
 * 参数转发：--pet=dragon / --pin 翻成环境变量再透传给主进程。
 * 不能把 --pet 原样塞进 electron 的参数列表：那些开关会先过 Chromium 一遍，
 * 不认识的会被吃掉，主进程的 process.argv 里根本看不到。
 * 所以这里只认 --pet=/--pet、--pin，其它参数照原样转发。
 */
const { spawn } = require('node:child_process');
const electronPath = require('electron');

const forward = [];
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--pet' && process.argv[i + 1]) {
    env.PET_ID = process.argv[++i];
  } else if (a.indexOf('--pet=') === 0) {
    env.PET_ID = a.slice('--pet='.length);
  } else if (a === '--pin') {
    env.PET_PIN = '1';
  } else {
    forward.push(a);
  }
}

const child = spawn(electronPath, ['.'].concat(forward), { cwd: __dirname, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code === null ? 1 : code));
