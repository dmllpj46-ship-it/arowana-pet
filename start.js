/*
 * 启动器：清理 ELECTRON_RUN_AS_NODE 后再拉起 electron.exe
 * 某些终端（例如 Electron 应用自带的内嵌终端）会带上这个变量，
 * 导致 electron.exe 退化成纯 Node 运行、require('electron') 拿不到 app。
 */
const { spawn } = require('node:child_process');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], { cwd: __dirname, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code === null ? 1 : code));
