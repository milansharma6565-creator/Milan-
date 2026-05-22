const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

const targetDir = path.join(__dirname, 'src');

walk(targetDir, (filePath) => {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;

  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Pattern 1: console.error("msg", err) or console.warn("msg", err)
  // Replaces the second argument if it looks like an error variable (err, e, error)
  content = content.replace(/(console\.(error|warn|log)\([^,]+,\s*)(err|e|error)(\);)/g, '$1$3 instanceof Error ? $3.message : String($3)$4');

  // Pattern 2: console.error("msg", err?.message || err)
  content = content.replace(/(console\.(error|warn|log)\([^,]+,\s*)(err|e|error)\?\.message \|\| (err|e|error)(\);)/g, '$1$3 instanceof Error ? $3.message : String($3)$5');

  // Pattern 3: .catch(e => console.log(e))
  content = content.replace(/(\.catch\(\s*)(err|e|error)(\s*=>\s*console\.(log|error|warn)\()(\2)(\)\))/g, '$1$2$3$2 instanceof Error ? $2.message : String($2)$6');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed: ${filePath}`);
  }
});
