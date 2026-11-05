const { port, adminName, adminEmail, adminPassword } = require('./config/env');
const { connect } = require('./config/database');
const app = require('./app');
const authRepository = require('./modules/auth/auth.repository');

async function start() {
  await connect();
  await authRepository.initializeAdmin({ name: adminName, email: adminEmail, password: adminPassword });
  app.listen(port, () => console.log(`QueueSmart API listening on port ${port}`));
}

start().catch((error) => {
  console.error('Could not start QueueSmart API', error);
  process.exitCode = 1;
});
