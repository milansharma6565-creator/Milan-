const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // We safely replace console.error(..., err) with String(err)
      content = content.replace(/console\.error\(([^,]+),\s*err\);/g, 'console.error($1, err instanceof Error ? err.message : String(err));');
      content = content.replace(/console\.error\(([^,]+),\s*e\);/g, 'console.error($1, e instanceof Error ? e.message : String(e));');
      content = content.replace(/console\.error\(([^,]+),\s*error\);/g, 'console.error($1, error instanceof Error ? error.message : String(error));');
      
      content = content.replace(/console\.warn\(([^,]+),\s*err\);/g, 'console.warn($1, err instanceof Error ? err.message : String(err));');
      content = content.replace(/console\.warn\(([^,]+),\s*e\);/g, 'console.warn($1, e instanceof Error ? e.message : String(e));');
      content = content.replace(/console\.warn\(([^,]+),\s*error\);/g, 'console.warn($1, error instanceof Error ? error.message : String(error));');

      fs.writeFileSync(fullPath, content, 'utf8');
    }
  }
}

processDir(path.join(__dirname, 'src'));
console.log("Console logs sanitized.");
