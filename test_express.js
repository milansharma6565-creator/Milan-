import express from 'express';
const app = express();
app.get('*all', (req, res) => {
  res.send("MATCHED");
});
const server = app.listen(4000, () => {
  fetch('http://localhost:4000/some/random/path').then(res => {
    if (res.status === 404) console.log("FAILED MATCHING");
    else console.log("SUCCESS");
    server.close();
  });
});
