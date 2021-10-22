import mojo from '@mojojs/core';

const app = mojo();

app.post('/gateway/sync').to('gateway#sync');
app.post('/domain/customize').to('domain#customize');
app.post('/domain/sync').to('domain#sync');

app.start();
