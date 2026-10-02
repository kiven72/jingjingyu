function createWindowsStartup(app, { appRoot, dataDir, name, executable = process.execPath }) {
  const options = {
    path: executable,
    args: [...(app.isPackaged ? [] : [appRoot]), '--background', `--companion-data=${dataDir}`],
  };
  const entryName = name || (app.isPackaged ? 'Coopanion' : 'Coopanion.Source');
  const { execFileSync } = require('node:child_process');
  const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const approvalKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
  // Windows quotes each argument independently; paths with spaces remain one argument.
  const quote = value => '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
  const command = [options.path, ...options.args].map(quote).join(' ');
  const literal = value => "'" + value.replace(/'/g, "''") + "'";
  const script = `$ProgressPreference = 'SilentlyContinue'; $run = Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue; $value = $run.${literal(entryName)}; $approved = Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run' -ErrorAction SilentlyContinue; $flags = $approved.${literal(entryName)}; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; @{command=$value;disabled=($flags -and (($flags[0] -band 1) -eq 1))} | ConvertTo-Json -Compress`;
  function get() {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const state = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8', windowsHide: true }));
    return state.command === command && !state.disabled;
  }
  function set(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Invalid startup value');
    const run = args => execFileSync('reg.exe', args, { windowsHide: true, stdio: 'pipe' });
    if (enabled) {
      run(['add', runKey, '/v', entryName, '/t', 'REG_SZ', '/d', command, '/f']);
      run(['add', approvalKey, '/v', entryName, '/t', 'REG_BINARY', '/d', '020000000000000000000000', '/f']);
    } else {
      // A missing entry is already disabled. Query only our own named value before deleting it.
      try { run(['query', runKey, '/v', entryName]); }
      catch (err) { if (err.status === 1) return; throw err; }
      run(['delete', runKey, '/v', entryName, '/f']);
    }
    if (get() !== enabled) throw new Error('Windows did not apply the startup setting');
  }
  return { get, set, options, name: entryName };
}

module.exports = { createWindowsStartup };
