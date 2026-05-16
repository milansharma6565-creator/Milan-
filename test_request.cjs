const http = require('http');

http.get('http://localhost:3000', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response code:', res.statusCode));
}).on('error', (err) => {
  console.error('Request failed:', err);
});
