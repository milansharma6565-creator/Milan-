import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('🚀 Initiating automated Driver APK configuration...');

// 1. Build the production web bundle
try {
  console.log('📦 Compiling web application production assets...');
  // We use build:client-like or standard vite build as per package.json scripts
  execSync('npx vite build', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Failed to compile production assets: ', error.message);
  process.exit(1);
}

// 2. Setup the Driver App Capacitor Configuration
const config = {
  appId: 'com.tankerwala.driver',
  appName: 'TankerWala Driver App',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['*']
  }
};

fs.writeFileSync('capacitor.config.json', JSON.stringify(config, null, 2));
console.log('✅ Updated capacitor.config.json for Driver App (com.tankerwala.driver).');

// 3. Inject the Driver Mode into dist/index.html so it loads instantly in native Android Webview
const indexPath = path.join(process.cwd(), 'dist', 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  
  // Inject script to override the mode
  const injection = `\n<script>window.CAPACITOR_APP_MODE = "driver"; localStorage.setItem("CAPACITOR_APP_MODE", "driver");</script>\n`;
  if (html.includes('</head>')) {
    html = html.replace('</head>', `${injection}</head>`);
  } else {
    html = html + injection;
  }
  
  fs.writeFileSync(indexPath, html);
  console.log('🔥 Injected Driver Logistics Mode successfully into production bundle!');
} else {
  console.error('❌ Could not find compiled dist/index.html to inject driver mode bootstrap!');
}

console.log('\n🌟 Setup Complete! To finish creating your Driver APK, run:');
console.log('👉 npx cap sync android');
console.log('👉 npx cap open android (This opens Android Studio to export your .apk in 1-Click!)');
