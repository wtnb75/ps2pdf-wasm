importScripts('gs.js');

const modulePromise = createGSModule({
  // Never block on stdin (e.g. the "press <return> to continue" page
  // pause or error-recovery prompt) — return EOF immediately, the
  // equivalent of running with -dBATCH -dNOPAUSE.
  stdin: () => null,
  print: () => {},
  printErr: () => {},
});

modulePromise.then(() => {
  postMessage({ type: 'ready' });
}).catch((err) => {
  postMessage({ type: 'error', message: 'Ghostscript の初期化に失敗しました: ' + err.message });
});

// Remove all files inside `path` (creating the directory first if it
// doesn't exist yet), so leftover custom fonts/Fontmap from a previous
// conversion don't affect this one.
function clearDir(Module, path) {
  let entries;
  try {
    entries = Module.FS.readdir(path);
  } catch {
    Module.FS.mkdir(path);
    return;
  }
  for (const entry of entries) {
    if (entry === '.' || entry === '..') continue;
    Module.FS.unlink(path + '/' + entry);
  }
}

self.onmessage = async (e) => {
  if (e.data.type !== 'convert') return;

  try {
    const Module = await modulePromise;

    // Remove any files left over from a previous conversion before
    // writing the new input, so MEMFS state doesn't leak between runs.
    try { Module.FS.unlink('/input.ps'); } catch {}
    try { Module.FS.unlink('/out.pdf'); } catch {}
    clearDir(Module, '/fonts');

    Module.FS.writeFile('/input.ps', new Uint8Array(e.data.data));

    const args = [
      '-sDEVICE=pdfwrite',
      '-dNOPAUSE',
      '-dBATCH',
      '-I/lib', '-I/Resource/Init',
    ];

    // Write any user-supplied custom fonts into /fonts and register them
    // in a Fontmap there, so Ghostscript's font resolution (-I/fonts)
    // picks them up for the PostScript font names the user specified.
    const fonts = e.data.fonts || [];
    if (fonts.length > 0) {
      let fontmap = '';
      for (const font of fonts) {
        Module.FS.writeFile('/fonts/' + font.filename, new Uint8Array(font.data));
        fontmap += `/${font.name} (${font.filename}) ;\n`;
      }
      Module.FS.writeFile('/fonts/Fontmap', fontmap);
      args.push('-I/fonts');
    }

    args.push('-sOutputFile=/out.pdf', '/input.ps');

    Module.callMain(args);

    const pdfBytes = Module.FS.readFile('/out.pdf');
    const header = new TextDecoder().decode(pdfBytes.slice(0, 4));
    if (header !== '%PDF') {
      throw new Error(`変換結果が不正です (header: ${header})`);
    }

    postMessage({ type: 'result', data: pdfBytes.buffer }, [pdfBytes.buffer]);
  } catch (err) {
    postMessage({ type: 'error', message: err.message });
  }
};
