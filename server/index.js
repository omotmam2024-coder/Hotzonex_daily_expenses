// Local / desktop launcher: start the HTTP server after the schema is ready.
import { app, ready } from './app.js';

const PORT = process.env.PORT || 4100;
await ready;
app.listen(PORT, () => console.log(`Hotzonex Expenses running on http://localhost:${PORT}`));
